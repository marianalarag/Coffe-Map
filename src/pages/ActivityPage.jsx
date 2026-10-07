import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Coffee, Edit3, Heart, Image as ImageIcon, ImagePlus, MessageCircle, MoreHorizontal, Send, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import HalfStarRating from '../components/HalfStarRating';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { repairCafeText } from '../utils/cafeDeduplication';

const fallbackAvatar = (seed) => `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(seed || 'coffee-user')}`;
const ACTIVITY_CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_EDIT_PHOTO_BYTES = 8 * 1024 * 1024;
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

export function ActivityFeed({ userIdFilter = null, userIdsFilter = null, kindFilter = null, compact = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [socialByPost, setSocialByPost] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches
  ));
  const [commentPost, setCommentPost] = useState(null);
  const [commentRows, setCommentRows] = useState([]);
  const [commentProfiles, setCommentProfiles] = useState({});
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [postMenuId, setPostMenuId] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [editText, setEditText] = useState('');
  const [editImages, setEditImages] = useState([]);
  const [editFiles, setEditFiles] = useState([]);
  const [editPreviews, setEditPreviews] = useState([]);
  const [editFeedback, setEditFeedback] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const editFileInputRef = useRef(null);

  const loadPosts = useCallback(async () => {
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
        .select('id,user_id,cafe_id,content,image_url,kind,rating,visited_on,interaction_id,created_at,updated_at')
        .eq('status', 'published')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(60);

      if (userIdFilter) postsQuery = postsQuery.eq('user_id', userIdFilter);
      if (Array.isArray(userIdsFilter)) postsQuery = postsQuery.in('user_id', userIdsFilter);
      if (kindFilter) postsQuery = postsQuery.eq('kind', kindFilter);

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
      activityCache.set(cacheKey, { savedAt: Date.now(), posts: nextPosts, socialByPost: nextSocial });
      setPosts(nextPosts);
    } catch (loadError) {
      setError(loadError.message?.includes('relation') || loadError.code === 'PGRST204'
        ? 'Falta aplicar la actualización social en Supabase.'
        : 'No se pudo cargar la actividad.');
    } finally {
      setLoading(false);
    }
  }, [kindFilter, user.id, userIdFilter, userIdsFilter]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 900px)');
    const updateLayout = (event) => setIsDesktop(event.matches);
    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener('change', updateLayout);
    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

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
    setPostMenuId(null);
    setEditingPost(post);
    setEditText(post.content || '');
    setEditImages(post.images || []);
    setEditFiles([]);
    setEditPreviews([]);
    setEditFeedback('');
  };

  const closeEditPost = () => {
    editPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setEditingPost(null);
    setEditFiles([]);
    setEditPreviews([]);
    setEditFeedback('');
  };

  const removeEditImage = (imageId) => {
    setEditImages((images) => images.filter((image) => image.id !== imageId));
  };

  const chooseEditPhotos = (event) => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    if (files.some((file) => !file.type.startsWith('image/') || file.size > MAX_EDIT_PHOTO_BYTES)) {
      setEditFeedback('Cada imagen debe pesar máximo 8 MB.');
      return;
    }
    const availableSlots = Math.max(0, 10 - editImages.length - editFiles.length);
    const nextFiles = files.slice(0, availableSlots);
    setEditFiles((current) => [...current, ...nextFiles]);
    setEditPreviews((current) => [...current, ...nextFiles.map((file) => URL.createObjectURL(file))]);
    setEditFeedback('');
    event.target.value = '';
  };

  const saveEditedPost = async () => {
    if (!editingPost || savingEdit) return;
    const content = editText.trim();
    if (editingPost.kind === 'review' && !content) {
      setEditFeedback('Las reseñas necesitan conservar un texto.');
      return;
    }
    if (!content && editImages.length === 0 && editFiles.length === 0) {
      setEditFeedback('Agrega texto o al menos una foto.');
      return;
    }

    setSavingEdit(true);
    setEditFeedback('');
    const updatedAt = new Date().toISOString();
    try {
      const existingImages = editingPost.images || [];
      const keptImageIds = new Set(editImages.map((image) => image.id));
      const removedImages = existingImages.filter((image) => (
        !String(image.id).endsWith(':legacy') && !keptImageIds.has(image.id)
      ));
      const removedPaths = removedImages.map((image) => image.storage_path).filter(Boolean);

      if (removedImages.length) {
        const { error: removeRowsError } = await supabase
          .from('post_images')
          .delete()
          .in('id', removedImages.map((image) => image.id))
          .eq('post_id', editingPost.id);
        if (removeRowsError) throw removeRowsError;
        if (removedPaths.length) {
          await supabase.storage.from('cafe-photos').remove(removedPaths);
          await supabase
            .from('cafe_photos')
            .delete()
            .in('storage_path', removedPaths)
            .eq('post_id', editingPost.id)
            .eq('user_id', user.id);
        }
      }

      let uploadedImages = [];
      for (const [index, photo] of editFiles.entries()) {
        const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
        const storagePath = `${user.id}/posts/${editingPost.id}/edit-${Date.now()}-${index}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('cafe-photos')
          .upload(storagePath, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage.from('cafe-photos').getPublicUrl(storagePath);
        uploadedImages.push({
          post_id: editingPost.id,
          user_id: user.id,
          storage_path: storagePath,
          public_url: publicData.publicUrl,
          position: editImages.length + index,
        });
      }

      if (uploadedImages.length) {
        const { data: insertedImages, error: imageError } = await supabase
          .from('post_images')
          .insert(uploadedImages)
          .select('id,post_id,public_url,position,storage_path');
        if (imageError) throw imageError;
        uploadedImages = insertedImages || uploadedImages;
      }

      const nextImages = [...editImages, ...uploadedImages.map((image, index) => ({
        ...image,
        id: image.id || `local:${Date.now()}:${index}`,
      }))];
      const nextImageUrl = nextImages[0]?.public_url || null;

      if (editingPost.kind === 'review' && editingPost.interaction_id) {
        const { error: interactionError } = await supabase
          .from('user_cafes')
          .update({ review_text: content, updated_at: updatedAt })
          .eq('id', editingPost.interaction_id)
          .eq('user_id', user.id);
        if (interactionError) throw interactionError;
      }

      const { error: postError } = await supabase
        .from('posts')
        .update({ content, image_url: nextImageUrl, updated_at: updatedAt })
        .eq('id', editingPost.id)
        .eq('user_id', user.id);
      if (postError) throw postError;

      setPosts((currentPosts) => currentPosts.map((post) => (
        post.id === editingPost.id
          ? { ...post, content, image_url: nextImageUrl, updated_at: updatedAt, images: nextImages }
          : post
      )));
      activityCache.clear();
      closeEditPost();
    } catch (saveError) {
      setEditFeedback(saveError.message || 'No se pudo guardar la publicación.');
    } finally {
      setSavingEdit(false);
    }
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
    const avatar = post.profile?.avatar_url || fallbackAvatar(name);
    const social = socialByPost[post.id] || { likes: 0, comments: 0, liked: false, likeProfiles: [] };
    const friendLikeNames = social.likeProfiles?.map((profile) => profile.username).filter(Boolean) || [];
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
        {Number(post.rating) > 0 && <div className="activity-rating"><HalfStarRating value={Number(post.rating)} readOnly size={17} /><span>{Number(post.rating).toFixed(1)}</span></div>}
        {post.content && <p className="activity-post-copy">{post.content}</p>}
        {post.images.length > 0 && <PostImageCarousel images={post.images} cafeName={post.cafe?.nombre} />}
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
        {!loading && !error && posts.length > 0 && (isDesktop ? (
          <>
            <div className="activity-feed-column">{posts.filter((_, index) => index % 2 === 0).map(renderPost)}</div>
            <div className="activity-feed-column">{posts.filter((_, index) => index % 2 === 1).map(renderPost)}</div>
          </>
        ) : posts.map(renderPost))}
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
        <div className="activity-edit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditPost(); }}>
          <section className="activity-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="activity-edit-title">
            <header>
              <div><small>PUBLICACIÓN</small><h2 id="activity-edit-title">Editar publicación</h2></div>
              <button type="button" onClick={closeEditPost} aria-label="Cerrar editor"><X size={19} /></button>
            </header>
            <textarea value={editText} onChange={(event) => setEditText(event.target.value)} maxLength={1000} placeholder="Escribe algo sobre tu visita…" autoFocus />
            <div className="activity-edit-section-label"><span>Fotos</span><small>{editImages.length + editFiles.length}/10</small></div>
            {(editImages.length > 0 || editPreviews.length > 0) ? (
              <div className="activity-edit-images">
                {editImages.map((image) => (
                  <div className="activity-edit-image" key={image.id}>
                    <img src={image.public_url} alt="" />
                    <button type="button" onClick={() => removeEditImage(image.id)} aria-label="Eliminar esta foto"><X size={14} /></button>
                  </div>
                ))}
                {editPreviews.map((preview) => <div className="activity-edit-image" key={preview}><img src={preview} alt="Nueva foto" /><span className="activity-edit-new-badge">Nueva</span></div>)}
              </div>
            ) : <p className="activity-edit-empty">No hay fotos en esta publicación.</p>}
            <input ref={editFileInputRef} hidden type="file" accept="image/*" multiple onChange={chooseEditPhotos} />
            <button type="button" className="activity-edit-add-photo" onClick={() => editFileInputRef.current?.click()} disabled={editImages.length + editFiles.length >= 10}><ImagePlus size={17} /> Agregar fotos</button>
            {editFeedback && <p className="activity-edit-feedback" role="alert">{editFeedback}</p>}
            <footer>
              <button type="button" className="activity-edit-cancel" onClick={closeEditPost}>Cancelar</button>
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
  const formattedDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(date));
  return (
    <div className="activity-post-header">
      <button type="button" className="activity-author" onClick={onOpenProfile}><img src={avatar} alt="" /><span>{name}</span></button>
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
