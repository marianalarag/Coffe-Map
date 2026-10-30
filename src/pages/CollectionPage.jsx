import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Check, Heart, ListPlus, SlidersHorizontal } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import PageLoading from '../components/PageLoading';
import { useCoffeeData } from '../context/CoffeeDataContext';
import HalfStarRating from '../components/HalfStarRating';
import ProfileCafeCard from '../components/ProfileCafeCard';
import CoffeeBeanIcon from '../components/CoffeeBeanIcon';
import { formatRating } from '../utils/formatRating';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=85';

const COLLECTIONS = {
  favorites: {
    label: 'Favoritos',
    icon: Heart,
    filter: (interaction) => interaction.is_favorite,
  },
  reviews: {
    label: 'Reviews',
    icon: BookOpen,
    filter: (interaction) => Boolean(interaction.review_text?.trim()),
  },
  ratings: {
    label: 'Calificadas',
    icon: CoffeeBeanIcon,
    filter: (interaction) => Number(interaction.rating) > 0,
  },
  list: {
    label: 'Lista',
    icon: ListPlus,
    filter: (interaction) => interaction.in_waitlist,
  },
};

const getImage = (cafe) => cafe?.imageUrl || FALLBACK_IMAGE;
const getRating = (interaction, cafe) => Number(interaction?.rating || cafe?.rating || 4.5);

function CollectionPage({ collection: collectionProp }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { cafeById, cafesLoaded, loadCafes, interactions, interactionsLoading } = useCoffeeData();
  const collection = collectionProp || 'favorites';
  const config = COLLECTIONS[collection] || COLLECTIONS.favorites;
  const ratingParam = new URLSearchParams(location.search).get('rating');
  const ratingFilter = collection === 'ratings' && /^\d(?:\.5)?$/.test(ratingParam || '')
    ? Number(ratingParam)
    : null;
  const Icon = config.icon;
  const [showFilters, setShowFilters] = useState(false);
  const [sortMode, setSortMode] = useState('recent');

  useEffect(() => {
    if (!cafesLoaded) loadCafes().catch(() => {});
  }, [cafesLoaded, loadCafes]);

  const entries = useMemo(() => interactions
    .filter(config.filter)
    .filter((interaction) => ratingFilter === null || Math.round(Number(interaction.rating || 0) * 2) / 2 === ratingFilter)
    .map((interaction) => ({ interaction, cafe: cafeById.get(interaction.cafe_id) }))
    .filter(({ cafe }) => cafe)
    .sort((a, b) => {
      if (sortMode === 'name') return a.cafe.nombre.localeCompare(b.cafe.nombre, 'es');
      if (sortMode === 'rating') return getRating(b.interaction, b.cafe) - getRating(a.interaction, a.cafe);
      return (b.interaction.updated_at || '').localeCompare(a.interaction.updated_at || '');
    }),
  [cafeById, config, interactions, ratingFilter, sortMode]);

  if (!cafesLoaded && interactionsLoading) {
    return <PageLoading message="Cargando tu colección..." />;
  }

  return (
    <main className={`collection-page collection-page-${collection}`}>
      <div className="collection-scroll">
        <header className="collection-topbar">
          <button type="button" onClick={() => navigate('/profile')} aria-label="Volver al perfil">
            <ArrowLeft size={22} />
          </button>
          <div className="collection-title"><Icon size={18} fill={collection === 'favorites' || collection === 'ratings' ? 'currentColor' : 'none'} /><span>{ratingFilter === null ? config.label : `${config.label} · ${formatRating(ratingFilter)}`}</span></div>
          <button type="button" aria-label="Filtrar colección" aria-expanded={showFilters} onClick={() => setShowFilters((current) => !current)}><SlidersHorizontal size={18} /></button>
        </header>

        {showFilters && (
          <section className="collection-filter-panel" aria-label="Ordenar colección">
            <span>Ordenar por</span>
            {[
              ['recent', 'Más recientes'],
              ['rating', 'Mejor calificadas'],
              ['name', 'Nombre A–Z'],
            ].map(([value, label]) => (
              <button type="button" key={value} className={sortMode === value ? 'is-active' : ''} onClick={() => { setSortMode(value); setShowFilters(false); }}>
                {label}{sortMode === value && <Check size={14} />}
              </button>
            ))}
          </section>
        )}

        {entries.length > 0 ? (
          collection === 'reviews'
            ? <ReviewsList entries={entries} onOpen={(id) => navigate(`/cafe/${id}`)} />
            : <CafeGrid entries={entries} onOpen={(id) => navigate(`/cafe/${id}`)} />
        ) : (
          <div className="collection-empty">
            <Icon size={30} strokeWidth={1.4} />
            <h1>{ratingFilter === null ? (collection === 'reviews' ? 'Aún no tienes reviews' : `Aún no tienes ${config.label.toLowerCase()}`) : `No tienes cafeterías con ${formatRating(ratingFilter)}`}</h1>
            <p>{ratingFilter === null && collection === 'list' ? 'Agrega cafeterías que quieras visitar y las encontrarás aquí.' : 'Explora el mapa y guarda tus lugares favoritos.'}</p>
            <button type="button" onClick={() => navigate('/map')}>Explorar cafeterías</button>
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

function CafeGrid({ entries, onOpen }) {
  return (
    <div className="collection-grid">
      {entries.map(({ cafe, interaction }) => (
        <ProfileCafeCard key={interaction.id} cafe={{ ...cafe, rating: Number(interaction.rating || 0) }} onClick={() => onOpen(cafe.id)} />
      ))}
    </div>
  );
}

function ReviewsList({ entries, onOpen }) {
  return (
    <div className="collection-reviews-list">
      {entries.map(({ cafe, interaction }) => (
        <button className="collection-review-card" type="button" key={interaction.id} onClick={() => onOpen(cafe.id)}>
          <div className="collection-review-head">
            <h2>{cafe.nombre}</h2>
          </div>
          <div className="collection-review-body">
            <img src={getImage(cafe)} alt={cafe.nombre} loading="lazy" decoding="async" />
            <div>
              <div className="collection-review-rating"><HalfStarRating value={getRating(interaction, cafe)} readOnly size={14} /><span>{formatRating(getRating(interaction, cafe))}</span></div>
              <p>{interaction.review_text}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export default CollectionPage;
