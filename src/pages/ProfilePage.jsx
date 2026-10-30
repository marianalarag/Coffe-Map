import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  Coffee,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  Settings,
  Share2,
  SlidersHorizontal,
  UserPlus,
  Users,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import PageLoading from '../components/PageLoading';
import { supabase } from '../supabase';
import { ActivityFeed } from './ActivityPage';
import { getCafeNeighborhood } from '../utils/cafeAddress';
import CoffeeBeanIcon, { CoffeeBeanRating } from '../components/CoffeeBeanIcon';
import { formatRating } from '../utils/formatRating';
import HalfStarRating from '../components/HalfStarRating';
import ProfileCafeCard from '../components/ProfileCafeCard';
import { getPersonalCafeRating } from '../utils/personalRating';


const getOptimizedProfileImageUrl = (url) => url;

const getProfileAssetPath = (userId, kind, file) => {
  const fileExt = file.name.split('.').pop() || 'png';
  const fileId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${userId}/${kind}-${fileId}.${fileExt}`;
};

const optimizeProfileImage = async (file, kind) => {
  if (kind === 'avatar') return file;
  if (!window.createImageBitmap || !file.type.startsWith('image/')) return file;

  try {
    const bitmap = await window.createImageBitmap(file);
    const maxDimension = kind === 'avatar' ? 1200 : 2400;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', kind === 'avatar' ? 0.98 : 0.88));
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || kind;
    return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
};

const getProfileSaveErrorMessage = (error) => {
  const message = error?.message || 'No se pudo guardar el perfil.';

  if (
    message.includes('cover_url')
    || message.includes('text_color')
    || error?.code === 'PGRST204'
  ) {
    return 'Falta correr el SQL actualizado en Supabase para agregar cover_url y text_color en profiles. Después recarga la página.';
  }

  return message;
};

function ProfileImageCropper({ file, kind, onCancel, onConfirm }) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const dragRef = useRef(null);
  const viewportRef = useRef(null);
  const isCover = kind === 'cover';

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  const handlePointerDown = (event) => {
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    setPosition((current) => ({
      x: Math.max(0, Math.min(100, current.x - ((event.clientX - drag.x) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, current.y - ((event.clientY - drag.y) / rect.height) * 100)),
    }));
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
  };

  const exportCrop = async () => {
    if (!previewUrl) return;
    const image = new Image();
    image.src = previewUrl;
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });

    const outputWidth = isCover ? 2400 : Math.max(1, Math.min(1200, Math.floor(Math.min(image.naturalWidth, image.naturalHeight) / zoom)));
    const outputHeight = isCover ? 960 : outputWidth;
    const scale = Math.max(outputWidth / image.naturalWidth, outputHeight / image.naturalHeight) * zoom;
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = image.naturalHeight * scale;
    const sourceLeft = ((renderedWidth - outputWidth) * (position.x / 100)) / scale;
    const sourceTop = ((renderedHeight - outputHeight) * (position.y / 100)) / scale;
    const sourceWidth = outputWidth / scale;
    const sourceHeight = outputHeight / scale;
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, sourceLeft, sourceTop, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
    const mimeType = isCover ? 'image/webp' : 'image/png';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, 0.88));
    if (blob) onConfirm(new File([blob], `${kind}-cropped.${isCover ? 'webp' : 'png'}`, { type: mimeType, lastModified: Date.now() }));
  };

  return (
    <div className="profile-crop-backdrop" role="dialog" aria-modal="true" aria-label={`Ajustar ${isCover ? 'portada' : 'foto de perfil'}`}>
      <section className="profile-crop-modal">
        <header><div><small>AJUSTAR IMAGEN</small><h2>{isCover ? 'Ajusta tu portada' : 'Ajusta tu foto de perfil'}</h2></div><button type="button" onClick={onCancel} aria-label="Cerrar"><X size={18} /></button></header>
        <div
          ref={viewportRef}
          className={`profile-crop-viewport ${isCover ? 'is-cover' : 'is-avatar'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
        >
          {previewUrl && <img src={previewUrl} alt="Vista previa" style={{ objectPosition: `${position.x}% ${position.y}%`, transform: `scale(${zoom})` }} />}
          <div className="profile-crop-grid" aria-hidden="true" />
        </div>
        <label className="profile-crop-zoom">Zoom <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <p className="profile-crop-help">Arrastra la imagen para encuadrarla y usa la cuadrícula como guía.</p>
        <div className="profile-crop-actions"><button type="button" className="is-secondary" onClick={onCancel}>Cancelar</button><button type="button" onClick={exportCrop}>Usar imagen</button></div>
      </section>
    </div>
  );
}

function ProfileRatingChart({ interactions, textStyle, navigate }) {
  const rows = Array.from({ length: 10 }, (_, index) => 5 - (index * 0.5)).map((rating) => ({
    rating,
    count: interactions.filter((interaction) => Math.round(Number(interaction.rating || 0) * 2) / 2 === rating).length,
  }));
  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section className="profile-rating-chart" aria-label="Distribución de tus calificaciones">
      <div className="profile-rating-heading"><div><small>REPARTO DE CALIFICACIONES</small><h2 style={textStyle}>Tus calificaciones</h2></div><CoffeeBeanIcon size={22} filled /></div>
      <div className="profile-rating-rows">
        {rows.map((row) => (
          <button
            type="button"
            className="profile-rating-row"
            key={row.rating}
            onClick={() => navigate(`/ratings?rating=${row.rating}`)}
            aria-label={`Ver cafeterías calificadas con ${formatRating(row.rating)} de 5`}
          >
            <span>{row.rating}</span>
            <CoffeeBeanRating value={row.rating} size={8} />
            <div className="profile-rating-track"><span style={{ width: `${(row.count / maxCount) * 100}%` }} /></div>
            <strong>{row.count}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProfileVisitRanking({ places, textStyle, onSelectCafe }) {
  return (
    <section className="profile-visit-ranking">
      <div className="profile-rating-heading"><div><small>HISTORIAL</small><h2 style={textStyle}>Cafés más visitados</h2></div><Coffee size={20} /></div>
      {places.length > 0 ? (
        <div className="profile-visit-ranking-list">
          {places.slice(0, 6).map(({ cafe, count, rating, reviewCount }) => (
            <article className="profile-visit-ranking-card" key={cafe.id}>
              <button type="button" className="profile-visit-ranking-main" onClick={() => onSelectCafe(cafe)} aria-label={`Abrir tus ${count === 1 ? 'visita' : 'visitas'} a ${cafe.nombre}`}>
                {cafe.imageUrl ? <img src={cafe.imageUrl} alt={cafe.nombre} /> : <span className="profile-cafe-placeholder"><Coffee size={20} /></span>}
                <span><strong>{cafe.nombre}</strong><small><Coffee size={12} /> {count} {count === 1 ? 'visita' : 'visitas'}{reviewCount ? ` · ${reviewCount} ${reviewCount === 1 ? 'reseña' : 'reseñas'}` : ''}{rating ? ` · ${formatRating(rating)}` : ''}</small></span>
              </button>
            </article>
          ))}
        </div>
      ) : <p className="profile-ranking-empty">Marca una cafetería como visitada para comenzar tu historial.</p>}
    </section>
  );
}

function ProfileCafeVisitHistory({ cafe, visits, onClose, onSaveReview, onDeleteReview, onDeleteVisit }) {
  const [editingVisitId, setEditingVisitId] = useState(null);
  const [draftText, setDraftText] = useState('');
  const [draftRating, setDraftRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEditing = (visit) => {
    setEditingVisitId(visit.id);
    setDraftText(visit.review_text || '');
    setDraftRating(Number(visit.rating) || 0);
    setError('');
  };

  const saveReview = async (event, visit) => {
    event.preventDefault();
    const text = draftText.trim();
    if (!text && !draftRating) {
      setError('Escribe tu reseña o agrega una calificación.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSaveReview(visit, { review_text: text, rating: draftRating || null });
      setEditingVisitId(null);
    } catch {
      setError('No pudimos guardar la reseña. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const removeReview = async (visit) => {
    if (!window.confirm(`¿Borrar la reseña de esta visita a ${cafe.nombre}? La visita se conservará.`)) return;
    setSaving(true);
    setError('');
    try {
      await onDeleteReview(visit);
      if (editingVisitId === visit.id) setEditingVisitId(null);
    } catch {
      setError('No pudimos borrar la reseña. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const removeVisit = async (visit) => {
    if (!window.confirm(`¿Eliminar esta visita a ${cafe.nombre}?`)) return;
    setSaving(true);
    setError('');
    try {
      await onDeleteVisit(visit);
    } catch {
      setError('No pudimos eliminar la visita. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-history-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="profile-history-sheet" role="dialog" aria-modal="true" aria-label={`Tus reseñas de ${cafe.nombre}`}>
        <header className="profile-history-header">
          <div>{cafe.imageUrl ? <img src={cafe.imageUrl} alt="" /> : <Coffee size={22} />}<span><small>TUS VISITAS Y RESEÑAS</small><h2>Tus reseñas de {cafe.nombre}</h2><p>{visits.length} {visits.length === 1 ? 'visita' : 'visitas'}</p></span></div>
          <button type="button" onClick={onClose} aria-label="Cerrar historial"><X size={19} /></button>
        </header>
        <div className="profile-history-list">
          {visits.map((visit) => {
            const hasReview = Boolean(String(visit.review_text || '').trim() || Number(visit.rating) > 0);
            const dateValue = visit.visited_on || visit.created_at || visit.updated_at;
            const dateLabel = dateValue ? new Date(`${String(dateValue).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Fecha sin registrar';
            const isEditing = editingVisitId === visit.id;
            return <article className="profile-history-entry" key={visit.id}>
              <div className="profile-history-entry-meta"><span>{dateLabel}</span>{hasReview && (Number(visit.rating) > 0 ? <span className="profile-history-rating"><CoffeeBeanRating value={Number(visit.rating)} size={11} /> {formatRating(visit.rating)}</span> : <span className="profile-history-rating">Reseña</span>)}</div>
              {isEditing ? <form className="profile-history-edit" onSubmit={(event) => saveReview(event, visit)}>
                <label>Calificación <HalfStarRating value={draftRating} onChange={setDraftRating} size={16} label="Tu calificación" /></label>
                <label>Tu reseña<textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} maxLength={1000} placeholder="¿Qué te pareció esta visita?" /></label>
                {error && <p className="profile-history-error" role="alert">{error}</p>}
                <div className="profile-history-actions"><button type="button" className="is-secondary" onClick={() => setEditingVisitId(null)} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar reseña'}</button></div>
              </form> : <>
                {visit.review_text ? <p className="profile-history-review-text">{visit.review_text}</p> : <p className="profile-history-visit-only">Visita registrada sin reseña.</p>}
                <div className="profile-history-actions">
                  <button type="button" onClick={() => startEditing(visit)} disabled={saving}>{hasReview ? 'Editar reseña' : 'Añadir reseña'}</button>
                  {hasReview ? <button type="button" className="is-danger" onClick={() => removeReview(visit)} disabled={saving}>Borrar reseña</button> : <button type="button" className="is-danger" onClick={() => removeVisit(visit)} disabled={saving}>Eliminar visita</button>}
                </div>
              </>}
            </article>;
          })}
          {visits.length === 0 && <p className="profile-history-empty">Ya no hay visitas registradas para esta cafetería.</p>}
          {error && editingVisitId === null && <p className="profile-history-error" role="alert">{error}</p>}
        </div>
      </section>
    </div>
  );
}

function ProfilePage() {
  const { user, userProfile, logout, updateCachedProfile } = useAuth();
  const {
    cafeById,
    cafesLoaded,
    loadCafes,
    interactions,
    interactionsLoaded,
    interactionsLoading,
    interactionsError,
    refreshUserInteractions,
    saveCafeInteraction,
    deleteCafeInteraction,
  } = useCoffeeData();
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = new URLSearchParams(location.search).get('tab') || 'profile';

  const [uploadingField, setUploadingField] = useState('');
  const [savingColor, setSavingColor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [historyCafe, setHistoryCafe] = useState(null);
  const settingsMenuRef = useRef(null);
  const colorSaveTimerRef = useRef(null);
  const [showAvatarViewer, setShowAvatarViewer] = useState(false);
  const [cropRequest, setCropRequest] = useState(null);
  const [draftTextColor, setDraftTextColor] = useState(userProfile?.text_color || '#E6DAC1');

  const openProfileTab = (tab) => navigate(tab === 'profile' ? '/profile' : `/profile?tab=${tab}`);

  useEffect(() => {
    if (!showAvatarViewer) return;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setShowAvatarViewer(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showAvatarViewer]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!cafesLoaded) {
      loadCafes().catch(() => {});
    }
  }, [cafesLoaded, loadCafes, navigate, user]);

  useEffect(() => {
    if (!showSettings) return undefined;

    const closeSettings = (event) => {
      if (event.key === 'Escape' || !settingsMenuRef.current?.contains(event.target)) {
        setShowSettings(false);
      }
    };

    document.addEventListener('pointerdown', closeSettings);
    document.addEventListener('keydown', closeSettings);
    return () => {
      document.removeEventListener('pointerdown', closeSettings);
      document.removeEventListener('keydown', closeSettings);
    };
  }, [showSettings]);

  useEffect(() => {
    setDraftTextColor(userProfile?.text_color || '#E6DAC1');
  }, [userProfile?.text_color]);

  useEffect(() => () => window.clearTimeout(colorSaveTimerRef.current), []);

  const stats = useMemo(() => ({
    visited: interactions.filter((interaction) => interaction.is_visited).length,
    favorites: interactions.filter((interaction) => interaction.is_favorite).length,
    waitingList: interactions.filter((interaction) => interaction.in_waitlist).length,
    rated: interactions.filter((interaction) => interaction.rating && interaction.rating > 0).length,
  }), [interactions]);

  const profile = useMemo(() => {
    const username = userProfile?.username || user?.user_metadata?.username || 'Usuario Coffee';

    return {
      id: user?.id,
      username,
      handle: user?.email?.split('@')[0] || username,
      avatarUrl: userProfile?.avatar_url || `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(username)}`,
      coverUrl: userProfile?.cover_url || '',
      textColor: userProfile?.text_color || '#E6DAC1',
      role: userProfile?.role || 'usuario',
      stats,
    };
  }, [stats, user, userProfile]);

  const visitedPlaces = useMemo(() => {
    const grouped = new Map();
    interactions
      .filter((interaction) => interaction.is_visited)
      .forEach((interaction) => {
        const cafe = cafeById.get(interaction.cafe_id) || interaction.cafe;
        if (!cafe) return;
        const visitedAt = interaction.visited_on || interaction.updated_at || '';
        const current = grouped.get(cafe.id) || { cafe, latestInteraction: null, latestAt: '', visitCount: 0 };
        current.visitCount += 1;
        if (!current.latestInteraction || visitedAt > current.latestAt) {
          current.latestInteraction = interaction;
          current.latestAt = visitedAt;
        }
        grouped.set(cafe.id, current);
      });

    return [...grouped.values()]
      .sort((first, second) => second.latestAt.localeCompare(first.latestAt))
      .map(({ cafe, latestInteraction, visitCount }) => ({
        ...latestInteraction,
        cafe,
        visitCount,
      }));
  }, [cafeById, interactions]);

  const favoritePlaces = useMemo(() => {
    return interactions
      .filter((interaction) => interaction.is_favorite)
      .map((interaction) => cafeById.get(interaction.cafe_id) || interaction.cafe)
      .filter(Boolean);
  }, [cafeById, interactions]);

  const visitedCafeStats = useMemo(() => {
    const grouped = new Map();
    interactions.filter((interaction) => interaction.is_visited).forEach((interaction) => {
      const cafe = cafeById.get(interaction.cafe_id) || interaction.cafe;
      if (!cafe) return;
      const current = grouped.get(cafe.id) || { cafe, count: 0, rating: 0, lastVisited: '', latestVisitId: null, reviewCount: 0 };
      current.count += 1;
      if (String(interaction.review_text || '').trim()) current.reviewCount += 1;
      const visitedAt = interaction.visited_on || interaction.updated_at || '';
      if (visitedAt >= current.lastVisited) {
        current.rating = Number(interaction.rating || cafe.rating || 0);
        current.lastVisited = visitedAt;
        current.latestVisitId = interaction.id;
      }
      grouped.set(cafe.id, current);
    });
    return [...grouped.values()].sort((first, second) => second.count - first.count || second.lastVisited.localeCompare(first.lastVisited));
  }, [cafeById, interactions]);

  const removeFavorite = async (event, cafe) => {
    event.stopPropagation();
    await saveCafeInteraction(cafe.id, { is_favorite: false });
  };

  const saveVisitReview = (visit, updates) => saveCafeInteraction(visit.cafe_id, {
    ...updates,
    is_visited: true,
    visited_on: visit.visited_on || visit.updated_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  }, { interactionId: visit.id });

  const deleteVisitReview = (visit) => saveCafeInteraction(visit.cafe_id, {
    review_text: '',
    rating: null,
    is_visited: true,
  }, { interactionId: visit.id });

  const deleteVisit = (visit) => deleteCafeInteraction(visit.id);

  const recentCafes = visitedPlaces.length > 0
    ? visitedPlaces.filter((visit) => visit.cafe && !visit.cafe.deleted_at).slice(0, 4).map((visit) => ({ ...visit.cafe, rating: getPersonalCafeRating(interactions, visit.cafe.id) }))
    : [];

  const persistProfileUpdates = async (updates) => {
    if (!user?.id) return;

    const payload = {
      updated_at: new Date().toISOString(),
      ...updates,
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id)
      .select('id,username,avatar_url,cover_url,text_color,role')
      .single();

    if (error) throw error;
    updateCachedProfile(data);
  };

  const startImageCrop = (event, kind) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Selecciona una imagen válida.');
      event.target.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('La imagen debe pesar menos de 8 MB.');
      event.target.value = '';
      return;
    }
    setShowSettings(false);
    setShowAvatarViewer(false);
    setCropRequest({ file, kind });
  };

  const uploadProfileImage = async (source, kind) => {
    try {
      const file = source?.target ? source.target.files?.[0] : source;
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        throw new Error('Selecciona una imagen válida.');
      }

      if (file.size > 8 * 1024 * 1024) {
        throw new Error('La imagen debe pesar menos de 8 MB.');
      }

      setUploadingField(kind);
      const optimizedFile = await optimizeProfileImage(file, kind);
      const fileName = getProfileAssetPath(user.id, kind, optimizedFile);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, optimizedFile, {
          contentType: optimizedFile.type,
          cacheControl: '31536000',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const field = kind === 'cover' ? 'cover_url' : 'avatar_url';
      await persistProfileUpdates({ [field]: data.publicUrl });
    } catch (error) {
      alert(getProfileSaveErrorMessage(error));
    } finally {
      setUploadingField('');
      if (source?.target) source.target.value = '';
    }
  };

  const confirmCrop = async (file, kind) => {
    setCropRequest(null);
    await uploadProfileImage(file, kind);
  };

  const updateTextColor = async (textColor) => {
    try {
      setSavingColor(true);
      await persistProfileUpdates({ text_color: textColor });
    } catch (error) {
      alert(getProfileSaveErrorMessage(error));
    } finally {
      setSavingColor(false);
    }
  };

  const previewAndSaveTextColor = (textColor) => {
    setDraftTextColor(textColor);
    window.clearTimeout(colorSaveTimerRef.current);
    colorSaveTimerRef.current = window.setTimeout(() => {
      void updateTextColor(textColor);
    }, 350);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const shareProfile = async () => {
    const shareUrl = new URL(`/profile/${encodeURIComponent(user.id)}`, window.location.origin).href;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Coffee Map', text: profile.username, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link copiado.');
      }
    } catch {
      // User cancelled native share.
    }
  };

  if (!user || !interactionsLoaded || (interactionsLoading && interactions.length === 0)) {
    return <PageLoading message="Cargando perfil..." />;
  }

  const textStyle = { color: draftTextColor };
  const avatarDisplayUrl = getOptimizedProfileImageUrl(profile.avatarUrl, 512);
  const avatarViewerUrl = getOptimizedProfileImageUrl(profile.avatarUrl, 1024);
  const coverStyle = profile.coverUrl
    ? { backgroundImage: `url(${profile.coverUrl})` }
    : undefined;

  return (
    <main className="profile-page" style={textStyle}>
      <section className="profile-scroll">
        {interactionsError && <div className="profile-load-error" role="alert"><span>{interactionsError}</span><button type="button" onClick={() => refreshUserInteractions().catch(() => {})} disabled={interactionsLoading}>{interactionsLoading ? 'Reintentando…' : 'Reintentar'}</button></div>}
        <header className="profile-hero">
          <div
            className="profile-cover"
            style={coverStyle}
            role="img"
            aria-label={profile.coverUrl ? `Portada de ${profile.username}` : 'Portada predeterminada del perfil'}
          >
            <div className="absolute inset-0 bg-linear-to-b from-black/35 via-[#1D1A15]/20 to-[#1D1A15]" />
            {!profile.coverUrl && (
              <div className="absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_30%_20%,#765446,transparent_34%),radial-gradient(circle_at_70%_30%,#B39978,transparent_30%),linear-gradient(135deg,#372821,#1D1A15)]" />
            )}
          </div>

          <label
            className="profile-cover-edit"
            aria-label="Cambiar foto de portada"
            aria-hidden={showSettings || undefined}
          >
            {uploadingField === 'cover' ? <Loader2 className="animate-spin" size={15} /> : <Camera size={15} />}
            <span>Cambiar portada</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => startImageCrop(event, 'cover')}
              disabled={Boolean(uploadingField)}
              className="hidden"
            />
          </label>

          <div className={`relative flex items-center justify-between ${showSettings ? 'z-50' : 'z-20'}`}>
            <button onClick={() => navigate('/')} className="profile-icon-button">
              <ArrowLeft size={22} />
            </button>

            <div className="relative" ref={settingsMenuRef}>
              <button
                onClick={() => setShowSettings((current) => !current)}
                className="profile-icon-button"
                aria-label="Abrir configuración"
                aria-expanded={showSettings}
                aria-controls="profile-settings-menu"
              >
                <Settings size={21} />
              </button>

              {showSettings && (
                <>
                  <button
                    type="button"
                    className="profile-settings-backdrop"
                    onClick={() => setShowSettings(false)}
                    aria-label="Cerrar configuración"
                  />
                  <div id="profile-settings-menu" className="profile-settings-panel" role="menu">
                    <p className="profile-settings-title">Configuración</p>
                    <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer text-sm font-bold">
                      <Camera size={16} />
                      Cambiar portada
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => startImageCrop(event, 'cover')}
                        disabled={Boolean(uploadingField)}
                        className="hidden"
                      />
                    </label>

                    <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer text-sm font-bold">
                      <Camera size={16} />
                      Cambiar avatar
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => startImageCrop(event, 'avatar')}
                        disabled={Boolean(uploadingField)}
                        className="hidden"
                      />
                    </label>

                    <button
                      onClick={() => {
                        setShowSettings(false);
                        navigate('/settings');
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-sm font-bold"
                    >
                      <SlidersHorizontal size={16} />
                      Ajustes
                    </button>

                    <button
                      onClick={handleLogout}
                      className="w-full mt-1 flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-sm font-bold text-red-300"
                    >
                      <LogOut size={16} />
                      Salir
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="profile-identity">
            <div
              className="relative profile-avatar-wrap"
              role="button"
              tabIndex={0}
              aria-label="Abrir foto de perfil y cambiarla"
              aria-haspopup="dialog"
              onClick={() => setShowAvatarViewer(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setShowAvatarViewer(true);
                }
              }}
            >
              <div className="profile-avatar">
                <img
                  src={avatarDisplayUrl}
                  alt={profile.username}
                  width="320"
                  height="320"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  onError={(event) => {
                    if (event.currentTarget.src !== profile.avatarUrl) event.currentTarget.src = profile.avatarUrl;
                  }}
                  className={`w-full h-full object-cover ${uploadingField === 'avatar' ? 'opacity-50' : ''}`}
                />
              </div>
              {uploadingField === 'avatar' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="animate-spin" size={22} />
                </div>
              )}
            </div>

            <div className="profile-identity-copy">
              <h1 className="profile-name" style={textStyle}>
                {profile.username}
              </h1>
              <p className="profile-handle" style={textStyle}>
                @{profile.handle}
              </p>
            </div>

            <div className="profile-stats" aria-label="Estadísticas del perfil">
              <button type="button" onClick={() => openProfileTab('visited')}>
                <strong>{profile.stats.visited}</strong><span>Visitadas</span>
              </button>
              <button type="button" onClick={() => navigate('/favorites')}>
                <strong>{profile.stats.favorites}</strong><span>Favoritas</span>
              </button>
              <button type="button" onClick={() => navigate('/list')}>
                <strong>{profile.stats.waitingList}</strong><span>Lista</span>
              </button>
              <button type="button" onClick={() => navigate('/ratings')}>
                <strong>{profile.stats.rated}</strong><span>Calificadas</span>
              </button>
            </div>
          </div>
        </header>

        <nav className="profile-navigation" aria-label="Secciones del perfil">
          <button type="button" className={activeTab === 'profile' ? 'is-active' : ''} onClick={() => openProfileTab('profile')}>Perfil</button>
          <button type="button" className={activeTab === 'activity' ? 'is-active' : ''} onClick={() => openProfileTab('activity')}>Actividad</button>
          <button type="button" className={activeTab === 'visited' ? 'is-active' : ''} onClick={() => openProfileTab('visited')}>Visitadas</button>
          <button type="button" className={activeTab === 'friends' ? 'is-active' : ''} onClick={() => openProfileTab('friends')}>Amigos</button>
          <button type="button" onClick={() => navigate('/list')}>Lista</button>
          <button type="button" onClick={() => navigate('/favorites')}>Favoritos</button>
        </nav>

        {activeTab === 'profile' && <div className="profile-content-grid">
        <div className="profile-content-main-column">
        <section className="profile-recent-section">
          <div className="profile-section-heading">
            <h2 style={textStyle}>Lugares recientemente visitados</h2>
            <button type="button" style={textStyle} onClick={() => openProfileTab('visited')}>Ver más</button>
          </div>

          <div className="profile-recent-row">
            {recentCafes.length > 0 ? (
              recentCafes.map((cafe) => (
                  <ProfileCafeCard key={cafe.id} cafe={cafe} onClick={() => navigate(`/cafe/${cafe.id}`)} />
                ))
            ) : (
              <div className="profile-empty-recent">
                <Coffee className="opacity-45 mb-2" size={28} />
                <p className="text-sm opacity-70" style={textStyle}>Marca cafeterías como visitadas para llenar esta sección.</p>
              </div>
            )}
          </div>
        </section>

        <ProfileVisitRanking places={visitedCafeStats} textStyle={textStyle} onSelectCafe={setHistoryCafe} />
        </div>

        <div className="profile-content-side-column">
        <ProfileRatingChart interactions={interactions} textStyle={textStyle} navigate={navigate} />

        {favoritePlaces.length > 0 && (
          <section className="profile-favorites-section">
            <h2 className="text-base font-semibold mb-3" style={textStyle}>Favoritos recientes</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
              {favoritePlaces.slice(0, 8).map((cafe) => (
                <div key={cafe.id} className="profile-favorite-card">
                  <button type="button" onClick={() => navigate(`/cafe/${cafe.id}`)} className="profile-favorite-open">
                    {cafe.imageUrl ? <img src={cafe.imageUrl} alt={cafe.nombre} /> : <div className="profile-favorite-placeholder"><Coffee className="opacity-40" size={24} /></div>}
                    <div><p>{cafe.nombre}</p></div>
                  </button>
                  <button type="button" className="profile-favorite-remove" onClick={(event) => removeFavorite(event, cafe)} aria-label={`Quitar ${cafe.nombre} de favoritos`} title="Quitar de favoritos"><X size={13} /></button>
                </div>
              ))}
            </div>
          </section>
        )}
        </div>
        </div>}

        {activeTab === 'activity' && <ProfileActivityPanel userId={user.id} />}

        {activeTab === 'visited' && (
          <section className="profile-tab-panel">
            <div className="profile-tab-heading"><div><small>TUS LUGARES</small><h2>Visitadas</h2></div><span>{visitedPlaces.length}</span></div>
            <div className="profile-visited-grid">
              {visitedPlaces.map(({ cafe, rating: visitRating, id: visitId }) => (
                <button type="button" key={visitId} onClick={() => navigate(`/cafe/${cafe.id}`)}>
                  {cafe.imageUrl ? <img src={cafe.imageUrl} alt={cafe.nombre} /> : <div className="profile-cafe-placeholder"><Coffee size={26} /></div>}
                  <strong>{cafe.nombre}</strong>
                  <span><CoffeeBeanIcon size={14} filled tone="dark" /> {formatRating(visitRating || cafe.rating || 0)} <b><MapPin size={10} /> {getCafeNeighborhood(cafe)}</b></span>
                </button>
              ))}
            </div>
            {visitedPlaces.length === 0 && <div className="profile-tab-empty"><Coffee size={30} /><p>Aún no has marcado cafeterías como visitadas.</p></div>}
          </section>
        )}

        {activeTab === 'friends' && <FriendsPanel userId={user.id} />}
      </section>

      {historyCafe && <ProfileCafeVisitHistory
        cafe={historyCafe}
        visits={interactions
          .filter((interaction) => interaction.cafe_id === historyCafe.id && interaction.is_visited)
          .sort((first, second) => String(second.visited_on || second.updated_at || '').localeCompare(String(first.visited_on || first.updated_at || '')))}
        onClose={() => setHistoryCafe(null)}
        onSaveReview={saveVisitReview}
        onDeleteReview={deleteVisitReview}
        onDeleteVisit={deleteVisit}
      />}

      {showAvatarViewer && (
        <div className="profile-avatar-viewer" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAvatarViewer(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Foto de perfil">
            <button type="button" onClick={() => setShowAvatarViewer(false)} aria-label="Cerrar"><X size={20} /></button>
            <img
              src={avatarViewerUrl}
              alt={profile.username}
              width="900"
              height="900"
              decoding="async"
              onError={(event) => {
                if (event.currentTarget.src !== profile.avatarUrl) event.currentTarget.src = profile.avatarUrl;
              }}
            />
            <label><Camera size={16} /> Cambiar foto<input type="file" accept="image/*" onChange={(event) => startImageCrop(event, 'avatar')} disabled={Boolean(uploadingField)} hidden /></label>
          </section>
        </div>
      )}

      {cropRequest && <ProfileImageCropper file={cropRequest.file} kind={cropRequest.kind} onCancel={() => setCropRequest(null)} onConfirm={confirmCrop} />}

      <div className="profile-bottom-actions">
        <button
          onClick={() => navigate('/new-post')}
          className="profile-bottom-action"
          aria-label="Agregar una reseña"
        >
          <Plus size={13} />
          Agregar
        </button>
        <label className="profile-bottom-action profile-color-action">
          <input
            type="color"
            value={draftTextColor}
            onInput={(event) => previewAndSaveTextColor(event.currentTarget.value)}
            aria-label="Editar el color de la letra"
          />
          {savingColor && <Loader2 className="profile-color-saving animate-spin" size={11} />}
          Editar
        </label>
        <button
          onClick={shareProfile}
          className="profile-bottom-action"
        >
          <Share2 size={13} />
          Compartir
        </button>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </main>
  );
}

function ProfileActivityPanel({ userId }) {
  return (
    <section className="profile-tab-panel profile-activity-panel">
      <ActivityFeed userIdFilter={userId} compact />
    </section>
  );
}

function FriendsPanel({ userId }) {
  const navigate = useNavigate();
  const [friendships, setFriendships] = useState([]);
  const [profiles, setProfiles] = useState(new Map());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const loadFriendships = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('friendships').select('id,requester_id,addressee_id,status,created_at').order('created_at', { ascending: false });
    if (error) {
      setNotice('No se pudieron cargar tus amigos.');
      setLoading(false);
      return;
    }
    const rows = data || [];
    const ids = [...new Set(rows.flatMap((row) => [row.requester_id, row.addressee_id]).filter((id) => id !== userId))];
    const { data: people } = ids.length ? await supabase.from('profiles').select('id,username,avatar_url').in('id', ids) : { data: [] };
    setFriendships(rows);
    setProfiles(new Map((people || []).map((person) => [person.id, person])));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(loadFriendships, 0);
    return () => window.clearTimeout(timer);
  }, [loadFriendships]);

  const searchUsers = async (event) => {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) return;
    setNotice('');
    const { data, error } = await supabase.from('profiles').select('id,username,avatar_url').ilike('username', `%${term}%`).neq('id', userId).limit(20);
    if (error) setNotice('No se pudo buscar usuarios.');
    else setResults(data || []);
  };

  const sendRequest = async (personId) => {
    setNotice('');
    const { error } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: personId, status: 'pending' });
    if (error) setNotice(error.code === '23505' ? 'Ya existe una solicitud entre ustedes.' : 'No se pudo enviar la solicitud.');
    else {
      setNotice('Solicitud enviada.');
      await loadFriendships();
    }
  };

  const acceptRequest = async (friendshipId) => {
    const { error } = await supabase.from('friendships').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendshipId);
    setNotice(error ? 'No se pudo aceptar la solicitud.' : 'Ahora son amigos.');
    if (!error) await loadFriendships();
  };

  const removeFriendship = async (friendshipId) => {
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    setNotice(error ? 'No se pudo quitar.' : 'Actualizado.');
    if (!error) await loadFriendships();
  };

  const incoming = friendships.filter((row) => row.status === 'pending' && row.addressee_id === userId);
  const accepted = friendships.filter((row) => row.status === 'accepted');
  const relationshipFor = (personId) => friendships.find((row) => row.requester_id === personId || row.addressee_id === personId);
  const getOtherId = (row) => row.requester_id === userId ? row.addressee_id : row.requester_id;

  return (
    <section className="profile-tab-panel friends-panel">
      <div className="profile-tab-heading"><div><small>COMUNIDAD</small><h2>Amigos</h2></div><span>{accepted.length}</span></div>
      <form className="friends-search" onSubmit={searchUsers}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre de usuario" /><button type="submit">Buscar</button></form>
      {notice && <p className="friends-notice">{notice}</p>}

      {incoming.length > 0 && <div className="friends-section"><h3>Solicitudes</h3>{incoming.map((row) => { const person = profiles.get(row.requester_id); return <article key={row.id} className="friends-person-row" onClick={(event) => { if (!event.target.closest('button') && person?.id) navigate(`/profile/${person.id}`); }}><FriendAvatar person={person} /><div><strong>{person?.username || 'Usuario'}</strong><small>Quiere agregarte</small></div><button onClick={() => acceptRequest(row.id)}>Aceptar</button><button className="is-secondary" onClick={() => removeFriendship(row.id)}>Quitar</button></article>; })}</div>}

      {results.length > 0 && <div className="friends-section"><h3>Resultados</h3>{results.map((person) => { const relationship = relationshipFor(person.id); const received = relationship?.status === 'pending' && relationship.addressee_id === userId; return <article key={person.id} className="friends-person-row" onClick={(event) => { if (!event.target.closest('button')) navigate(`/profile/${person.id}`); }}><FriendAvatar person={person} /><div><strong>{person.username || 'Usuario'}</strong><small>{relationship?.status === 'accepted' ? 'Ya son amigos' : relationship ? 'Solicitud pendiente' : 'Coffee lover'}</small></div>{received ? <button onClick={() => acceptRequest(relationship.id)}>Aceptar</button> : <button disabled={Boolean(relationship)} onClick={() => sendRequest(person.id)}><UserPlus size={14} /> {relationship ? 'Enviada' : 'Agregar'}</button>}</article>; })}</div>}

      <div className="friends-section"><h3>Mis amigos</h3>{loading && <p className="friends-empty">Cargando…</p>}{!loading && accepted.length === 0 && <div className="friends-empty"><Users size={25} /><p>Busca usuarios para empezar tu círculo cafetero.</p></div>}{accepted.map((row) => { const person = profiles.get(getOtherId(row)); return <article key={row.id} className="friends-person-row" onClick={(event) => { if (!event.target.closest('button') && person?.id) navigate(`/profile/${person.id}`); }}><FriendAvatar person={person} /><div><strong>{person?.username || 'Usuario'}</strong><small>Amigo · Ver perfil</small></div><button className="is-secondary" onClick={() => removeFriendship(row.id)}>Quitar</button></article>; })}</div>
    </section>
  );
}

function FriendAvatar({ person }) {
  const src = person?.avatar_url || `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(person?.username || 'coffee-friend')}`;
  return <img src={src} alt="" />;
}

export default ProfilePage;
