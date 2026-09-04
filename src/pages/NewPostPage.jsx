import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, ImagePlus, Link2, MapPin, Star, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import HalfStarRating from '../components/HalfStarRating';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { supabase } from '../supabase';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const getAvatar = (user, profile) => profile?.avatar_url || `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(user?.email || 'coffee-user')}`;

function NewPostPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const hydratedComposerRef = useRef('');
  const { user, userProfile } = useAuth();
  const { cafes, interactionsByCafeId, interactionsLoaded, loadCafes, saveCafeInteraction } = useCoffeeData();
  const requestedCafeId = new URLSearchParams(location.search).get('cafe') || '';
  const [text, setText] = useState('');
  const [cafeId, setCafeId] = useState(requestedCafeId);
  const [rating, setRating] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [photoRightsConfirmed, setPhotoRightsConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const avatar = useMemo(() => getAvatar(user, userProfile), [user, userProfile]);
  const username = userProfile?.username || user?.email?.split('@')[0] || 'coffee lover';
  const selectedCafe = useMemo(() => (
    cafes.find((cafe) => cafe.id === cafeId)
    || interactionsByCafeId.get(cafeId)?.cafe
    || null
  ), [cafeId, cafes, interactionsByCafeId]);
  const cafeOptions = useMemo(() => (
    selectedCafe && !cafes.some((cafe) => cafe.id === selectedCafe.id)
      ? [selectedCafe, ...cafes]
      : cafes
  ), [cafes, selectedCafe]);

  useEffect(() => {
    if (location.pathname !== '/new-post') return;
    setCafeId(requestedCafeId);
  }, [location.pathname, location.key, requestedCafeId]);

  useEffect(() => {
    if (location.pathname !== '/new-post' || !cafeId || !interactionsLoaded) return;
    const hydrationKey = `${location.key}:${cafeId}`;
    if (hydratedComposerRef.current === hydrationKey) return;

    const currentInteraction = interactionsByCafeId.get(cafeId);
    setText(currentInteraction?.review_text || '');
    setRating(Number(currentInteraction?.rating) || 0);
    setIsFavorite(Boolean(currentInteraction?.is_favorite));
    hydratedComposerRef.current = hydrationKey;
  }, [cafeId, interactionsByCafeId, interactionsLoaded, location.key, location.pathname]);

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
        });
      }

      const postPayload = {
        user_id: user.id,
        cafe_id: cafeId || null,
        content,
        kind: cafeId ? 'review' : 'post',
        rating: cafeId && rating ? rating : null,
        visited_on: null,
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
      setIsFavorite(false);
      clearPhotos();
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
        <header className="social-topbar"><button type="button" aria-label="Cerrar" onClick={() => navigate(-1)}><X size={19} /></button><span>Nueva publicación</span><button type="button" className="social-post-button" disabled={(!text.trim() && photos.length === 0) || submitting} onClick={publishPost}>{submitting ? 'Subiendo…' : 'Publicar'}</button></header>
        {feedback.message && <p className={`post-feedback post-feedback-${feedback.type}`}>{feedback.message}</p>}
        <section className="new-post-composer">
          <div className="new-post-actions"><button type="button" onClick={() => navigate(-1)}>Cancelar</button><span>Comunidad Mérida</span></div>
          <div className="new-post-author"><img src={avatar} alt="" /><strong>{username}</strong></div>
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="¿Qué cafetería visitaste hoy?" maxLength={1000} autoFocus />
          {photoPreviews.length > 0 && <div className="new-post-photo-preview new-post-photo-gallery">{photoPreviews.map((preview, index) => <img src={preview} alt={`Vista previa ${index + 1}`} key={preview} />)}<button type="button" onClick={clearPhotos} aria-label="Quitar fotos"><X size={16} /></button></div>}
          <label className="new-post-cafe-picker"><MapPin size={16} /><select value={cafeId} onChange={(event) => setCafeId(event.target.value)}><option value="">Relacionar una cafetería (opcional)</option>{cafeOptions.map((cafe) => <option value={cafe.id} key={cafe.id}>{cafe.nombre}</option>)}</select></label>
          {photoPreviews.length > 0 && selectedCafe && <label className="new-post-photo-rights"><input type="checkbox" checked={photoRightsConfirmed} onChange={(event) => setPhotoRightsConfirmed(event.target.checked)} /><span>Confirmo que estas fotos son mías o que tengo permiso para publicarlas. Se agregarán a la galería de la cafetería y podrán usarse como portada.</span></label>}
          {selectedCafe && (
            <div className="new-post-review-options">
              <label className="new-post-rating"><Star size={17} /><span>Calificación</span><HalfStarRating value={rating} onChange={setRating} size={23} /></label>
              <label className="new-post-favorite"><input type="checkbox" checked={isFavorite} onChange={(event) => setIsFavorite(event.target.checked)} /><Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} /> Agregar a favoritos</label>
            </div>
          )}
          <div className="new-post-toolbar"><button type="button" aria-label="Elegir imágenes de la galería" onClick={() => fileInputRef.current?.click()}><ImagePlus size={19} /></button><MapPin size={18} aria-hidden="true" /><Link2 size={18} aria-hidden="true" /><span>{text.length}/1000</span></div>
          <input ref={fileInputRef} hidden type="file" accept="image/*" multiple onChange={choosePhotos} />
        </section>
      </div>
      <BottomNav />
    </main>
  );
}

export default NewPostPage;
