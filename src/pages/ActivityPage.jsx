import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Coffee, Heart, Image as ImageIcon, MessageCircle, MoreHorizontal, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import HalfStarRating from '../components/HalfStarRating';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';

const fallbackAvatar = (seed) => `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(seed || 'coffee-user')}`;

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
            <img src={image.public_url} alt={`${cafeName || 'Publicación'}, foto ${index + 1} de ${images.length}`} />
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPosts = useCallback(async () => {
    setLoading(true);
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
      const cafeMap = new Map((cafes || []).map((cafe) => [cafe.id, cafe]));
      const imagesByPost = new Map();
      (imageRows || []).forEach((image) => imagesByPost.set(image.post_id, [...(imagesByPost.get(image.post_id) || []), image]));
      setPosts(orderedPostRows.map((post) => ({
        ...post,
        profile: profileMap.get(post.user_id),
        cafe: cafeMap.get(post.cafe_id),
        images: imagesByPost.get(post.id) || (post.image_url ? [{ id: `${post.id}:legacy`, public_url: post.image_url }] : []),
      })));
    } catch (loadError) {
      setError(loadError.message?.includes('relation') || loadError.code === 'PGRST204'
        ? 'Falta aplicar la actualización social en Supabase.'
        : 'No se pudo cargar la actividad.');
    } finally {
      setLoading(false);
    }
  }, [userIdFilter]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  return (
    <>
      {!compact && <header className="activity-header"><span>Comunidad Mérida</span><button type="button" onClick={loadPosts} className="activity-refresh">Actualizar</button></header>}
      <div className={`activity-feed ${compact ? 'is-compact' : ''}`}>
        {loading && <div className="activity-empty"><Coffee size={28} /><p>Cargando actividad…</p></div>}
        {!loading && error && <div className="activity-empty"><p>{error}</p></div>}
        {!loading && !error && posts.length === 0 && <div className="activity-empty"><ImageIcon size={30} /><p>Aún no hay publicaciones en la comunidad.</p></div>}
        {posts.map((post) => {
          const name = post.profile?.username || (post.user_id === user.id ? 'Tú' : 'Coffee lover');
          const avatar = post.profile?.avatar_url || fallbackAvatar(name);
          return (
            <article className="activity-post" key={post.id}>
              <PostHeader avatar={avatar} name={name} date={post.visited_on || post.created_at} />
              {post.cafe?.nombre && <button type="button" className="activity-cafe-link" onClick={() => navigate(`/cafe/${post.cafe_id}`)}>{post.cafe.nombre}</button>}
              {Number(post.rating) > 0 && <div className="activity-rating"><HalfStarRating value={Number(post.rating)} readOnly size={17} /><span>{Number(post.rating).toFixed(1)}</span></div>}
              {post.content && <p className="activity-post-copy">{post.content}</p>}
              {post.images.length > 0 && <PostImageCarousel images={post.images} cafeName={post.cafe?.nombre} />}
              <div className="activity-post-actions"><Heart size={18} /><MessageCircle size={18} /><Send size={17} /></div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function ActivityPage() {
  return <main className="social-page activity-page"><div className="social-shell activity-shell"><ActivityFeed /></div><BottomNav /></main>;
}

function PostHeader({ avatar, name, date }) {
  const formattedDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(date));
  return <div className="activity-post-header"><img src={avatar} alt="" /><span>{name}</span><small>{formattedDate}</small><MoreHorizontal size={16} /></div>;
}

export default ActivityPage;
