import { useEffect, useMemo, useState } from 'react';
import { Check, Coffee, Croissant, Heart, Info, MapPin, Plus, Search, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import PageLoading from '../components/PageLoading';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { getCafeFullAddress, getCafeNeighborhood } from '../utils/cafeAddress';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=85';
const MAP_TARGET_STORAGE_KEY = 'coffee-map:focus-cafe';

const getCafeImage = (cafe) => cafe?.imageUrl || FALLBACK_IMAGE;
const BAKERY_PATTERN = /panader|bakery|pasteler|reposter|bake|bread|croissant|boulanger/i;
const getCafeCategory = (cafe) => (
  cafe?.category === 'panaderia' || BAKERY_PATTERN.test(cafe?.nombre || '')
    ? 'panaderia'
    : 'cafeteria'
);
const getCafeCategoryLabel = (cafe) => getCafeCategory(cafe) === 'panaderia' ? 'Panadería' : 'Cafetería';
const getCafeAddress = getCafeFullAddress;
const getCompactAddress = getCafeNeighborhood;

const hashText = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const getDistanceInKm = (origin, destination) => {
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const latitudeDelta = toRadians(destination.lat - origin.lat);
  const longitudeDelta = toRadians(destination.lng - origin.lng);
  const originLatitude = toRadians(origin.lat);
  const destinationLatitude = toRadians(destination.lat);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getPersonalizedCafe = ({ cafes, interactions, cafeById, userId }) => {
  const visitedIds = new Set(
    interactions.filter((item) => item.is_visited).map((item) => item.cafe_id),
  );
  const favoriteIds = new Set(
    interactions.filter((item) => item.is_favorite).map((item) => item.cafe_id),
  );
  const unvisitedCafes = cafes.filter((cafe) => !visitedIds.has(cafe.id));
  if (unvisitedCafes.length === 0) return cafes[0] || null;

  const preferenceAnchors = interactions
    .filter((item) => item.is_favorite || Number(item.rating || 0) >= 4)
    .map((item) => ({ cafe: cafeById.get(item.cafe_id), interaction: item }))
    .filter((item) => item.cafe);
  const newToUser = unvisitedCafes.filter((cafe) => !favoriteIds.has(cafe.id));
  const candidates = newToUser.length > 0 ? newToUser : unvisitedCafes;
  const categoryPreferences = preferenceAnchors.reduce((preferences, anchor) => {
    const reviewSuggestsBakery = BAKERY_PATTERN.test(anchor.interaction.review_text || '');
    const category = reviewSuggestsBakery ? 'panaderia' : getCafeCategory(anchor.cafe);
    const weight = anchor.interaction.is_favorite ? 2 : Math.max(Number(anchor.interaction.rating || 0) - 2, 1);
    preferences[category] += weight;
    return preferences;
  }, { cafeteria: 0, panaderia: 0 });
  const preferredCategory = categoryPreferences.panaderia > categoryPreferences.cafeteria
    ? 'panaderia'
    : 'cafeteria';

  const rankedCandidates = candidates.map((cafe) => {
    const publicRating = Number(cafe.rating || 0);
    const reviewConfidence = Math.min(Math.log10(Number(cafe.reviews || 0) + 1), 3);
    const affinity = preferenceAnchors.reduce((bestMatch, anchor) => {
      const distance = getDistanceInKm(anchor.cafe, cafe);
      const preferenceWeight = anchor.interaction.is_favorite
        ? 1.35
        : Math.max(Number(anchor.interaction.rating || 0) / 5, 0.8);
      return Math.max(bestMatch, preferenceWeight / (1 + distance / 3.5));
    }, 0);

    return {
      cafe,
      score: affinity * 3.2
        + publicRating * 0.45
        + reviewConfidence * 0.18
        + (cafe.imageUrl ? 0.35 : 0)
        + (cafe.address ? 0.45 : 0)
        + (preferenceAnchors.length && getCafeCategory(cafe) === preferredCategory ? 0.85 : 0),
    };
  }).sort((a, b) => b.score - a.score || a.cafe.nombre.localeCompare(b.cafe.nombre));

  const shortlist = rankedCandidates.slice(0, Math.min(5, rankedCandidates.length));
  const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const preferenceKey = preferenceAnchors.map(({ cafe }) => cafe.id).sort().join(':');
  const selectedIndex = hashText(`${userId || 'coffee-map'}:${week}:${preferenceKey}`) % shortlist.length;
  return shortlist[selectedIndex]?.cafe || rankedCandidates[0]?.cafe || null;
};

function CafeCard({ cafe, interaction, onOpen }) {
  const rating = Number(interaction?.rating || cafe?.rating || 4.5);

  return (
    <button type="button" className="home-cafe-card" onClick={() => onOpen(cafe.id)}>
      <div className="home-cafe-image-wrap">
        <img src={getCafeImage(cafe)} alt={cafe.nombre} className="home-cafe-image" />
      </div>
      <div className="home-cafe-copy">
        <strong>{cafe.nombre}</strong>
        <div className="home-cafe-details">
          <span><Star size={10} fill="currentColor" /> {rating.toFixed(1)}</span>
          <span title={getCafeAddress(cafe)}><MapPin size={10} /> {getCompactAddress(cafe)}</span>
        </div>
      </div>
    </button>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    cafes,
    cafeById,
    cafesLoaded,
    cafesLoading,
    loadCafes,
    interactions,
    interactionsByCafeId,
    saveCafeInteraction,
  } = useCoffeeData();
  const [savingAction, setSavingAction] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!cafesLoaded) loadCafes().catch(() => {});
  }, [cafesLoaded, loadCafes]);

  const sortedCafes = useMemo(() => [...cafes].sort((a, b) => {
    const ratingDifference = Number(b.rating || 0) - Number(a.rating || 0);
    return ratingDifference || (Number(b.reviews || 0) - Number(a.reviews || 0));
  }), [cafes]);

  const featuredCafe = useMemo(() => getPersonalizedCafe({
    cafes: sortedCafes,
    interactions,
    cafeById,
    userId: user?.id,
  }), [cafeById, interactions, sortedCafes, user?.id]);
  const featuredInteraction = featuredCafe ? interactionsByCafeId.get(featuredCafe.id) : null;
  const popularCafes = sortedCafes.slice(0, 6);
  const savedCafes = cafes.filter((cafe) => {
    const interaction = interactionsByCafeId.get(cafe.id);
    return interaction?.is_favorite || interaction?.in_waitlist;
  }).slice(0, 6);
  const displaySavedCafes = savedCafes.length ? savedCafes : sortedCafes.slice(0, 3);

  const updateFeaturedInteraction = async (field, value) => {
    if (!featuredCafe || savingAction) return;
    setSavingAction(field);
    setActionError('');
    try {
      await saveCafeInteraction(featuredCafe.id, { [field]: value });
    } catch {
      setActionError('No se pudo guardar. Revisa tu conexión e intenta otra vez.');
    } finally {
      setSavingAction('');
    }
  };

  const showFeaturedOnMap = () => {
    if (!featuredCafe) return;
    window.sessionStorage.setItem(MAP_TARGET_STORAGE_KEY, JSON.stringify({
      id: featuredCafe.id,
      nombre: featuredCafe.nombre,
      lat: featuredCafe.lat,
      lng: featuredCafe.lng,
    }));
    navigate('/map');
  };

  if (cafesLoading && !cafesLoaded) {
    return <PageLoading message="Preparando tu mapa de café..." />;
  }

  return (
    <main
      className="home-page"
      style={{ '--home-bg-image': `url("${getCafeImage(featuredCafe)}")` }}
    >
      <div className="home-scroll-content">
        <div className="home-background-layer" aria-hidden="true" />
        <header className="home-header">
          <div className="home-brand">
            <img src="/coffee map letters.png" alt="Coffee Map" className="home-logo" />
            <img src="/logo.png" alt="" className="home-mascot" />
          </div>
          <div className="home-header-actions">
            <button type="button" aria-label="Buscar" onClick={() => navigate('/search')}><Search size={20} /></button>
            <button type="button" aria-label="Mis favoritos" onClick={() => navigate('/favorites')}><Heart size={19} /></button>
          </div>
        </header>

        {featuredCafe ? (
          <section className="home-featured-section">
            <article className="home-featured-card">
              <button type="button" className="home-featured-open" onClick={() => navigate(`/cafe/${featuredCafe.id}`)} aria-label={`Abrir información de ${featuredCafe.nombre}`}>
                <img src={getCafeImage(featuredCafe)} alt={featuredCafe.nombre} />
                <span className="home-featured-shade" />
              </button>
              <button
                type="button"
                className={`home-featured-like ${featuredInteraction?.is_favorite ? 'is-favorite' : ''}`}
                aria-label={featuredInteraction?.is_favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                aria-pressed={Boolean(featuredInteraction?.is_favorite)}
                disabled={Boolean(savingAction)}
                onClick={() => updateFeaturedInteraction('is_favorite', !featuredInteraction?.is_favorite)}
              >
                <Heart size={18} fill={featuredInteraction?.is_favorite ? 'currentColor' : 'none'} />
              </button>
              <div className="home-featured-content">
                <div className="home-featured-meta">
                  <span>
                    {getCafeCategory(featuredCafe) === 'panaderia' ? <Croissant size={17} /> : <Coffee size={17} />}
                    {getCafeCategoryLabel(featuredCafe)}
                  </span>
                  <span title={getCafeAddress(featuredCafe)}><MapPin size={17} /> {getCompactAddress(featuredCafe)}</span>
                </div>
                <div className="home-featured-actions">
                  <button
                    type="button"
                    className={`home-featured-plus ${featuredInteraction?.in_waitlist ? 'is-saved' : ''}`}
                    aria-label={featuredInteraction?.in_waitlist ? 'Quitar de la lista para visitar' : 'Guardar para visitar después'}
                    aria-pressed={Boolean(featuredInteraction?.in_waitlist)}
                    disabled={Boolean(savingAction)}
                    onClick={() => updateFeaturedInteraction('in_waitlist', !featuredInteraction?.in_waitlist)}
                  >
                    {featuredInteraction?.in_waitlist ? <Check size={27} strokeWidth={2.3} /> : <Plus size={29} strokeWidth={1.8} />}
                  </button>
                  <button type="button" onClick={showFeaturedOnMap}><MapPin size={19} strokeWidth={2.3} /> Ver en mapa</button>
                  <button type="button" onClick={() => navigate(`/cafe/${featuredCafe.id}`)}><Info size={19} /> Información</button>
                </div>
                {actionError && <p className="home-featured-error" role="alert">{actionError}</p>}
              </div>
            </article>
          </section>
        ) : (
          <section className="home-empty-state">
            <h1>Tu mapa empieza aquí</h1>
            <p>Aún no hay cafeterías para mostrar.</p>
            <button type="button" onClick={() => navigate('/map')}>Abrir mapa</button>
          </section>
        )}

        <CafeRow
          title="Las más visitadas"
          cafes={popularCafes}
          interactionsByCafeId={interactionsByCafeId}
          onOpen={(id) => navigate(`/cafe/${id}`)}
          onMore={() => navigate('/map')}
        />
        <CafeRow
          title="En tu lista"
          cafes={displaySavedCafes}
          interactionsByCafeId={interactionsByCafeId}
          onOpen={(id) => navigate(`/cafe/${id}`)}
          onMore={() => navigate('/list')}
        />

        <button type="button" className="home-map-prompt" onClick={() => navigate('/map')}>
          <span className="home-map-prompt-icon"><MapPin size={20} /></span>
          <span><strong>Explora cafeterías cerca de ti</strong><small>Encuentra tu próximo café en el mapa</small></span>
          <span className="home-map-prompt-arrow">›</span>
        </button>
      </div>

      <BottomNav />
    </main>
  );
}

function CafeRow({ title, cafes, interactionsByCafeId, onOpen, onMore }) {
  if (!cafes.length) return null;

  return (
    <section className="home-row-section">
      <div className="home-section-heading">
        <h2>{title}</h2>
        <button type="button" onClick={onMore}>Ver más <b>›</b></button>
      </div>
      <div className="home-cafe-row">
        {cafes.map((cafe) => (
          <CafeCard key={cafe.id} cafe={cafe} interaction={interactionsByCafeId.get(cafe.id)} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export default HomePage;
