import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Coffee, Croissant, Heart, Info, MapPin, Plus, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import PageLoading from '../components/PageLoading';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { getCafeCoordinates } from '../utils/cafeLocation';
import { getCafeFullAddress, getCafeNeighborhood } from '../utils/cafeAddress';
import ProfileCafeCard from '../components/ProfileCafeCard';
import { getCafeCategory, pickFeaturedCafe } from '../utils/featuredCafe';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=85';
const MAP_TARGET_STORAGE_KEY = 'coffee-map:focus-cafe';

const getCafeImage = (cafe) => cafe?.imageUrl || FALLBACK_IMAGE;
const getCafeCategoryLabel = (cafe) => getCafeCategory(cafe) === 'panaderia' ? 'Panadería' : 'Cafetería';
const getCafeAddress = getCafeFullAddress;
const getCompactAddress = getCafeNeighborhood;

function CafeCard({ cafe, interaction, onOpen }) {
  return <ProfileCafeCard cafe={{ ...cafe, rating: Number(interaction?.rating || cafe?.rating || 0) }} onClick={() => onOpen(cafe.id)} />;
}

function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const entryRef = useRef(null);
  const [featuredId, setFeaturedId] = useState(null);
  const { user } = useAuth();
  const {
    cafes,
    cafeById,
    cafesLoaded,
    cafesLoading,
    refreshCafes,
    interactions,
    interactionsByCafeId,
    saveCafeInteraction,
  } = useCoffeeData();
  const [savingAction, setSavingAction] = useState('');
  const [actionError, setActionError] = useState('');

  const chooseFeaturedForEntry = useCallback(async () => {
    if (location.pathname !== '/') { entryRef.current = null; return; }
    const key = `${user?.id || 'guest'}:${location.key}`;
    if (entryRef.current?.key === key && (entryRef.current.pending || cafes.some((cafe) => cafe.id === entryRef.current.id) || (cafesLoaded && cafes.length === 0))) return;
    const request = { key, pending: true };
    entryRef.current = request;
    let pool = cafes;
    try { const fresh = await refreshCafes(); if (Array.isArray(fresh)) pool = fresh; } catch { /* The trusted cached catalog remains available offline. */ }
    if (entryRef.current !== request) return;
    const storageKey = `coffee-map:featured:v1:${user?.id || 'guest'}`;
    let previous = { history: [], visit: 0 };
    try { const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); if (Array.isArray(stored?.history)) previous = stored; } catch { /* Session history is optional. */ }
    const selected = pickFeaturedCafe({ cafes: pool, interactions, userId: user?.id, history: previous.history, visit: Number(previous.visit) || 0 });
    request.pending = false; request.id = selected?.id;
    setFeaturedId(selected?.id || null);
    if (selected) try { sessionStorage.setItem(storageKey, JSON.stringify({ history: [...previous.history, selected.id].slice(-40), visit: (Number(previous.visit) || 0) + 1 })); } catch { /* Browsing still works without storage. */ }
  }, [cafes, cafesLoaded, interactions, location.key, location.pathname, refreshCafes, user?.id]);
  useEffect(() => { chooseFeaturedForEntry(); }, [chooseFeaturedForEntry]);

  const sortedCafes = useMemo(() => [...cafes].sort((a, b) => {
    const ratingDifference = Number(b.rating || 0) - Number(a.rating || 0);
    return ratingDifference || (Number(b.reviews || 0) - Number(a.reviews || 0));
  }), [cafes]);

  const featuredCafe = cafeById.get(featuredId) || null;
  const featuredInteraction = featuredCafe ? interactionsByCafeId.get(featuredCafe.id) : null;
  const popularCafes = sortedCafes.slice(0, 5);
  const savedCafes = cafes.filter((cafe) => {
    const interaction = interactionsByCafeId.get(cafe.id);
    return interaction?.is_favorite || interaction?.in_waitlist;
  }).slice(0, 5);
  const displaySavedCafes = savedCafes.length ? savedCafes : sortedCafes.slice(0, 5);

  const updateFeaturedInteraction = async (field, value) => {
    if (!featuredCafe || savingAction) return;
    if (!user) {
      navigate('/login?redirectTo=%2F');
      return;
    }
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
    const coordinates = getCafeCoordinates(featuredCafe);
    if (!coordinates) return;
    window.sessionStorage.setItem(MAP_TARGET_STORAGE_KEY, JSON.stringify({
      id: featuredCafe.id,
      nombre: featuredCafe.nombre,
      ...coordinates,
    }));
    navigate('/map');
  };

  if ((cafesLoading && !cafesLoaded) || (cafes.length > 0 && !featuredCafe)) {
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
                <img src={getCafeImage(featuredCafe)} alt={featuredCafe.nombre} fetchPriority="high" decoding="async" />
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
