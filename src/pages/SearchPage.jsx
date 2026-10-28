import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Coffee, CheckCircle2, Clock, Heart, X, MapPinned, Plus } from 'lucide-react';
import PageLoading from '../components/PageLoading';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { useAuth } from '../context/AuthContext';
import { normalizeCafeName } from '../utils/cafeDeduplication';
import { sendCafeSubmission } from '../utils/cafeSubmissions';

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const radiusKm = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
};

const getCafeStatus = (interaction) => {
  if (interaction?.is_visited) {
    return {
      label: 'Ya fui',
      icon: CheckCircle2,
      className: 'bg-[#4B6B40]/20 text-[#8BC34A] border-[#8BC34A]/30',
    };
  }

  if (interaction?.is_favorite) {
    return {
      label: 'Favorita',
      icon: Heart,
      className: 'bg-red-500/15 text-red-300 border-red-400/25',
    };
  }

  if (interaction?.in_waitlist) {
    return {
      label: 'Ir luego',
      icon: Clock,
      className: 'bg-blue-500/15 text-blue-300 border-blue-400/25',
    };
  }

  return {
    label: 'Por visitar',
    icon: Coffee,
    className: 'bg-[#372821] text-[#E6DAC1]/55 border-white/5',
  };
};

function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { cafes, cafesLoading, cafesLoaded, loadCafes, interactionsByCafeId } = useCoffeeData();
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [locationResolved, setLocationResolved] = useState(() => !navigator.geolocation);
  const [loadError, setLoadError] = useState('');
  const [showAddCafe, setShowAddCafe] = useState(false);
  const [addingCafe, setAddingCafe] = useState(false);
  const [addCafeFeedback, setAddCafeFeedback] = useState('');
  const [newCafe, setNewCafe] = useState({ nombre: '', address: '', link: '' });
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isCafeSelectionMode = searchParams.get('selectCafe') === '1';
  const returnTo = searchParams.get('returnTo') || '/new-post';

  useEffect(() => {
    if (!cafesLoaded) {
      loadCafes().catch(() => {
        setLoadError('No se pudieron cargar las cafeterias.');
      });
    }
  }, [cafesLoaded, loadCafes]);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationResolved(true);
      },
      () => setLocationResolved(true),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  const cafesWithDistance = useMemo(() => {
    if (!userLocation) return cafes;

    return cafes.map((cafe) => ({
      ...cafe,
      distance: calculateDistance(userLocation.lat, userLocation.lng, cafe.lat, cafe.lng),
    }));
  }, [cafes, userLocation]);

  const displayedCafes = useMemo(() => {
    const query = normalizeCafeName(searchQuery);

    if (query) {
      return cafesWithDistance
        .filter((cafe) => normalizeCafeName(cafe.nombre).includes(query))
        .sort((a, b) => (a.distance ?? Number.MAX_SAFE_INTEGER) - (b.distance ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 6);
    }

    return [...cafesWithDistance]
      .sort((a, b) => (a.distance ?? Number.MAX_SAFE_INTEGER) - (b.distance ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 20);
  }, [cafesWithDistance, searchQuery]);

  const openAddCafe = () => {
    setAddCafeFeedback('');
    setNewCafe((current) => ({
      ...current,
      nombre: current.nombre || searchQuery.trim(),
    }));
    setShowAddCafe(true);
  };

  const submitMissingCafe = async (event) => {
    event.preventDefault();
    if (!user || addingCafe) return;
    if (!newCafe.nombre.trim() || (!newCafe.address.trim() && !newCafe.link.trim())) {
      setAddCafeFeedback('Escribe el nombre y una dirección o enlace de Google Maps.');
      return;
    }
    setAddingCafe(true);
    setAddCafeFeedback('Enviando cafetería…');
    try {
      await sendCafeSubmission({ nombre: newCafe.nombre.trim(), address: newCafe.address.trim(), link: newCafe.link.trim() });
      setAddCafeFeedback('¡Gracias! Tu cafetería se envió al centro de control. Coffee Map verificará su ubicación antes de publicarla.');
      setNewCafe({ nombre: '', address: '', link: '' });
    } catch (error) {
      setAddCafeFeedback(error.message || 'No pudimos enviar la cafetería. Tus datos se conservan.');
    } finally {
      setAddingCafe(false);
    }
  };

  const selectCafeForComposer = (cafe) => {
    if (!isCafeSelectionMode) {
      navigate(`/cafe/${cafe.id}`);
      return;
    }

    const destination = returnTo.startsWith('/') ? returnTo : '/new-post';
    const separator = destination.includes('?') ? '&' : '?';
    navigate(`${destination}${separator}cafe=${encodeURIComponent(cafe.id)}`);
  };

  if (cafesLoading && !cafesLoaded) {
    return <PageLoading message="Buscando cafeterias..." />;
  }

  return (
    <main className="h-full w-full bg-[#1D1A15] flex flex-col">
      <header className="search-page-header p-4 z-10 flex flex-col items-center gap-3">
        <div className="w-full flex items-center gap-4 mb-4">
          <button
            onClick={() => navigate(isCafeSelectionMode ? '/new-post' : '/')}
            className="w-10 h-10 rounded-full bg-[#372821] hover:bg-[#493A33] flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="text-[#E6DAC1]" size={24} />
          </button>
        </div>

        <h2 className="font-['Inria_Serif'] text-lg italic text-[#E6DAC1] mb-2">
          {isCafeSelectionMode ? 'Relaciona una cafetería con tu publicación' : 'Encuentra tu nueva cafeteria favorita'}
        </h2>

        <div className="flex-1 relative w-full">
          <input
            type="text"
            placeholder={isCafeSelectionMode ? 'Buscar cafeterías para relacionar...' : 'Buscar cafeterias...'}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full bg-[#372821] text-[#E6DAC1] placeholder-[#E6DAC1]/50 rounded-full py-3 px-4 pl-10 pr-10 outline-none focus:ring-2 focus:ring-[#E6DAC1]/50 transition-all"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#E6DAC1]/50">
            <Search size={20} />
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#E6DAC1]/50 hover:text-[#E6DAC1] transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-lg font-bold text-[#E6DAC1]">
            {searchQuery ? 'Resultados de busqueda' : isCafeSelectionMode ? 'Cafeterias cercanas' : 'Cafeterias cercanas'}
          </h2>
          {!locationResolved && (
            <span className="text-xs font-semibold text-[#E6DAC1]/40">Calculando distancia...</span>
          )}
        </div>

        {loadError ? (
          <div className="text-center py-10 text-red-300">{loadError}</div>
        ) : displayedCafes.length > 0 ? (
          <div className="search-results-grid">
            {displayedCafes.map((cafe) => {
              const status = getCafeStatus(interactionsByCafeId.get(cafe.id));
              const StatusIcon = status.icon;

              return (
                <button
                  key={cafe.id}
                  type="button"
                  onClick={() => selectCafeForComposer(cafe)}
                  className="search-result-card min-h-25 bg-[#493A33] rounded-3xl shadow-sm flex gap-4 items-center text-left cursor-pointer hover:bg-[#5A463C] transition-colors active:scale-[0.98]"
                >
                  {cafe.imageUrl ? (
                    <img src={cafe.imageUrl} alt={cafe.nombre} className="min-w-25 max-w-25 h-25 rounded-3xl -ml-4 object-cover bg-[#372821]" loading="lazy" decoding="async" />
                  ) : (
                    <div className="min-w-25 max-w-25 h-25 rounded-3xl -ml-4 bg-[#372821] flex items-center justify-center">
                      <Coffee className="text-[#E6DAC1]/50" size={28} />
                    </div>
                  )}
                  <div className="flex-1 pr-4 min-w-0">
                    <h3 className="font-lancelot text-xl text-[#E6DAC1] uppercase tracking-wide truncate">{cafe.nombre}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${status.className}`}>
                        <StatusIcon size={14} className={status.label === 'Favorita' ? 'fill-current' : ''} />
                        {status.label}
                      </span>
                      {typeof cafe.distance === 'number' && (
                        <span className="text-xs text-[#E6DAC1]/45 ml-auto">
                          {cafe.distance < 1
                            ? `${Math.round(cafe.distance * 1000)}m`
                            : `${cafe.distance.toFixed(1)}km`}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 text-[#E6DAC1]/45">
            No se encontraron cafeterias.
          </div>
        )}

        <button type="button" className="add-missing-cafe-trigger" onClick={openAddCafe}>
          <Plus size={17} />
          <span><strong>¿No aparece?</strong><small>Agregar una cafetería faltante</small></span>
        </button>
      </section>

      {showAddCafe && (
        <div className="missing-cafe-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !addingCafe) setShowAddCafe(false);
        }}>
          <section className="missing-cafe-modal" role="dialog" aria-modal="true" aria-labelledby="missing-cafe-title">
            <header>
              <div><MapPinned size={20} /><span><small>AYÚDANOS A CRECER</small><h2 id="missing-cafe-title">Agregar cafetería</h2></span></div>
              <button type="button" onClick={() => setShowAddCafe(false)} disabled={addingCafe} aria-label="Cerrar"><X size={18} /></button>
            </header>

            <form onSubmit={submitMissingCafe}>
              <label>Nombre<input autoFocus value={newCafe.nombre} onChange={(event) => setNewCafe({ ...newCafe, nombre: event.target.value })} maxLength={100} required /></label>
              <label>Dirección<input value={newCafe.address} onChange={(event) => setNewCafe({ ...newCafe, address: event.target.value })} placeholder="Calle, número y colonia" maxLength={220} /></label>
              <label>Enlace de Maps<input type="url" value={newCafe.link} onChange={(event) => setNewCafe({ ...newCafe, link: event.target.value })} placeholder="https://maps.app.goo.gl/..." /></label>

              <p className="missing-cafe-feedback">Verificaremos la ubicación de Google Maps antes de publicar la cafetería.</p>
              {addCafeFeedback && <p className="missing-cafe-feedback" role="status">{addCafeFeedback}</p>}
              <button className="missing-cafe-submit" type="submit" disabled={addingCafe}>{addingCafe ? 'Enviando...' : 'Enviar cafetería'}</button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default SearchPage;
