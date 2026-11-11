import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { supabase } from '../supabase';
import { geocodeCafeLocation } from '../utils/cafeLocation';
import { permanentlyDeleteCafe } from '../utils/deleteCafes';
import { buildCafeEditorPatch, createCafeDraft, hasCafeDraftChanges, normalizeCafeEditorUrl, saveCafeEditorPatch, validateCafeImage } from '../utils/cafeEditor';

export default function useCafeInlineEditor({ cafe, active, onMediaChange, onDeleted }) {
  const { user, userProfile } = useAuth();
  const { updateCafe, removeCafe } = useCoffeeData();
  const isAdmin = Boolean(user?.id && userProfile?.id === user.id && userProfile.role === 'administrador');
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const files = useRef(new Map());
  const editing = isAdmin && Boolean(session);
  const dirty = hasCafeDraftChanges(session?.base, session?.draft);

  const clearFiles = () => {
    files.current.forEach((_, url) => URL.revokeObjectURL(url));
    files.current.clear();
  };
  useEffect(() => {
    const pendingFiles = files.current;
    return () => pendingFiles.forEach((_, url) => URL.revokeObjectURL(url));
  }, []);
  useEffect(() => {
    if (!editing || (!dirty && !busy)) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing, dirty, busy]);

  const run = async (action, successMessage) => {
    if (!isAdmin || !active || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(successMessage);
    } catch (err) {
      setError(err.message || 'No pudimos guardar el cambio. Intenta otra vez.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const change = (field, value) => {
    if (!isAdmin || busyRef.current) return;
    setSession((current) => current ? { ...current, draft: { ...current.draft, [field]: value } } : current);
    setError(''); setNotice('');
  };
  const start = () => {
    if (!isAdmin || !cafe) return;
    const draft = createCafeDraft(cafe);
    setSession({ base: draft, draft });
    setError(''); setNotice('');
  };
  const discard = () => {
    if (busyRef.current) return;
    clearFiles(); setSession(null); setConfirmation(null); setError(''); setNotice('');
  };
  const stageImages = (field, selectedFiles) => {
    if (!isAdmin || !session || busyRef.current || !selectedFiles.length) return;
    try {
      selectedFiles.forEach(validateCafeImage);
      if (field === 'menuImages' && session.draft.menuImages.length + selectedFiles.length > 12) throw new Error('Puedes agregar hasta 12 imágenes de menú.');
      const urls = selectedFiles.map((file) => {
        const url = URL.createObjectURL(file);
        files.current.set(url, file);
        return url;
      });
      change(field, field === 'image_url' ? urls[0] : [...session.draft.menuImages, ...urls]);
    } catch (err) { setError(err.message); }
  };
  const upload = async (file, folder) => {
    validateCafeImage(file);
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }[file.type];
    const path = `${user.id}/${folder}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('cafe-photos').upload(path, file, { contentType: file.type });
    if (uploadError) throw uploadError;
    return { path, url: supabase.storage.from('cafe-photos').getPublicUrl(path).data.publicUrl };
  };
  const save = () => run(async () => {
    if (!session || !dirty) return;
    const { base, draft } = session;
    const uploaded = [];
    let committed = false;
    let commitAttempted = false;
    try {
      // Validate before uploading; object URLs are local previews, not stored URLs.
      const placeholder = (url) => files.current.has(url) ? 'https://upload.pending/image' : url;
      const patch = buildCafeEditorPatch(base, { ...draft, image_url: placeholder(draft.image_url), menuImages: draft.menuImages.map(placeholder) });
      if (patch.address || patch.link) {
        const locationInput = Object.hasOwn(patch, 'address') && !Object.hasOwn(patch, 'link')
          ? { ...cafe, ...patch, link: null, source_url: null, sourceUrl: null }
          : { ...cafe, ...patch, source_url: null, sourceUrl: null };
        const coordinates = await geocodeCafeLocation(locationInput);
        if (!coordinates || coordinates.lat < 20.86 || coordinates.lat > 21.08 || coordinates.lng < -89.75 || coordinates.lng > -89.52) {
          throw new Error('No encontramos una ubicación dentro de Mérida. Revisa la dirección o el enlace de Google Maps.');
        }
        Object.assign(patch, coordinates, { source: 'manual', last_verified_at: new Date().toISOString() });
        // An old Maps link must not override newly verified address coordinates.
        if (Object.hasOwn(patch, 'address') && !Object.hasOwn(patch, 'link')) patch.link = null;
      }
      const uploadPreview = async (url, folder) => {
        if (!files.current.has(url)) return url;
        const image = await upload(files.current.get(url), folder);
        uploaded.push(image.path);
        return image.url;
      };
      if (Object.hasOwn(patch, 'image_url')) patch.image_url = await uploadPreview(draft.image_url, 'covers') || null;
      if (Object.hasOwn(patch, 'menu_url')) {
        const urls = [];
        for (const url of draft.menuImages) urls.push(await uploadPreview(url, 'menus'));
        patch.menu_url = JSON.stringify(urls);
      }
      commitAttempted = true;
      const saved = await saveCafeEditorPatch(supabase, cafe.id, patch);
      committed = true;
      updateCafe(saved);
      clearFiles(); setSession(null);
    } catch (err) {
      // A lost response can hide a successful commit. Keep uploaded files in
      // that case rather than break URLs that the server may already use.
      if (!committed && uploaded.length && (!commitAttempted || err.code)) await supabase.storage.from('cafe-photos').remove(uploaded).catch(() => {});
      throw err;
    }
  }, 'Cambios guardados.');

  const addGalleryPhoto = (file, rightsConfirmed, onSuccess) => run(async () => {
    if (!rightsConfirmed) throw new Error('Confirma que tienes permiso para publicar la foto.');
    const image = await upload(file, 'gallery');
    let committed = false;
    let rejected = false;
    try {
      const { data, error: insertError } = await supabase.from('cafe_photos').insert({
        cafe_id: cafe.id, user_id: user.id, storage_path: image.path, public_url: image.url,
        status: 'approved', is_cover: false, rights_confirmed: true, rights_basis: 'permission',
      }).select('id').single();
      if (insertError) { rejected = Boolean(insertError.code); throw insertError; }
      if (!data?.id) throw new Error('No se pudo confirmar la publicación de la foto.');
      committed = true;
      onSuccess();
      onMediaChange();
    } finally {
      if (!committed && rejected) await supabase.storage.from('cafe-photos').remove([image.path]).catch(() => {});
    }
  }, 'Foto publicada en la galería.');

  const addTikTok = (value, title, onSuccess) => run(async () => {
    const url = normalizeCafeEditorUrl(value, 'TikTok', 'tiktok.com');
    if (!url) throw new Error('Agrega el enlace del video.');
    const { data, error: insertError } = await supabase.from('cafe_tiktoks').insert({
      cafe_id: cafe.id, url, title: title.trim() || null,
    }).select('id').single();
    if (insertError) throw insertError;
    if (!data?.id) throw new Error('No se pudo confirmar el video.');
    onSuccess(); onMediaChange();
  }, 'TikTok agregado.');

  const confirm = () => {
    if (confirmation?.type === 'discard') { discard(); return; }
    return run(async () => {
      if (confirmation.type === 'cafe') {
        await permanentlyDeleteCafe(supabase, cafe.id);
        removeCafe(cafe.id);
        clearFiles(); setSession(null); onDeleted();
      } else if (confirmation.type === 'photo') {
        const { data, error: deleteError } = await supabase.from('cafe_photos').update({ status: 'rejected' }).eq('id', confirmation.id).eq('cafe_id', cafe.id).select('id').single();
        if (deleteError) throw deleteError;
        if (!data?.id) throw new Error('No se pudo confirmar el cambio.');
        onMediaChange();
      } else if (confirmation.type === 'tiktok') {
        const { data, error: deleteError } = await supabase.from('cafe_tiktoks').delete().eq('id', confirmation.id).eq('cafe_id', cafe.id).select('id').single();
        if (deleteError) throw deleteError;
        if (!data?.id) throw new Error('No se pudo confirmar la eliminación.');
        onMediaChange();
      }
      setConfirmation(null);
    }, 'Cambio guardado.');
  };
  return {
    isAdmin, editing, dirty, busy, error, notice, draft: session?.draft, confirmation,
    change, start, save, stageImages, addGalleryPhoto, addTikTok, confirm,
    requestCancel: () => dirty ? setConfirmation({ type: 'discard' }) : discard(),
    requestConfirmation: (value) => { setError(''); setConfirmation(value); },
    closeConfirmation: () => { if (!busyRef.current) { setConfirmation(null); setError(''); } },
  };
}
