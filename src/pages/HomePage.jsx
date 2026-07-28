import { useEffect, useMemo } from 'react';
import { Coffee, Croissant, Heart, Info, MapPin, Plus, Search, Star, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import PageLoading from '../components/PageLoading';
import { useCoffeeData } from '../context/CoffeeDataContext';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=85';

const getCafeImage = (cafe) => cafe?.imageUrl || FALLBACK_IMAGE;

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
          <span><MapPin size={10} /> Centro</span>
        </div>
      </div>
    </button>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const {
    cafes,
    cafesLoaded,
    cafesLoading,
    loadCafes,
    interactionsByCafeId,
  } = useCoffeeData();

  useEffect(() => {
    if (!cafesLoaded) loadCafes().catch(() => {});
  }, [cafesLoaded, loadCafes]);

  const sortedCafes = useMemo(() => [...cafes].sort((a, b) => {
    const ratingDifference = Number(b.rating || 0) - Number(a.rating || 0);
    return ratingDifference || (Number(b.reviews || 0) - Number(a.reviews || 0));
  }), [cafes]);

  const featuredCafe = sortedCafes.find((cafe) => cafe.imageUrl) || sortedCafes[0];
  const popularCafes = sortedCafes.slice(0, 6);
  const savedCafes = cafes.filter((cafe) => {
    const interaction = interactionsByCafeId.get(cafe.id);
    return interaction?.is_favorite || interaction?.in_waitlist;
  }).slice(0, 6);
  const displaySavedCafes = savedCafes.length ? savedCafes : sortedCafes.slice(0, 3);

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
            <button type="button" aria-label="Mi lista" onClick={() => navigate('/profile')}><Heart size={19} /></button>
            <button type="button" aria-label="Mi perfil" onClick={() => navigate('/profile')}><UserRound size={20} /></button>
          </div>
        </header>

        {featuredCafe ? (
          <section className="home-featured-section">
            <button type="button" className="home-featured-card" onClick={() => navigate(`/cafe/${featuredCafe.id}`)}>
              <img src={getCafeImage(featuredCafe)} alt={featuredCafe.nombre} />
              <div className="home-featured-shade" />
              <span className="home-featured-like"><Heart size={18} fill="currentColor" /></span>
              <div className="home-featured-content">
                <div className="home-featured-meta">
                  <span><Coffee size={17} /> Latte <b>✦</b></span>
                  <span><Croissant size={17} /> Panadería <b>✦</b></span>
                  <span><MapPin size={17} /> Centro</span>
                </div>
                <div className="home-featured-actions">
                  <span className="home-featured-plus"><Plus size={29} strokeWidth={1.8} /></span>
                  <span onClick={(event) => { event.stopPropagation(); navigate('/map'); }}><MapPin size={19} fill="currentColor" /> Ver en mapa</span>
                  <span onClick={(event) => { event.stopPropagation(); navigate(`/cafe/${featuredCafe.id}`); }}><Info size={19} /> Información</span>
                </div>
              </div>
            </button>
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
        />
        <CafeRow
          title="En tu lista"
          cafes={displaySavedCafes}
          interactionsByCafeId={interactionsByCafeId}
          onOpen={(id) => navigate(`/cafe/${id}`)}
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

function CafeRow({ title, cafes, interactionsByCafeId, onOpen }) {
  if (!cafes.length) return null;

  return (
    <section className="home-row-section">
      <div className="home-section-heading">
        <h2>{title}</h2>
        <span>Ver más <b>›</b></span>
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
