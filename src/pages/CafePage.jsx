import { useEffect, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Coffee, Heart, CheckCircle2, Clock, Edit3, Instagram, Music2, Plus, Utensils, MessageCircle, Send, ExternalLink } from 'lucide-react';
import PageLoading from '../components/PageLoading';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { supabase } from '../supabase';
import { getCafeOpenStatus, getCafeScheduleRows } from '../utils/cafeHours';
import { geocodeCafeLocation, getCafeCoordinates } from '../utils/cafeLocation';
import { CoffeeBeanRating } from '../components/CoffeeBeanIcon';

const MAP_TARGET_STORAGE_KEY = 'coffee-map:focus-cafe';
const getLocalDate = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
};

function CafePage({ cafeId }) {
  const { id: routeCafeId } = useParams();
  const id = cafeId ?? routeCafeId;
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const {
    cafeById,
    cafesLoaded,
    cafesLoading,
    loadCafes,
    interactions,
    interactionsByCafeId,
    interactionsLoading,
    saveCafeInteraction,
  } = useCoffeeData();

  const cafe = cafeById.get(id) || null;
  const interaction = interactionsByCafeId.get(id);
  const personalReviews = interactions
    .filter((item) => item.cafe_id === id && item.review_text?.trim())
    .sort((first, second) => String(second.visited_on || second.updated_at || '').localeCompare(String(first.visited_on || first.updated_at || '')));

  const [isVisited, setIsVisited] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [inWaitlist, setInWaitlist] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [savingInteraction, setSavingInteraction] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [communityPhotos, setCommunityPhotos] = useState([]);
  const [communityTiktoks, setCommunityTiktoks] = useState([]);
  const [communityReviews, setCommunityReviews] = useState([]);

  useEffect(() => {
    if (!cafesLoaded) {
      loadCafes().catch(() => {});
    }
  }, [cafesLoaded, loadCafes]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase
        .from('cafe_photos')
        .select('id,public_url,is_cover,created_at')
        .eq('cafe_id', id)
        .eq('status', 'approved')
        .not('post_id', 'is', null)
        .order('is_cover', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('cafe_tiktoks')
        .select('id,url,thumbnail_url,title,position,created_at')
        .eq('cafe_id', id)
        .order('position')
        .order('created_at'),
    ]).then(([photosResult, tiktoksResult]) => {
      setCommunityPhotos(photosResult.data || []);
      setCommunityTiktoks(tiktoksResult.data || []);
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const loadCommunityReviews = async () => {
      const { data: posts, error } = await supabase
        .from('posts')
        .select('id,user_id,cafe_id,content,image_url,kind,rating,visited_on,created_at,updated_at')
        .eq('cafe_id', id)
        .eq('kind', 'review')
        .eq('status', 'published')
        .order('updated_at', { ascending: false })
        .limit(8);
      if (error || !posts?.length) {
        if (!cancelled) setCommunityReviews([]);
        return;
      }
      const postIds = posts.map((post) => post.id);
      const userIds = [...new Set(posts.map((post) => post.user_id))];
      const [{ data: profiles }, { data: images }] = await Promise.all([
        supabase.from('profiles').select('id,username,avatar_url').in('id', userIds),
        supabase.from('post_images').select('id,post_id,public_url,position').in('post_id', postIds).order('position'),
      ]);
      const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const imagesByPost = new Map();
      (images || []).forEach((image) => imagesByPost.set(image.post_id, [...(imagesByPost.get(image.post_id) || []), image]));
      if (!cancelled) setCommunityReviews(posts.map((post) => ({
        ...post,
        profile: profileById.get(post.user_id),
        images: imagesByPost.get(post.id) || (post.image_url ? [{ id: `${post.id}:legacy`, public_url: post.image_url }] : []),
      })));
    };
    loadCommunityReviews().catch(() => { if (!cancelled) setCommunityReviews([]); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    setIsVisited(interaction?.is_visited || false);
    setIsFavorite(interaction?.is_favorite || false);
    setInWaitlist(interaction?.in_waitlist || false);
    setRating(Number(interaction?.rating) || 0);
    setReviewText(interaction?.review_text || '');
  }, [interaction, id]);

  const requireAuth = () => {
    if (user) return true;
    const requestedPath = `${location.pathname}${location.search}${location.hash}`;
    navigate(`/login?redirectTo=${encodeURIComponent(requestedPath)}`);
    return false;
  };

  const saveInteraction = async (updates, options = {}) => {
    if (!requireAuth() || !cafe) return;

    const hasUpdate = (key) => Object.prototype.hasOwnProperty.call(updates, key);
    setSavingInteraction(true);
    setSaveError('');
    try {
      const savedInteraction = await saveCafeInteraction(cafe.id, {
        is_visited: hasUpdate('is_visited') ? updates.is_visited : isVisited,
        is_favorite: hasUpdate('is_favorite') ? updates.is_favorite : isFavorite,
        in_waitlist: hasUpdate('in_waitlist') ? updates.in_waitlist : inWaitlist,
        rating: hasUpdate('rating') ? updates.rating : (rating === 0 ? null : rating),
        review_text: hasUpdate('review_text') ? updates.review_text : reviewText,
        ...(hasUpdate('visited_on') ? { visited_on: updates.visited_on } : {}),
      }, options);
      return savedInteraction;
    } catch (error) {
      console.error('Error al guardar interaccion', error);
      setSaveError('No pudimos guardar tu reseña. Intenta otra vez.');
      return false;
    } finally {
      setSavingInteraction(false);
    }
  };

  const toggleVisited = () => {
    if (!requireAuth()) return;
    const nextValue = !isVisited;
    setIsVisited(nextValue);
    saveInteraction({ is_visited: nextValue, ...(nextValue ? { visited_on: getLocalDate() } : {}) });
  };

  const toggleFavorite = () => {
    if (!requireAuth()) return;
    const nextValue = !isFavorite;
    setIsFavorite(nextValue);
    saveInteraction({ is_favorite: nextValue });
  };

  const toggleWaitlist = () => {
    if (!requireAuth()) return;
    const nextValue = !inWaitlist;
    setInWaitlist(nextValue);
    saveInteraction({ in_waitlist: nextValue });
  };

  const registerAnotherVisit = async () => {
    if (!requireAuth() || !cafe || savingInteraction) return;
    if (!window.confirm(`¿Registrar una nueva visita a ${cafe.nombre}? Puedes agregar una reseña después si quieres.`)) return;
    const saved = await saveInteraction({
      is_visited: true,
      is_favorite: isFavorite,
      in_waitlist: inWaitlist,
      rating: null,
      review_text: '',
      visited_on: getLocalDate(),
    }, { createNewVisit: true });
    if (saved) {
      setIsVisited(true);
      setRating(0);
      setReviewText('');
    }
  };

  const openReviewComposer = () => {
    if (!requireAuth() || !cafe) return;
    navigate(`/new-post?cafe=${encodeURIComponent(cafe.id)}`);
  };

  const showInAppMap = async () => {
    if (!cafe) return;
    const verifiedCoordinates = getCafeCoordinates(cafe);
    const coordinates = ['community', 'manual'].includes(cafe.source)
      ? verifiedCoordinates
      : (await geocodeCafeLocation(cafe)) || verifiedCoordinates;
    if (!coordinates) return;

    window.sessionStorage.setItem(MAP_TARGET_STORAGE_KEY, JSON.stringify({
      id: cafe.id,
      nombre: cafe.nombre,
      ...coordinates,
    }));

    navigate('/map');
  };

  const openStatus = getCafeOpenStatus(cafe?.openingHours);
  const scheduleRows = getCafeScheduleRows(cafe?.openingHours);

  if ((cafesLoading && !cafesLoaded) || (interactionsLoading && !interaction)) {
    return <PageLoading message="Cargando cafeteria..." />;
  }

  if (!cafe) {
    return (
      <main className="h-screen w-full bg-[#1D1A15] flex flex-col items-center justify-center p-4">
        <p className="text-xl text-[#E6DAC1]/60 mb-4">Cafeteria no encontrada</p>
        <button onClick={() => navigate('/map')} className="bg-[#372821] text-[#E6DAC1] px-6 py-3 rounded-full font-bold hover:bg-[#493A33] transition-colors">
          Volver al mapa
        </button>
      </main>
    );
  }

  return (
    <main className="cafe-page">
      <button onClick={() => navigate(-1)} className="cafe-back-button" aria-label="Volver"><ArrowLeft size={22} /></button>
      <section className="cafe-hero">
        {cafe.imageUrl && <img className="cafe-hero-backdrop" src={cafe.imageUrl} alt="" aria-hidden="true" />}
        <div className="cafe-hero-shade" />
        <div className="cafe-hero-inner">
          <div className="cafe-cover-frame">
            {cafe.imageUrl ? <img src={cafe.imageUrl} alt={cafe.nombre} className="cafe-cover-image" fetchPriority="high" decoding="async" /> : <Coffee size={76} />}
            {cafe.imageSourceUrl && <a href={cafe.imageSourceUrl} target="_blank" rel="noreferrer" className="cafe-image-credit">Foto: {cafe.imageAttribution || 'Wikimedia Commons'}{cafe.imageLicense ? ` · ${cafe.imageLicense}` : ''}</a>}
          </div>
          <div className="cafe-profile-column">
            <div className="cafe-profile-heading">
              <div>
                <span className="cafe-eyebrow">COFFEE MAP · {cafe.category === 'panaderia' ? 'PANADERÍA' : 'CAFETERÍA'}</span>
                <h1>{cafe.nombre}</h1>
                <div className="cafe-profile-meta"><span><MapPin size={15} fill="currentColor" /> {cafe.neighborhood || 'Mérida'}</span>{cafe.instagramUrl && <a href={cafe.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={18} /></a>}</div>
              </div>
              <div className="cafe-public-rating"><CoffeeBeanRating value={Number(cafe.rating || 0)} size={21} /><strong>{Number(cafe.rating || 0) ? Number(cafe.rating).toFixed(1) : '—'}</strong><small>{cafe.reviews || 0} reseñas</small></div>
            </div>
            <div className="cafe-control-card">
              <div className="cafe-control-grid">
                <button type="button" onClick={toggleVisited} disabled={savingInteraction} className={isVisited ? 'is-selected' : ''}><CheckCircle2 /><span>Visitada</span></button>
                <button type="button" onClick={toggleFavorite} disabled={savingInteraction} className={isFavorite ? 'is-selected' : ''}><Heart className={isFavorite ? 'is-filled' : ''} /><span>Favorita</span></button>
                <button type="button" onClick={toggleWaitlist} disabled={savingInteraction} className={inWaitlist ? 'is-selected' : ''}><Clock /><span>Ir luego</span></button>
              </div>
              <div className="cafe-quick-links">
                <div className="cafe-personal-rating"><span>Calificación</span><strong>{rating > 0 ? <><CoffeeBeanRating value={rating} size={17} /> {rating}</> : <button type="button" onClick={openReviewComposer}>Calificar</button>}</strong></div>
                {cafe.menuUrl ? <a href={cafe.menuUrl} target="_blank" rel="noreferrer" className="cafe-menu-link"><Utensils size={18} /><span>Menú</span><ExternalLink size={13} /></a> : <div className="cafe-menu-link is-empty"><Utensils size={18} /><span>Menú próximamente</span></div>}
                <button type="button" className="cafe-add-visit-button" onClick={registerAnotherVisit} disabled={savingInteraction}><Plus size={18} /><span>Agregar nueva visita</span></button>
              </div>
              <section className="cafe-my-reviews">
                <div className="cafe-section-label"><h2>Mis reseñas</h2><button type="button" onClick={openReviewComposer} aria-label="Editar reseña"><Edit3 size={15} /></button></div>
                {personalReviews.length ? personalReviews.slice(0, 2).map((review) => <article className="cafe-personal-review" key={review.id}><div className="cafe-personal-review-meta"><CoffeeBeanRating value={Number(review.rating || 0)} size={14} /><span>{review.visited_on ? new Date(`${review.visited_on}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Visita reciente'}</span></div><p>“{review.review_text}”</p></article>) : <button type="button" className="cafe-write-review" onClick={openReviewComposer}>Escribir mi primera reseña…</button>}
                {saveError && <p className="cafe-save-error" role="alert">{saveError}</p>}
              </section>
            </div>
          </div>
        </div>
      </section>

      <div className="cafe-content-grid">
        <aside className="cafe-sidebar">
          <div className="cafe-visited-summary"><span className="cafe-avatar-pair"><i /><i /></span><span>Lo han visitado</span><strong>{cafe.reviews || 0}</strong></div>
          <section className="cafe-hours-card">
            <header><div><span className="cafe-section-kicker">HORARIOS</span><h2>{openStatus.label}</h2></div><i className={`cafe-hours-status is-${openStatus.state}`} /></header>
            {scheduleRows.length > 0 ? <div className="cafe-hours-list">{scheduleRows.map((row) => <p key={row.day}><span>{row.day}</span><strong>{row.hours}</strong></p>)}</div> : <p className="cafe-hours-pending">Aún no tenemos un horario verificado para esta cafetería.</p>}
            {cafe.openingHoursSource === 'osm' && <small className="cafe-hours-source">Horario de OpenStreetMap; puede cambiar.</small>}
            {cafe.openingHoursSource === 'web' && <small className="cafe-hours-source">Horario verificado en una fuente pública{cafe.openingHoursSourceUrl ? <> · <a href={cafe.openingHoursSourceUrl} target="_blank" rel="noreferrer">ver fuente</a></> : null}.</small>}
            {cafe.openingHoursSource === 'admin' && <small className="cafe-hours-source">Horario verificado por Coffee Map.</small>}
          </section>
          <div className="cafe-map-card"><iframe title={`Mapa de ${cafe.nombre}`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(cafe.lng) - 0.012}%2C${Number(cafe.lat) - 0.008}%2C${Number(cafe.lng) + 0.012}%2C${Number(cafe.lat) + 0.008}&layer=mapnik&marker=${cafe.lat}%2C${cafe.lng}`} loading="lazy" /><button type="button" onClick={showInAppMap}><MapPin size={17} /> {cafe.address || cafe.neighborhood || 'Ver ubicación'}</button></div>
        </aside>

        <div className="cafe-main-column">
          <section className="cafe-reviews-section">
            <header><div><span className="cafe-section-kicker">LA COMUNIDAD OPINA</span><h2>Reviews</h2></div><button type="button" onClick={openReviewComposer}><Plus size={16} /> Escribir</button></header>
            {communityReviews.length ? <div className="cafe-community-reviews">{communityReviews.map((review) => <article className="cafe-community-review" key={review.id}>
              <div className="cafe-review-top"><div className="cafe-review-user"><img src={review.profile?.avatar_url || '/logo.png'} alt="" /><strong>{review.profile?.username || 'Coffee Map member'}</strong></div><div className="cafe-review-rating"><CoffeeBeanRating value={Number(review.rating || 0)} size={17} /><b>{Number(review.rating || 0) || '—'}</b></div></div>
              <div className="cafe-review-content">{review.images?.[0] && <img className="cafe-review-photo" src={review.images[0].public_url} alt={`Foto de ${cafe.nombre}`} loading="lazy" decoding="async" />}<p>{review.content}</p></div>
              <footer><button type="button" onClick={() => navigate('/activity')} aria-label="Ver reseña"><Heart size={17} /></button><button type="button" onClick={() => navigate('/activity')} aria-label="Abrir comentarios"><MessageCircle size={17} /></button><button type="button" onClick={() => navigator.share ? navigator.share({ title: `Reseña de ${cafe.nombre}`, url: window.location.href }).catch(() => {}) : navigator.clipboard?.writeText(window.location.href)} aria-label="Compartir"><Send size={16} /></button></footer>
            </article>)}</div> : <div className="cafe-reviews-empty"><Coffee size={25} /><p>Aún no hay reseñas públicas para esta cafetería.</p><button type="button" onClick={openReviewComposer}>Sé la primera persona en contar tu visita</button></div>}
          </section>

          <section className="cafe-gallery-section">
            <header><div><span className="cafe-section-kicker">UN VISTAZO AL LUGAR</span><h2>Galería</h2></div>{communityPhotos.length > 0 && <span>{communityPhotos.length} fotos</span>}</header>
            <div className="cafe-gallery-grid">{[...(cafe.imageUrl ? [{ id: 'cover', public_url: cafe.imageUrl }] : []), ...communityPhotos].slice(0, 9).map((photo) => <img key={photo.id} src={photo.public_url} alt={cafe.nombre} loading="lazy" decoding="async" />)}</div>
            {!cafe.imageUrl && !communityPhotos.length && <p className="cafe-gallery-empty">Las fotos de esta cafetería aparecerán aquí.</p>}
          </section>
        </div>
      </div>

      <section className="cafe-tiktok-section">
        <header><div><span className="cafe-section-kicker">DESCÚBRELO EN VIDEO</span><h2><Music2 size={22} /> TikTok</h2></div><span>{communityTiktoks.length} videos</span></header>
        {communityTiktoks.length ? <div className="cafe-tiktok-grid">{communityTiktoks.map((tiktok) => <a key={tiktok.id} href={tiktok.url} target="_blank" rel="noreferrer" className="cafe-tiktok-card">
          <div className="cafe-tiktok-cover">{tiktok.thumbnail_url ? <img src={tiktok.thumbnail_url} alt={tiktok.title || `Video de ${cafe.nombre}`} loading="lazy" decoding="async" /> : <div className="cafe-tiktok-placeholder"><Music2 size={32} /><span>Vista previa de TikTok</span></div>}<span className="cafe-tiktok-play"><Music2 size={14} /> Ver en TikTok <ExternalLink size={12} /></span></div>
          <strong>{tiktok.title || 'Video de la comunidad'}</strong><small><i /> Ale · TikTok</small>
        </a>)}</div> : <div className="cafe-tiktok-empty"><Music2 size={24} /><p>Aquí aparecerán los TikToks de esta cafetería.</p></div>}
      </section>
    </main>
  );
}

export default CafePage;
