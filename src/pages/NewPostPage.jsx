import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, FileText, Heart, ImagePlus, Link2, MapPin, RefreshCw, Star, Trash2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import HalfStarRating from '../components/HalfStarRating';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { supabase } from '../supabase';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const NEW_POST_DRAFT_KEY = 'coffee-map:new-post-draft';
const getAvatar = (user, profile) => profile?.avatar_url || `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(user?.email || 'coffee-user')}`;
const readStoredDraft = (userId) => {
  if (!userId || typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem(`${NEW_POST_DRAFT_KEY}:${userId}`) || 'null');
  } catch {
    return null;
  }
};
const getLocalDate = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
};

function NewPostPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const hydratedComposerRef = useRef('');
  const draftHydratedRef = useRef(false);
  const draftRef = useRef(null);
  const visitModeTouchedRef = useRef(false);
  const composerRouteRef = useRef(`${location.pathname}:${location.search}`);
  const { user, userProfile } = useAuth();
  const { cafes, interactions, interactionsByCafeId, interactionsLoaded, loadCafes, saveCafeInteraction } = useCoffeeData();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedCafeId = searchParams.get('cafe') || '';
  const draftMode = searchParams.get('draft') === '1';
  const [text, setText] = useState('');
  const [cafeId, setCafeId] = useState(requestedCafeId);
  const [rating, setRating] = useState(0);
  const [visitMode, setVisitMode] = useState('first');
  const [isFavorite, setIsFavorite] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [photoRightsConfirmed, setPhotoRightsConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [draftSaved, setDraftSaved] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showDraftsPanel, setShowDraftsPanel] = useState(false);
  const avatar = useMemo(() => getAvatar(user, userProfile), [user, userProfile]);
  const username = userProfile?.username || user?.email?.split('@')[0] || 'coffee lover';
  const selectedCafe = useMemo(() => (
    cafes.find((cafe) => cafe.id === cafeId)
    || interactionsByCafeId.get(cafeId)?.cafe
    || null
  ), [cafeId, cafes, interactionsByCafeId]);
  useEffect(() => {
    if (!user?.id || draftHydratedRef.current) return;
    try {
      const savedDraft = draftMode
        ? JSON.parse(window.localStorage.getItem(`${NEW_POST_DRAFT_KEY}:${user.id}`) || 'null')
        : null;
      if (savedDraft) {
        draftRef.current = savedDraft;
        setDraftSaved(true);
        setText(savedDraft.text || '');
        setCafeId(requestedCafeId || savedDraft.cafeId || '');
        setRating(Number(savedDraft.rating) || 0);
        setIsFavorite(Boolean(savedDraft.isFavorite));
        setVisitMode(savedDraft.visitMode || 'first');
      } else if (requestedCafeId) {
        setCafeId(requestedCafeId);
      }
    } catch {
      if (requestedCafeId) setCafeId(requestedCafeId);
    }
    draftHydratedRef.current = true;
  }, [draftMode, requestedCafeId, user?.id]);

  useEffect(() => {
    if (location.pathname !== '/new-post') return;
    if (requestedCafeId) setCafeId(requestedCafeId);
  }, [location.pathname, location.key, requestedCafeId]);

  useEffect(() => {
    if (location.pathname !== '/new-post') return;
    const routeKey = `${location.pathname}:${location.search}`;
    if (composerRouteRef.current === routeKey) return;
    composerRouteRef.current = routeKey;
    draftHydratedRef.current = false;
    draftRef.current = null;
    hydratedComposerRef.current = '';
    visitModeTouchedRef.current = false;
    setText('');
    setCafeId(requestedCafeId);
    setRating(0);
    setVisitMode('first');
    setIsFavorite(false);
    setPhotos([]);
    setPhotoPreviews([]);
    setPhotoRightsConfirmed(false);
    setDraftSaved(false);
  }, [location.pathname, location.search, requestedCafeId]);

  useEffect(() => {
    if (location.pathname !== '/new-post' || !cafeId || !interactionsLoaded || !draftHydratedRef.current) return;
    const hydrationKey = `${location.key}:${cafeId}`;
    if (hydratedComposerRef.current === hydrationKey) return;

    const currentInteraction = interactionsByCafeId.get(cafeId);
    const hasPreviousVisit = interactions.some((item) => item.cafe_id === cafeId && (item.is_visited || item.review_text?.trim()));
    const draftHasVisitMode = Object.prototype.hasOwnProperty.call(draftRef.current || {}, 'visitMode');
    if (!visitModeTouchedRef.current && !draftHasVisitMode) {
      setVisitMode(hasPreviousVisit ? 'returning' : 'first');
    }
    hydratedComposerRef.current = hydrationKey;
    if (draftRef.current?.text?.trim() || draftRef.current?.cafeId) return;
    setText(currentInteraction?.review_text || '');
    setRating(Number(currentInteraction?.rating) || 0);
    setIsFavorite(Boolean(currentInteraction?.is_favorite));
  }, [cafeId, interactions, interactionsByCafeId, interactionsLoaded, location.key, location.pathname]);

  useEffect(() => {
    if (!user?.id || !draftHydratedRef.current) return;
    const hasDraft = Boolean(text.trim() || cafeId || rating || isFavorite || photos.length);
    const storageKey = `${NEW_POST_DRAFT_KEY}:${user.id}`;
    if (!hasDraft) {
      if (draftMode) window.localStorage.removeItem(storageKey);
      setDraftSaved(false);
      return;
    }
    const draft = { text, cafeId, rating, isFavorite, visitMode, savedAt: Date.now() };
    draftRef.current = draft;
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
    setDraftSaved(true);
  }, [cafeId, draftMode, isFavorite, photos.length, rating, text, user?.id, visitMode]);

  const storedDraft = readStoredDraft(user?.id);
  const storedDraftCafe = storedDraft?.cafeId ? cafes.find((cafe) => cafe.id === storedDraft.cafeId) : null;
  const hasComposerContent = Boolean(text.trim() || cafeId || rating || isFavorite || photos.length);

  const saveCurrentDraft = () => {
    if (!user?.id) return;
    const storageKey = `${NEW_POST_DRAFT_KEY}:${user.id}`;
    const hasDraft = Boolean(text.trim() || cafeId || rating || isFavorite || photos.length);
    if (!hasDraft) return;
    window.localStorage.setItem(storageKey, JSON.stringify({
      text,
      cafeId,
      rating,
      isFavorite,
      visitMode,
      savedAt: Date.now(),
    }));
    setDraftSaved(true);
  };

  const leaveComposer = () => {
    setShowCloseDialog(false);
    navigate(-1);
  };

  const requestCloseComposer = () => {
    if (!hasComposerContent) {
      leaveComposer();
      return;
    }
    setShowCloseDialog(true);
  };

  const saveAndCloseComposer = () => {
    saveCurrentDraft();
    leaveComposer();
  };

  const discardAndCloseComposer = () => {
    if (draftMode || hasComposerContent) {
      window.localStorage.removeItem(`${NEW_POST_DRAFT_KEY}:${user?.id}`);
      setDraftSaved(false);
    }
    leaveComposer();
  };

  const openStoredDraft = () => {
    setShowDraftsPanel(false);
    navigate('/new-post?draft=1');
  };

  const startNewPost = () => {
    setShowDraftsPanel(false);
    navigate('/new-post?new=1');
  };

  const deleteStoredDraft = () => {
    window.localStorage.removeItem(`${NEW_POST_DRAFT_KEY}:${user?.id}`);
    setDraftSaved(false);
  };

  const toggleVisitMode = () => {
    visitModeTouchedRef.current = true;
    setVisitMode((current) => current === 'returning' ? 'first' : 'returning');
  };

  const choosePhotos = (event) => {
    const files = [...(event.target.files || [])].slice(0, 6);
    if (!files.length) return;
    if (files.some((file) => !file.type.startsWith('image/') || file.size > MAX_PHOTO_BYTES)) {
      setFeedback({ type: 'error', message: 'Cada imagen debe pesar máximo 8 MB.' });
      return;
    }
    photoPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setPhotos(files);
    setPhotoPreviews(files.map((file) => URL.createObjectURL(file)));
    setPhotoRightsConfirmed(false);
    setFeedback({ type: '', message: '' });
  };

  const clearPhotos = () => {
    photoPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setPhotos([]);
    setPhotoPreviews([]);
    setPhotoRightsConfirmed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const publishPost = async () => {
    const content = text.trim();
    if ((!content && photos.length === 0) || !user || submitting) return;
    if (cafeId && photos.length > 0 && !photoRightsConfirmed) {
      setFeedback({ type: 'error', message: 'Confirma que puedes publicar las fotos para agregarlas a la cafetería.' });
      return;
    }

    setSubmitting(true);
    setFeedback({ type: '', message: '' });
    let createdPost = null;
    let createdPostWasNew = false;
    try {
      let interaction = null;
      if (cafeId) {
        const currentInteraction = interactionsByCafeId.get(cafeId);
        interaction = await saveCafeInteraction(cafeId, {
          is_visited: true,
          is_favorite: isFavorite || currentInteraction?.is_favorite || false,
          rating: rating || null,
          review_text: content,
          visited_on: getLocalDate(),
        }, { createNewVisit: visitMode === 'returning' });
      }

      const postPayload = {
        user_id: user.id,
        cafe_id: cafeId || null,
        content,
        kind: cafeId ? 'review' : 'post',
        rating: cafeId && rating ? rating : null,
        visited_on: interaction?.visited_on || getLocalDate(),
        interaction_id: interaction?.id || null,
        status: 'published',
        updated_at: new Date().toISOString(),
      };
      const { data: existingPost, error: findError } = interaction
        ? await supabase.from('posts').select('id').eq('interaction_id', interaction.id).maybeSingle()
        : { data: null, error: null };
      if (findError) throw findError;
      const postQuery = existingPost
        ? supabase.from('posts').update(postPayload).eq('id', existingPost.id).select('id,user_id,cafe_id,content,image_url,status,created_at').single()
        : supabase.from('posts').insert(postPayload).select('id,user_id,cafe_id,content,image_url,status,created_at').single();
      const { data: post, error: postError } = await postQuery;
      if (postError) throw postError;
      createdPost = post;
      createdPostWasNew = !existingPost;

      const uploadedImages = [];
      for (const [index, photo] of photos.entries()) {
        const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
        const storagePath = `${user.id}/posts/${post.id}/${Date.now()}-${index}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('cafe-photos').upload(storagePath, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage.from('cafe-photos').getPublicUrl(storagePath);
        uploadedImages.push({ post_id: post.id, user_id: user.id, storage_path: storagePath, public_url: publicData.publicUrl, position: index });
      }

      if (uploadedImages.length > 0) {
        const { error: imageError } = await supabase.from('post_images').insert(uploadedImages);
        if (imageError) throw imageError;
        const { error: updateError } = await supabase.from('posts').update({ image_url: uploadedImages[0].public_url }).eq('id', post.id);
        if (updateError) throw updateError;

        if (cafeId && photoRightsConfirmed) {
          const isAdmin = userProfile?.role === 'administrador';
          const { data: cafePhotos, error: cafePhotoError } = await supabase
            .from('cafe_photos')
            .insert(uploadedImages.map((image) => ({
              cafe_id: cafeId,
              user_id: user.id,
              post_id: post.id,
              storage_path: image.storage_path,
              public_url: image.public_url,
              status: isAdmin ? 'approved' : 'pending',
              is_cover: false,
              rights_confirmed: true,
              rights_basis: 'own',
              rights_note: 'Foto propia confirmada al publicar la reseña.',
            })))
            .select('id,public_url');
          if (cafePhotoError) throw cafePhotoError;

          if (isAdmin && !selectedCafe?.imageUrl && cafePhotos?.[0]) {
            const { error: coverError } = await supabase.from('cafes').update({
              image_url: cafePhotos[0].public_url,
              image_source_url: null,
              image_attribution: `Foto de ${username} en Coffee Map`,
              image_license: null,
            }).eq('id', cafeId);
            if (coverError) throw coverError;

            const { error: markCoverError } = await supabase
              .from('cafe_photos')
              .update({ is_cover: true, moderated_at: new Date().toISOString(), moderated_by: user.id })
              .eq('id', cafePhotos[0].id);
            if (markCoverError) throw markCoverError;
            await loadCafes({ force: true });
          }
        }
      }

      setText('');
      setCafeId('');
      setRating(0);
      setVisitMode('first');
      setIsFavorite(false);
      clearPhotos();
      draftRef.current = null;
      window.localStorage.removeItem(`${NEW_POST_DRAFT_KEY}:${user.id}`);
      setDraftSaved(false);
      setFeedback({ type: 'success', message: cafeId ? 'Reseña publicada en Actividad.' : 'Publicación creada.' });
      window.setTimeout(() => navigate('/activity'), 650);
    } catch (error) {
      if (createdPost?.id && createdPostWasNew) await supabase.from('posts').delete().eq('id', createdPost.id);
      setFeedback({ type: 'error', message: `No se pudo publicar: ${error.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="social-page new-post-page">
      <div className="social-shell new-post-shell">
        <header className="social-topbar"><button type="button" aria-label="Cerrar" onClick={requestCloseComposer}><X size={19} /></button><button type="button" className="new-post-drafts-link" onClick={() => setShowDraftsPanel(true)}><FileText size={15} /> Borradores</button><button type="button" className="social-post-button" disabled={(!text.trim() && photos.length === 0) || submitting} onClick={publishPost}>{submitting ? 'Subiendo…' : 'Publicar'}</button></header>
        {feedback.message && <p className={`post-feedback post-feedback-${feedback.type}`}>{feedback.message}</p>}
        <section className="new-post-composer">
          <div className="new-post-actions"><button type="button" onClick={requestCloseComposer}>Cerrar</button><span>{draftSaved ? 'Borrador guardado' : 'Comunidad Mérida'}</span></div>
          <div className="new-post-author"><img src={avatar} alt="" /><strong>{username}</strong></div>
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="¿Qué cafetería visitaste hoy?" maxLength={1000} autoFocus />
          {photoPreviews.length > 0 && <div className="new-post-photo-preview new-post-photo-gallery">{photoPreviews.map((preview, index) => <img src={preview} alt={`Vista previa ${index + 1}`} key={preview} />)}<button type="button" onClick={clearPhotos} aria-label="Quitar fotos"><X size={16} /></button></div>}
          <div className="new-post-cafe-picker"><MapPin size={16} /><button type="button" onClick={() => navigate('/search?selectCafe=1&returnTo=%2Fnew-post')}>{selectedCafe?.nombre || 'Relacionar una cafetería (opcional)'}</button>{selectedCafe && <button type="button" className="new-post-cafe-clear" onClick={() => setCafeId('')} aria-label="Quitar cafetería relacionada"><X size={15} /></button>}</div>
          {photoPreviews.length > 0 && selectedCafe && <label className="new-post-photo-rights"><input type="checkbox" checked={photoRightsConfirmed} onChange={(event) => setPhotoRightsConfirmed(event.target.checked)} /><span>Confirmo que estas fotos son mías o que tengo permiso para publicarlas. Se agregarán a la galería de la cafetería y podrán usarse como portada.</span></label>}
          {selectedCafe && (
            <div className="new-post-review-options">
              <label className="new-post-rating"><Star size={17} /><span>Calificación</span><HalfStarRating value={rating} onChange={setRating} size={23} /></label>
              <label className="new-post-favorite"><input type="checkbox" checked={isFavorite} onChange={(event) => setIsFavorite(event.target.checked)} /><Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} /> Agregar a favoritos</label>
            </div>
          )}
          {selectedCafe && (
            <button
              type="button"
              className={`new-post-visit-button ${visitMode === 'returning' ? 'is-returning' : 'is-first'}`}
              onClick={toggleVisitMode}
              aria-label="Cambiar tipo de visita"
              aria-pressed={visitMode === 'returning'}
            >
              {visitMode === 'returning' ? <RefreshCw size={22} /> : <Eye size={22} />}
              <span><strong>{visitMode === 'returning' ? 'Ya fuiste antes' : 'Primera visita'}</strong><small>Toca para cambiar este estado antes de publicar.</small></span>
            </button>
          )}
          <div className="new-post-toolbar"><button type="button" aria-label="Elegir imágenes de la galería" onClick={() => fileInputRef.current?.click()}><ImagePlus size={19} /></button><MapPin size={18} aria-hidden="true" /><Link2 size={18} aria-hidden="true" /><span>{text.length}/1000</span></div>
          <input ref={fileInputRef} hidden type="file" accept="image/*" multiple onChange={choosePhotos} />
        </section>
        {showCloseDialog && (
          <div className="post-close-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCloseDialog(false); }}>
            <section className="post-close-sheet" role="dialog" aria-modal="true" aria-labelledby="post-close-title">
              <div className="post-close-handle" />
              <h2 id="post-close-title">¿Qué quieres hacer con tu publicación?</h2>
              <button type="button" className="post-close-save" onClick={saveAndCloseComposer}>Guardar en borradores</button>
              <button type="button" className="post-close-discard" onClick={discardAndCloseComposer}>Descartar</button>
              <button type="button" className="post-close-continue" onClick={() => setShowCloseDialog(false)}>Seguir editando</button>
            </section>
          </div>
        )}
        {showDraftsPanel && (
          <div className="post-drafts-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDraftsPanel(false); }}>
            <section className="post-drafts-sheet" role="dialog" aria-modal="true" aria-labelledby="post-drafts-title">
              <header><div><small>GUARDADOS</small><h2 id="post-drafts-title">Borradores</h2></div><button type="button" onClick={() => setShowDraftsPanel(false)} aria-label="Cerrar borradores"><X size={18} /></button></header>
              {storedDraft ? (
                <article className="post-draft-row">
                  <div className="post-draft-icon"><FileText size={20} /></div>
                  <div><strong>{storedDraftCafe?.nombre || 'Nueva publicación'}</strong><p>{storedDraft.text?.trim() || 'Publicación sin texto todavía.'}</p><small>{storedDraft.savedAt ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(storedDraft.savedAt)) : 'Guardado recientemente'}</small></div>
                  <button type="button" className="post-draft-delete" onClick={deleteStoredDraft} aria-label="Eliminar borrador"><Trash2 size={15} /></button>
                  <button type="button" className="post-draft-open" onClick={openStoredDraft}>Editar</button>
                </article>
              ) : <div className="post-drafts-empty"><FileText size={28} /><p>No tienes borradores guardados.</p></div>}
              <button type="button" className="post-drafts-new" onClick={startNewPost}>+ Nueva publicación</button>
            </section>
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

export default NewPostPage;
