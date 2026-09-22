import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Coffee, Heart, Image as ImageIcon, MessageCircle, MoreHorizontal, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import HalfStarRating from '../components/HalfStarRating';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { repairCafeText } from '../utils/cafeDeduplication';

const fallbackAvatar = (seed) => `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(seed || 'coffee-user')}`;
const ACTIVITY_CACHE_TTL_MS = 2 * 60 * 1000;
const activityCache = new Map();

function PostImageCarousel({ images, cafeName }) {
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasMultipleImages = images.length > 1;

  const updateActiveIndex = () => {
    const track = trackRef.current;
    if (!track?.clientWidth) return;
    setActiveIndex(Math.max(0, Math.min(images.length - 1, Math.round(track.scrollLeft / track.clientWidth))));
  };

  const showImage = (index) => {
    const nextIndex = Math.max(0, Math.min(images.length - 1, index));
    trackRef.current?.scrollTo({ left: nextIndex * trackRef.current.clientWidth, behavior: 'smooth' });
    setActiveIndex(nextIndex);
  };

  return (
    <section className="activity-image-carousel" aria-roledescription="carrusel" aria-label={`Fotos de ${cafeName || 'la publicación'}`}>
      <div className="activity-image-track" ref={trackRef} onScroll={updateActiveIndex}>
        {images.map((image, index) => (
          <div className="activity-image-slide" role="group" aria-roledescription="diapositiva" aria-label={`${index + 1} de ${images.length}`} key={image.id}>
            <img src={image.public_url} alt={`${cafeName || 'Publicación'}, foto ${index + 1} de ${images.length}`} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />
          </div>
        ))}
      </div>

      {hasMultipleImages && (
        <>
          <span className="activity-image-counter" aria-live="polite">{activeIndex + 1}/{images.length}</span>
          {activeIndex > 0 && <button type="button" className="activity-carousel-button is-previous" onClick={() => showImage(activeIndex - 1)} aria-label="Ver foto anterior"><ChevronLeft size={18} /></button>}
          {activeIndex < images.length - 1 && <button type="button" className="activity-carousel-button is-next" onClick={() => showImage(activeIndex + 1)} aria-label="Ver foto siguiente"><ChevronRight size={18} /></button>}
          <div className="activity-carousel-dots" aria-hidden="true">
            {images.map((image, index) => <span className={index === activeIndex ? 'is-active' : ''} key={image.id} />)}
          </div>
        </>
      )}
    </section>
  );
}

export function ActivityFeed({ userIdFilter = null, compact = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [socialByPost, setSocialByPost] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches
  ));

  const loadPosts = useCallback(async () => {
    const cacheKey = userIdFilter || 'all';
    const cached = activityCache.get(cacheKey);
    const hasFreshCache = cached && Date.now() - cached.savedAt < ACTIVITY_CACHE_TTL_MS;
    if (hasFreshCache) {
      setPosts(cached.posts);
      setSocialByPost(cached.socialByPost);
    }
    setLoading(!hasFreshCache);
    setError('');
    try {
      let postsQuery = supabase
        .from('posts')
        .select('id,user_id,cafe_id,content,image_url,kind,rating,visited_on,created_at,updated_at')
        .eq('status', 'published')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(60);

      if (userIdFilter) postsQuery = postsQuery.eq('user_id', userIdFilter);

      const { data: postRows, error: postError } = await postsQuery;
      if (postError) throw postError;

      const orderedPostRows = [...(postRows || [])].sort((first, second) => (
        String(second.updated_at || second.created_at || '').localeCompare(String(first.updated_at || first.created_at || ''))
        || String(second.created_at || '').localeCompare(String(first.created_at || ''))
        || String(second.id).localeCompare(String(first.id))
      ));
      const userIds = [...new Set(orderedPostRows.map((post) => post.user_id))];
      const cafeIds = [...new Set(orderedPostRows.map((post) => post.cafe_id).filter(Boolean))];
      const postIds = orderedPostRows.map((post) => post.id);
      const [{ data: profiles }, { data: cafes }, { data: imageRows }] = await Promise.all([
        userIds.length ? supabase.from('profiles').select('id,username,avatar_url').in('id', userIds) : { data: [] },
        cafeIds.length ? supabase.from('cafes').select('id,nombre').in('id', cafeIds) : { data: [] },
        postIds.length ? supabase.from('post_images').select('id,post_id,public_url,position').in('post_id', postIds).order('position') : { data: [] },
      ]);
      const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const cafeMap = new Map((cafes || []).map((cafe) => [cafe.id, { ...cafe, nombre: repairCafeText(cafe.nombre) }]));
      const imagesByPost = new Map();
      (imageRows || []).forEach((image) => imagesByPost.set(image.post_id, [...(imagesByPost.get(image.post_id) || []), image]));
      let nextSocial = {};
      if (postIds.length) {
        const [{ data: likes }, { data: comments }] = await Promise.all([
          supabase.from('post_likes').select('post_id,user_id').in('post_id', postIds),
          supabase.from('post_comments').select('id,post_id').in('post_id', postIds),
        ]);
        nextSocial = Object.fromEntries(postIds.map((postId) => [postId, { likes: 0, comments: 0, liked: false }]));
        (likes || []).forEach((like) => {
          nextSocial[like.post_id].likes += 1;
          if (like.user_id === user.id) nextSocial[like.post_id].liked = true;
        });
        (comments || []).forEach((comment) => { nextSocial[comment.post_id].comments += 1; });
        setSocialByPost(nextSocial);
      }
      const nextPosts = orderedPostRows.map((post) => ({
        ...post,
        profile: profileMap.get(post.user_id),
        cafe: cafeMap.get(post.cafe_id),
        images: imagesByPost.get(post.id) || (post.image_url ? [{ id: `${post.id}:legacy`, public_url: post.image_url }] : []),
      }));
      activityCache.set(cacheKey, { savedAt: Date.now(), posts: nextPosts, socialByPost: nextSocial });
      setPosts(nextPosts);
    } catch (loadError) {
      setError(loadError.message?.includes('relation') || loadError.code === 'PGRST204'
        ? 'Falta aplicar la actualización social en Supabase.'
        : 'No se pudo cargar la actividad.');
    } finally {
      setLoading(false);
    }
  }, [user.id, userIdFilter]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 900px)');
    const updateLayout = (event) => setIsDesktop(event.matches);
    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener('change', updateLayout);
    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  const toggleLike = async (postId) => {
    const current = socialByPost[postId] || { likes: 0, comments: 0, liked: false };
    setSocialByPost((social) => ({
      ...social,
      [postId]: { ...current, liked: !current.liked, likes: Math.max(0, current.likes + (current.liked ? -1 : 1)) },
    }));
    const request = current.liked
      ? supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id)
      : supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
    const { error: likeError } = await request;
    if (likeError) {
      setSocialByPost((social) => ({ ...social, [postId]: current }));
      window.alert('No se pudo guardar el like. Verifica que la migración social esté aplicada.');
    }
  };

  const addComment = async (postId) => {
    const content = window.prompt('Escribe tu comentario:')?.trim();
    if (!content) return;
    const { error: commentError } = await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: user.id,
      content: content.slice(0, 500),
    });
    if (commentError) {
      window.alert('No se pudo publicar el comentario. Verifica que la migración social esté aplicada.');
      return;
    }
    setSocialByPost((social) => ({
      ...social,
      [postId]: { ...(social[postId] || { likes: 0, liked: false }), comments: (social[postId]?.comments || 0) + 1 },
    }));
  };

  const sharePost = async (post) => {
    const url = `${window.location.origin}/activity#post-${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: post.cafe?.nombre || 'Coffee Map', text: post.content || 'Mira esta publicación', url });
      else {
        await navigator.clipboard.writeText(url);
        window.alert('Enlace copiado.');
      }
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') window.alert('No se pudo compartir la publicación.');
    }
  };

  const renderPost = (post) => {
    const name = post.profile?.username || (post.user_id === user.id ? 'Tú' : 'Coffee lover');
    const avatar = post.profile?.avatar_url || fallbackAvatar(name);
    const social = socialByPost[post.id] || { likes: 0, comments: 0, liked: false };
    return (
      <article className="activity-post" id={`post-${post.id}`} key={post.id}>
        <PostHeader avatar={avatar} name={name} date={post.visited_on || post.created_at} onOpenProfile={() => navigate(post.user_id === user.id ? '/profile' : `/profile/${post.user_id}`)} />
        {post.cafe?.nombre && <button type="button" className="activity-cafe-link" onClick={() => navigate(`/cafe/${post.cafe_id}`)}>{post.cafe.nombre}</button>}
        {Number(post.rating) > 0 && <div className="activity-rating"><HalfStarRating value={Number(post.rating)} readOnly size={17} /><span>{Number(post.rating).toFixed(1)}</span></div>}
        {post.content && <p className="activity-post-copy">{post.content}</p>}
        {post.images.length > 0 && <PostImageCarousel images={post.images} cafeName={post.cafe?.nombre} />}
        <div className="activity-post-actions">
          <button type="button" className={social.liked ? 'is-active' : ''} onClick={() => toggleLike(post.id)} aria-label={social.liked ? 'Quitar me gusta' : 'Me gusta'}><Heart size={18} fill={social.liked ? 'currentColor' : 'none'} />{social.likes > 0 && <span>{social.likes}</span>}</button>
          <button type="button" onClick={() => addComment(post.id)} aria-label="Comentar"><MessageCircle size={18} />{social.comments > 0 && <span>{social.comments}</span>}</button>
          <button type="button" onClick={() => sharePost(post)} aria-label="Compartir"><Send size={17} /></button>
        </div>
      </article>
    );
  };

  return (
    <>
      {!compact && <header className="activity-header"><span>Comunidad Mérida</span><button type="button" onClick={loadPosts} className="activity-refresh">Actualizar</button></header>}
      <div className={`activity-feed ${compact ? 'is-compact' : ''}`}>
        {loading && <div className="activity-empty"><Coffee size={28} /><p>Cargando actividad…</p></div>}
        {!loading && error && <div className="activity-empty"><p>{error}</p></div>}
        {!loading && !error && posts.length === 0 && <div className="activity-empty"><ImageIcon size={30} /><p>Aún no hay publicaciones en la comunidad.</p></div>}
        {!loading && !error && posts.length > 0 && (isDesktop ? (
          <>
            <div className="activity-feed-column">{posts.filter((_, index) => index % 2 === 0).map(renderPost)}</div>
            <div className="activity-feed-column">{posts.filter((_, index) => index % 2 === 1).map(renderPost)}</div>
          </>
        ) : posts.map(renderPost))}
      </div>
    </>
  );
}

function ActivityPage() {
  return <main className="social-page activity-page"><div className="social-shell activity-shell"><ActivityFeed /></div><BottomNav /></main>;
}

function PostHeader({ avatar, name, date, onOpenProfile }) {
  const formattedDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(date));
  return <div className="activity-post-header"><button type="button" className="activity-author" onClick={onOpenProfile}><img src={avatar} alt="" /><span>{name}</span></button><small>{formattedDate}</small><MoreHorizontal size={16} /></div>;
}

export default ActivityPage;
