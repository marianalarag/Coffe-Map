import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Coffee, Edit3, Heart, Image as ImageIcon, ImagePlus, MessageCircle, MoreHorizontal, Send, Trash2, UserPlus, Users, X, MapPin } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { CoffeeBeanRating } from '../components/CoffeeBeanIcon';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { repairCafeText } from '../utils/cafeDeduplication';
import { formatRating } from '../utils/formatRating';
import { useCoffeeData } from '../context/CoffeeDataContext';
import HalfStarRating from '../components/HalfStarRating';
import PostPhoto from '../components/PostPhoto';
import { editPublication } from '../utils/editPublication';
import { compareActivityDates } from '../utils/activityDate';

const fallbackAvatar = (seed) => `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(seed || 'coffee-user')}`;
const getActivityAvatar = (url) => url || '';
const ACTIVITY_CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_EDIT_PHOTO_BYTES = 8 * 1024 * 1024;
const activityCache = new Map();

function PostImageCarousel({ images, cafeName }) {
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState(null);
  const hasMultipleImages = images.length > 1;

  useEffect(() => {
    if (viewerIndex === null) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setViewerIndex(null);
      if (event.key === 'ArrowRight') setViewerIndex((index) => Math.min(images.length - 1, index + 1));
      if (event.key === 'ArrowLeft') setViewerIndex((index) => Math.max(0, index - 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [images.length, viewerIndex]);

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
            <button type="button" className="activity-image-open" onClick={() => setViewerIndex(index)} aria-label={`Abrir foto ${index + 1} en pantalla completa`}><PostPhoto image={image} alt={`${cafeName || 'Publicación'}, foto ${index + 1} de ${images.length}`} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" /></button>
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
      {viewerIndex !== null && (
        <div className="activity-image-viewer" role="dialog" aria-modal="true" aria-label="Imagen de la publicación en pantalla completa" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewerIndex(null); }}>
          <header><span>{viewerIndex + 1} / {images.length}</span><button type="button" onClick={() => setViewerIndex(null)} aria-label="Cerrar imagen"><X size={22} /></button></header>
          {viewerIndex > 0 && <button type="button" className="activity-viewer-arrow is-previous" onClick={() => setViewerIndex((index) => index - 1)} aria-label="Imagen anterior"><ChevronLeft size={28} /></button>}
          <img className="activity-image-viewer-photo" src={images[viewerIndex]?.public_url} alt={`${cafeName || 'Publicación'}, foto ${viewerIndex + 1} de ${images.length}`} />
          {viewerIndex < images.length - 1 && <button type="button" className="activity-viewer-arrow is-next" onClick={() => setViewerIndex((index) => index + 1)} aria-label="Siguiente imagen"><ChevronRight size={28} /></button>}
        </div>
      )}
    </section>
  );
}

export function ActivityFeed({ userIdFilter = null, userIdsFilter = null, kindFilter = null, compact = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [socialByPost, setSocialByPost] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentPost, setCommentPost] = useState(null);
  const [commentRows, setCommentRows] = useState([]);
  const [commentProfiles, setCommentProfiles] = useState({});
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [postMenuId, setPostMenuId] = useState(null);
  const location = useLocation();
  const { cafes, interactions, refreshUserInteractions } = useCoffeeData();
  const [editCafeId, setEditCafeId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editRating, setEditRating] = useState(0);
  const [editFavorite, setEditFavorite] = useState(false);
  const [editRevisit, setEditRevisit] = useState(false);
  const [editPhotos, setEditPhotos] = useState([]);
  const [editingPost, setEditingPost] = useState(null);
  const [editText, setEditText] = useState('');
  const [editFeedback, setEditFeedback] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const editFileInputRef = useRef(null);
  const loadVersionRef = useRef(0);

  const loadPosts = useCallback(async () => {
    const loadVersion = ++loadVersionRef.current;
    const cacheKey = `${user.id}:${kindFilter || 'all'}:${userIdFilter || (Array.isArray(userIdsFilter) ? `users:${userIdsFilter.slice().sort().join(',')}` : 'all')}`;
    const cached = activityCache.get(cacheKey);
    const hasFreshCache = cached && Date.now() - cached.savedAt < ACTIVITY_CACHE_TTL_MS;
    if (hasFreshCache) {
      setPosts(cached.posts);
      setSocialByPost(cached.socialByPost);
    }
    setLoading(!hasFreshCache);
    setError('');
    try {
      if (Array.isArray(userIdsFilter) && userIdsFilter.length === 0) {
        setPosts([]);
        setSocialByPost({});
        setLoading(false);
        return;
      }

      let postsQuery = supabase
        .from('posts')
        .select('id,user_id,cafe_id,content,image_url,kind,rating,visited_on,is_revisit,interaction_id,created_at,updated_at')
        .eq('status', 'published')
        .order('activity_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(60);

      if (userIdFilter) postsQuery = postsQuery.eq('user_id', userIdFilter);
      if (Array.isArray(userIdsFilter)) postsQuery = postsQuery.in('user_id', userIdsFilter);
      if (kindFilter) postsQuery = postsQuery.eq('kind', kindFilter);

      const { data: postRows, error: postError } = await postsQuery;
      if (postError) throw postError;

      const orderedPostRows = [...(postRows || [])].sort(compareActivityDates);
      const userIds = [...new Set(orderedPostRows.map((post) => post.user_id))];
      const cafeIds = [...new Set(orderedPostRows.map((post) => post.cafe_id).filter(Boolean))];
      const postIds = orderedPostRows.map((post) => post.id);
      const [{ data: profiles }, { data: cafes }, { data: imageRows }] = await Promise.all([
        userIds.length ? supabase.from('profiles').select('id,username,avatar_url').in('id', userIds) : { data: [] },
        cafeIds.length ? supabase.from('cafes').select('id,nombre').in('id', cafeIds) : { data: [] },
        postIds.length ? supabase.from('post_images').select('id,post_id,public_url,position,storage_path').in('post_id', postIds).order('position') : { data: [] },
      ]);
      const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const cafeMap = new Map((cafes || []).map((cafe) => [cafe.id, { ...cafe, nombre: repairCafeText(cafe.nombre) }]));
      const imagesByPost = new Map();
      (imageRows || []).forEach((image) => imagesByPost.set(image.post_id, [...(imagesByPost.get(image.post_id) || []), image]));
      let nextSocial = {};
      if (postIds.length) {
        const [{ data: likes }, { data: comments }, { data: friendshipRows }] = await Promise.all([
          supabase.from('post_likes').select('post_id,user_id').in('post_id', postIds),
          supabase.from('post_comments').select('id,post_id').in('post_id', postIds),
          supabase.from('friendships').select('requester_id,addressee_id').eq('status', 'accepted'),
        ]);
        const friendIds = new Set((friendshipRows || []).map((row) => (
          row.requester_id === user.id ? row.addressee_id : row.requester_id
        )).filter(Boolean));
        const likedFriendIds = [...new Set((likes || []).map((like) => like.user_id))]
          .filter((userId) => friendIds.has(userId));
        if (likedFriendIds.length) {
          const { data: likedFriendProfiles } = await supabase
            .from('profiles')
            .select('id,username,avatar_url')
            .in('id', likedFriendIds);
          (likedFriendProfiles || []).forEach((profile) => profileMap.set(profile.id, profile));
        }
        nextSocial = Object.fromEntries(postIds.map((postId) => [postId, { likes: 0, comments: 0, liked: false, likeProfiles: [] }]));
        (likes || []).forEach((like) => {
          nextSocial[like.post_id].likes += 1;
          if (like.user_id === user.id) nextSocial[like.post_id].liked = true;
        });
        postIds.forEach((postId) => {
          nextSocial[postId].likeProfiles = likedFriendIds
            .map((likedFriendId) => profileMap.get(likedFriendId))
            .filter(Boolean)
            .slice(0, 3);
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
      let waitlistRows = [];
      if (userIdFilter === user.id) {
        const { data: ownRows } = await supabase
          .from('user_cafes')
          .select('id,user_id,cafe_id,updated_at,cafe:cafes(id,nombre,image_url,neighborhood)')
          .eq('user_id', user.id)
          .eq('in_waitlist', true)
          .order('updated_at', { ascending: false })
          .limit(60);
        waitlistRows = (ownRows || []).map((row) => ({ ...row, username: profileMap.get(user.id)?.username || user.user_metadata?.username || 'Tú', avatar_url: profileMap.get(user.id)?.avatar_url }));
      } else if (Array.isArray(userIdsFilter) && userIdsFilter.length > 0) {
        const { data: friendRows } = await supabase.rpc('get_friend_waitlist_activity', { friend_ids: userIdsFilter });
        waitlistRows = friendRows || [];
      }
      if (waitlistRows.length && !profileMap.has(user.id) && userIdFilter === user.id) {
        const { data: currentProfile } = await supabase.from('profiles').select('id,username,avatar_url').eq('id', user.id).maybeSingle();
        if (currentProfile) profileMap.set(user.id, currentProfile);
      }
      const seenWaitlist = new Set();
      const waitlistEvents = waitlistRows
        .filter((row) => {
          const key = `${row.user_id}:${row.cafe_id}`;
          if (seenWaitlist.has(key)) return false;
          seenWaitlist.add(key);
          return true;
        })
        .map((row) => ({
          id: `waitlist:${row.id || `${row.user_id}:${row.cafe_id}`}`,
          activityType: 'waitlist',
          user_id: row.user_id,
          cafe_id: row.cafe_id,
          created_at: row.updated_at || new Date().toISOString(),
          profile: { username: row.username || profileMap.get(row.user_id)?.username, avatar_url: row.avatar_url || profileMap.get(row.user_id)?.avatar_url },
          cafe: row.cafe || { id: row.cafe_id, nombre: row.cafe_name, image_url: row.cafe_image_url, neighborhood: row.neighborhood },
          images: [],
        }))
        .filter((event) => event.cafe?.nombre);
      const nextActivity = [...nextPosts, ...waitlistEvents].sort(compareActivityDates);
      if (loadVersion !== loadVersionRef.current) return;
      activityCache.set(cacheKey, { savedAt: Date.now(), posts: nextActivity, socialByPost: nextSocial });
      setPosts(nextActivity);
    } catch (loadError) {
      setError(loadError.message?.includes('relation') || loadError.code === 'PGRST204'
        ? 'Falta aplicar la actualización social en Supabase.'
        : 'No se pudo cargar la actividad.');
    } finally {
      setLoading(false);
    }
  }, [kindFilter, user.id, user.user_metadata?.username, userIdFilter, userIdsFilter]);

  useEffect(() => { loadPosts(); }, [loadPosts, location.key]);

  const toggleLike = async (postId) => {
    const current = socialByPost[postId] || { likes: 0, comments: 0, liked: false, likeProfiles: [] };
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

  const openComments = async (post) => {
    setCommentPost(post);
    setCommentRows([]);
    setCommentProfiles({});
    setCommentText('');
    setCommentsLoading(true);
    const { data, error } = await supabase
      .from('post_comments')
      .select('id,post_id,user_id,content,created_at')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    if (!error) {
      setCommentRows(data || []);
      const ids = [...new Set((data || []).map((row) => row.user_id))];
      if (ids.length) {
        const { data: profiles } = await supabase.from('profiles').select('id,username,avatar_url').in('id', ids);
        setCommentProfiles(Object.fromEntries((profiles || []).map((profile) => [profile.id, profile])));
      } else {
        setCommentProfiles({});
      }
    }
    setCommentsLoading(false);
  };

  const addComment = async (event) => {
    event?.preventDefault();
    const content = commentText.trim();
    if (!content || !commentPost) return;
    const { error: commentError } = await supabase.from('post_comments').insert({
      post_id: commentPost.id,
      user_id: user.id,
      content: content.slice(0, 500),
    });
    if (commentError) {
      window.alert('No se pudo publicar el comentario. Verifica que la migración social esté aplicada.');
      return;
    }
    setCommentRows((rows) => [...rows, { id: `local:${Date.now()}`, post_id: commentPost.id, user_id: user.id, content, created_at: new Date().toISOString() }]);
    setCommentProfiles((profiles) => ({ ...profiles, [user.id]: { id: user.id, username: user.user_metadata?.username || 'Tú' } }));
    setCommentText('');
    setSocialByPost((social) => ({
      ...social,
      [commentPost.id]: { ...(social[commentPost.id] || { likes: 0, liked: false }), comments: (social[commentPost.id]?.comments || 0) + 1 },
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

  const startEditingPost = (post) => {
    const visit = interactions.find((item) => item.id === post.interaction_id);
    setPostMenuId(null);
    setEditingPost(post);
    setEditText(post.content || '');
    setEditCafeId(post.cafe_id || '');
    setEditDate(post.visited_on || post.created_at.slice(0, 10));
    setEditRating(Number(post.rating) || 0);
    setEditFavorite(Boolean(visit?.is_favorite));
    setEditRevisit(post.is_revisit ?? visit?.is_revisit ?? interactions.some((item) => item.cafe_id === post.cafe_id && item.id !== post.interaction_id && item.visited_on < (post.visited_on || post.created_at.slice(0, 10))));
    setEditPhotos(post.images || []);
    setEditFeedback('');
  };

  const closeEditPost = ({ preservePreviews = false } = {}) => {
    if (!preservePreviews) editPhotos.forEach((photo) => { if (photo.file && photo.preview_url) URL.revokeObjectURL(photo.preview_url); });
    setEditingPost(null);
    setEditPhotos([]);
    setEditFeedback('');
  };
  const removeEditImage = (id) => {
    const photo = editPhotos.find((item) => item.id === id);
    if (photo?.file && photo.preview_url) URL.revokeObjectURL(photo.preview_url);
    setEditPhotos((items) => items.filter((item) => item.id !== id));
  };
  const moveEditImage = (index, direction) => {
    const to = index + direction;
    if (to < 0 || to >= editPhotos.length) return;
    setEditPhotos((items) => { const next = [...items]; [next[index],next[to]] = [next[to],next[index]]; return next; });
  };
  const chooseEditPhotos = (event) => {
    const files = [...(event.target.files || [])];
    if (files.some((file) => !file.type.startsWith('image/') || file.size > MAX_EDIT_PHOTO_BYTES)) {
      setEditFeedback('Cada imagen debe pesar máximo 8 MB.'); return;
    }
    setEditPhotos((items) => [...items,...files.slice(0,Math.max(0,10-items.length)).map((file) => ({ id: crypto.randomUUID(), file, preview_url: URL.createObjectURL(file) }))]);
    event.target.value = '';
    setEditFeedback('');
  };
  const saveEditedPost = async () => {
    if (!editingPost || savingEdit) return;
    if (!editText.trim() && !editPhotos.length) { setEditFeedback('Agrega texto o al menos una foto.'); return; }
    setSavingEdit(true); setEditFeedback('');
    try {
      const saved = await editPublication({ post: editingPost, userId: user.id, photos: editPhotos, changes: {
        content: editText.trim(), cafe_id: editCafeId || null, visited_on: editDate,
        rating: editRating || null, is_favorite: editFavorite, is_revisit: editRevisit,
      } });
      const cafe = cafes.find((item) => item.id === editCafeId) || (editingPost.cafe_id === editCafeId ? editingPost.cafe : null);
      loadVersionRef.current += 1;
      setPosts((items) => items.map((post) => post.id === editingPost.id ? { ...post,...saved,cafe } : post).sort(compareActivityDates));
      activityCache.clear();
      closeEditPost({ preservePreviews: true });
      refreshUserInteractions().catch(() => {});
    } catch (error) { setEditFeedback(error.message || 'No se pudo guardar la publicación.'); }
    finally { setSavingEdit(false); }
  };

  const deletePost = async (post) => {
    setPostMenuId(null);
    if (!window.confirm('¿Eliminar esta publicación? Esta acción no se puede deshacer.')) return;
    try {
      if (post.kind === 'review' && post.interaction_id) {
        const { error: interactionError } = await supabase
          .from('user_cafes')
          .update({ review_text: '', updated_at: new Date().toISOString() })
          .eq('id', post.interaction_id)
          .eq('user_id', user.id);
        if (interactionError) throw interactionError;
      }
      const imagePaths = (post.images || []).map((image) => image.storage_path).filter(Boolean);
      if (imagePaths.length) {
        await supabase.storage.from('cafe-photos').remove(imagePaths);
        await supabase
          .from('cafe_photos')
          .delete()
          .in('storage_path', imagePaths)
          .eq('post_id', post.id)
          .eq('user_id', user.id);
      }
      const { error: deleteError } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id)
        .eq('user_id', user.id);
      if (deleteError) throw deleteError;
      setPosts((currentPosts) => currentPosts.filter((currentPost) => currentPost.id !== post.id));
      setSocialByPost((currentSocial) => {
        const nextSocial = { ...currentSocial };
        delete nextSocial[post.id];
        return nextSocial;
      });
      activityCache.clear();
    } catch (deleteError) {
      window.alert(deleteError.message || 'No se pudo eliminar la publicación.');
    }
  };

  const renderPost = (post) => {
    const name = post.profile?.username || (post.user_id === user.id ? 'Tú' : 'Coffee lover');
    const avatar = getActivityAvatar(post.profile?.avatar_url) || fallbackAvatar(name);
    const social = socialByPost[post.id] || { likes: 0, comments: 0, liked: false, likeProfiles: [] };
    const friendLikeNames = social.likeProfiles?.map((profile) => profile.username).filter(Boolean) || [];
    if (post.activityType === 'waitlist') {
      return <article className="activity-list-event" id={`post-${post.id}`} key={post.id}>
        <button type="button" className="activity-list-event-user" onClick={() => navigate(post.user_id === user.id ? '/profile' : `/profile/${post.user_id}`)}>
          <img src={avatar} alt="" width="48" height="48" decoding="async" />
          <span><strong>{name}</strong><small>{post.user_id === user.id ? 'agregaste' : 'agregó'} <b>{post.cafe.nombre}</b> a {post.user_id === user.id ? 'tu' : 'su'} lista para ir después</small></span>
        </button>
        <button type="button" className="activity-list-event-cafe" onClick={() => navigate(`/cafe/${post.cafe_id}`)} aria-label={`Ver ${post.cafe.nombre}`}>
          {post.cafe.image_url ? <img src={post.cafe.image_url} alt="" loading="lazy" decoding="async" /> : <Coffee size={19} />}
          <MapPin size={15} />
        </button>
      </article>;
    }
    return (
      <article className="activity-post" id={`post-${post.id}`} key={post.id}>
        <PostHeader
          avatar={avatar}
          name={name}
          date={post.visited_on || post.created_at}
          canManage={post.user_id === user.id}
          menuOpen={postMenuId === post.id}
          onOpenMenu={() => setPostMenuId((currentId) => currentId === post.id ? null : post.id)}
          onEdit={() => startEditingPost(post)}
          onDelete={() => deletePost(post)}
          onOpenProfile={() => navigate(post.user_id === user.id ? '/profile' : `/profile/${post.user_id}`)}
        />
        {post.cafe?.nombre && <button type="button" className="activity-cafe-link" onClick={() => navigate(`/cafe/${post.cafe_id}`)}>{post.cafe.nombre}</button>}
        {Number(post.rating) > 0 && <div className="activity-rating"><CoffeeBeanRating value={Number(post.rating)} size={14} /><span>{formatRating(post.rating)}</span></div>}
        <div className="activity-post-body">
          {post.images.length > 0 && <PostImageCarousel key={post.images.map((image) => image.id).join(':')} images={post.images} cafeName={post.cafe?.nombre} />}
          {post.content && <p className="activity-post-copy">{post.content}</p>}
        </div>
        {social.likes > 0 && (
          <div className="activity-like-summary">
            {social.likeProfiles?.length > 0 && (
              <div className="activity-like-avatars" aria-label="Amigos a los que les gustó">
                {social.likeProfiles.map((profile) => <img key={profile.id} src={profile.avatar_url || fallbackAvatar(profile.username)} alt="" />)}
              </div>
            )}
            <span>
              {friendLikeNames.length > 0
                ? <>Le gustó a <strong>{friendLikeNames[0]}</strong>{friendLikeNames.length > 1 ? ` y ${friendLikeNames.length - 1} amigo${friendLikeNames.length > 2 ? 's' : ''}` : ''}{social.likes > friendLikeNames.length ? ' y más personas' : ''}</>
                : `${social.likes} me gusta`}
            </span>
          </div>
        )}
        <div className="activity-post-actions">
          <button type="button" className={social.liked ? 'is-active' : ''} onClick={() => toggleLike(post.id)} aria-label={social.liked ? 'Quitar me gusta' : 'Me gusta'}><Heart size={18} fill={social.liked ? 'currentColor' : 'none'} /><span>{social.likes}</span></button>
          <button type="button" onClick={() => openComments(post)} aria-label="Comentar"><MessageCircle size={18} /><span>{social.comments}</span></button>
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
        {!loading && !error && posts.length > 0 && posts.map(renderPost)}
      </div>
      {commentPost && (
        <div className="comments-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommentPost(null); }}>
          <section className="comments-sheet" role="dialog" aria-modal="true" aria-label="Comentarios">
            <div className="comments-sheet-handle" />
            <header><h2>Comentarios</h2><button type="button" onClick={() => setCommentPost(null)} aria-label="Cerrar comentarios"><X size={19} /></button></header>
            <div className="comments-list">
              {commentsLoading && <div className="comments-empty">Cargando comentarios…</div>}
              {!commentsLoading && commentRows.length === 0 && <div className="comments-empty"><strong>Aún no hay comentarios</strong><span>Inicia la conversación.</span></div>}
              {!commentsLoading && commentRows.map((comment) => {
                const profile = commentProfiles[comment.user_id];
                const avatar = profile?.avatar_url || fallbackAvatar(profile?.username || 'coffee-user');
                return <article key={comment.id}><img src={avatar} alt="" /><div><strong>{comment.user_id === user.id ? 'Tú' : profile?.username || 'Coffee lover'}</strong><p>{comment.content}</p></div></article>;
              })}
            </div>
            <div className="comments-reactions" aria-label="Reacciones rápidas"><button type="button" onClick={() => setCommentText((text) => `${text} ❤️`)}>❤️</button><button type="button" onClick={() => setCommentText((text) => `${text} 🔥`)}>🔥</button><button type="button" onClick={() => setCommentText((text) => `${text} ✨`)}>✨</button><button type="button" onClick={() => setCommentText((text) => `${text} 😍`)}>😍</button><button type="button" onClick={() => setCommentText((text) => `${text} 😂`)}>😂</button></div>
            <form className="comments-composer" onSubmit={addComment}><img src={fallbackAvatar(user.user_metadata?.username || user.email)} alt="" /><input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Escribe un comentario…" maxLength={500} autoFocus /><button type="submit" disabled={!commentText.trim()} aria-label="Publicar comentario"><Send size={18} /></button></form>
          </section>
        </div>
      )}
      {editingPost && (
        <div className="activity-edit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingEdit) closeEditPost(); }}>
          <section className="activity-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="activity-edit-title">
            <header>
              <div><small>PUBLICACIÓN</small><h2 id="activity-edit-title">Editar publicación</h2></div>
              <button type="button" onClick={closeEditPost} disabled={savingEdit} aria-label="Cerrar editor"><X size={19} /></button>
            </header>
            <fieldset className="activity-edit-fields" disabled={savingEdit}>
              <label>Cafetería<select aria-label="Cafetería de la publicación" value={editCafeId} onChange={(event) => setEditCafeId(event.target.value)}><option value="">Sin cafetería relacionada</option>{editingPost.cafe_id && !cafes.some((item) => item.id === editingPost.cafe_id) && <option value={editingPost.cafe_id}>{editingPost.cafe?.nombre || 'Cafetería anterior'}</option>}{cafes.map((cafe) => <option key={cafe.id} value={cafe.id}>{cafe.nombre}</option>)}</select></label>
              <label>Fecha<input type="date" aria-label="Fecha de la publicación" value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label>
              {editCafeId && <div className="activity-edit-review-options"><div><span>Calificación</span><HalfStarRating value={editRating} onChange={setEditRating} size={22} readOnly={savingEdit} /></div><button type="button" onClick={() => setEditFavorite((value) => !value)} aria-pressed={editFavorite} aria-label="Favorita"><Heart size={28} fill={editFavorite ? 'currentColor' : 'none'} /></button></div>}
              <label>Texto<textarea aria-label="Texto de la publicación" value={editText} onChange={(event) => setEditText(event.target.value)} maxLength={1000} placeholder="Escribe algo sobre tu visita…" /></label>
              {editCafeId && <button className="activity-edit-visit" type="button" onClick={() => setEditRevisit((value) => !value)} aria-pressed={editRevisit}>{editRevisit ? 'Ya había ido antes' : 'Primera visita'}</button>}
              <div className="activity-edit-section-label"><span>Fotos</span><small>{editPhotos.length}/10</small></div>
              {editPhotos.length ? <div className="activity-edit-images">{editPhotos.map((photo,index) => <div className="activity-edit-image" key={photo.id}>
                <img src={photo.preview_url || photo.public_url} alt={`Foto ${index+1}`} />
                <button type="button" onClick={() => removeEditImage(photo.id)} aria-label={`Eliminar foto ${index+1}`}><X size={14} /></button>
                <div className="activity-edit-photo-order"><button type="button" onClick={() => moveEditImage(index,-1)} disabled={index===0} aria-label={`Mover foto ${index+1} antes`}><ChevronLeft size={15} /></button><button type="button" onClick={() => moveEditImage(index,1)} disabled={index===editPhotos.length-1} aria-label={`Mover foto ${index+1} después`}><ChevronRight size={15} /></button></div>
              </div>)}</div> : <p className="activity-edit-empty">No hay fotos en esta publicación.</p>}
              <input ref={editFileInputRef} hidden type="file" accept="image/*" multiple onChange={chooseEditPhotos} />
              <button type="button" className="activity-edit-add-photo" onClick={() => editFileInputRef.current?.click()} disabled={editPhotos.length >= 10}><ImagePlus size={17} /> Agregar fotos</button>
            </fieldset>
            {editFeedback && <p className="activity-edit-feedback" role="alert">{editFeedback}</p>}
            <footer>
              <button type="button" className="activity-edit-cancel" onClick={closeEditPost} disabled={savingEdit}>Cancelar</button>
              <button type="button" className="activity-edit-save" onClick={saveEditedPost} disabled={savingEdit}>{savingEdit ? 'Guardando…' : <><Check size={16} /> Guardar cambios</>}</button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function FriendsActivityPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [friendIds, setFriendIds] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadFriendIds = async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('requester_id,addressee_id')
        .eq('status', 'accepted');
      if (cancelled) return;
      if (error) {
        setFriendIds([]);
        return;
      }
      const ids = [...new Set((data || []).map((row) => (
        row.requester_id === user.id ? row.addressee_id : row.requester_id
      )).filter(Boolean))];
      setFriendIds(ids);
    };
    loadFriendIds();
    return () => { cancelled = true; };
  }, [user.id]);

  if (friendIds === null) return <div className="activity-empty"><p>Cargando amigos…</p></div>;
  if (friendIds.length === 0) return (
    <div className="activity-empty activity-friends-empty">
      <Users size={30} />
      <div>
        <strong>Aún no tienes amigos agregados</strong>
        <p>Agrega amigos para ver sus visitas, reseñas y publicaciones aquí.</p>
      </div>
      <button type="button" onClick={() => navigate('/profile?tab=friends')}><UserPlus size={16} /> Agregar amigos</button>
    </div>
  );
  return <ActivityFeed userIdsFilter={friendIds} />;
}

function ActivityPage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('you');

  return (
    <main className="social-page activity-page">
      <div className="social-shell activity-shell">
        <nav className="activity-section-switcher" aria-label="Secciones de actividad">
          <button type="button" className={activeSection === 'you' ? 'is-active' : ''} onClick={() => setActiveSection('you')}>Tú</button>
          <button type="button" className={activeSection === 'friends' ? 'is-active' : ''} onClick={() => setActiveSection('friends')}>Amigos</button>
        </nav>
        {activeSection === 'friends' && <FriendsActivityPanel />}
        {activeSection === 'you' && <ActivityFeed userIdFilter={user?.id} />}
      </div>
      <BottomNav />
    </main>
  );
}

function PostHeader({ avatar, name, date, canManage, menuOpen, onOpenMenu, onEdit, onDelete, onOpenProfile }) {
  const formattedDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(String(date).length === 10 ? `${date}T12:00:00` : date));
  return (
    <div className="activity-post-header">
      <button type="button" className="activity-author" onClick={onOpenProfile}><img src={avatar} alt="" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = fallbackAvatar(name); }} /><span>{name}</span></button>
      <div className="activity-post-tools">
        <small>{formattedDate}</small>
        {canManage && (
          <div className="activity-post-menu-wrap">
            <button type="button" className="activity-post-menu-button" onClick={onOpenMenu} aria-label="Más opciones: editar o eliminar publicación" aria-expanded={menuOpen} title="Editar o eliminar publicación">
              <MoreHorizontal size={20} aria-hidden="true" />
            </button>
            {menuOpen && (
              <div className="activity-post-menu" role="menu">
                <button type="button" onClick={onEdit} role="menuitem"><Edit3 size={15} /> Editar publicación</button>
                <button type="button" onClick={onDelete} role="menuitem" className="is-danger"><Trash2 size={15} /> Eliminar publicación</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityPage;
