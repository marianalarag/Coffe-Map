import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Coffee, Star, X } from 'lucide-react';
import PageLoading from '../components/PageLoading';
import { useCoffeeData } from '../context/CoffeeDataContext';

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

function SearchPage() {
  const navigate = useNavigate();
  const { cafes, cafesLoading, cafesLoaded, loadCafes } = useCoffeeData();
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [locationResolved, setLocationResolved] = useState(() => !navigator.geolocation);
  const [loadError, setLoadError] = useState('');

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
    const query = searchQuery.trim().toLowerCase();

    if (query) {
      return cafesWithDistance
        .filter((cafe) => cafe.nombre.toLowerCase().includes(query))
        .sort((a, b) => (a.distance ?? Number.MAX_SAFE_INTEGER) - (b.distance ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 6);
    }

    return [...cafesWithDistance]
      .sort((a, b) => (a.distance ?? Number.MAX_SAFE_INTEGER) - (b.distance ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 20);
  }, [cafesWithDistance, searchQuery]);

  if (cafesLoading && !cafesLoaded) {
    return <PageLoading message="Buscando cafeterias..." />;
  }

  return (
    <main className="h-full w-full bg-[#1D1A15] flex flex-col">
      <header className="p-4 pt-6 z-10 flex flex-col items-center gap-3">
        <div className="w-full flex items-center gap-4 mb-4">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 rounded-full bg-[#372821] hover:bg-[#493A33] flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="text-[#E6DAC1]" size={24} />
          </button>
        </div>

        <h2 className="font-['Inria_Serif'] text-lg italic text-[#E6DAC1] mb-2">
          Encuentra tu nueva cafeteria favorita
        </h2>

        <div className="flex-1 relative w-full">
          <input
            type="text"
            placeholder="Buscar cafeterias..."
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
            {searchQuery ? 'Resultados de busqueda' : 'Cafeterias cercanas'}
          </h2>
          {!locationResolved && (
            <span className="text-xs font-semibold text-[#E6DAC1]/40">Calculando distancia...</span>
          )}
        </div>

        {loadError ? (
          <div className="text-center py-10 text-red-300">{loadError}</div>
        ) : displayedCafes.length > 0 ? (
          <div className="flex flex-col gap-6">
            {displayedCafes.map((cafe) => (
              <button
                key={cafe.id}
                type="button"
                onClick={() => navigate(`/cafe/${cafe.id}`)}
                className="min-h-25 bg-[#493A33] rounded-3xl shadow-sm flex gap-4 items-center text-left cursor-pointer hover:bg-[#5A463C] transition-colors active:scale-[0.98]"
              >
                {cafe.imageUrl ? (
                  <img src={cafe.imageUrl} alt={cafe.nombre} className="min-w-25 max-w-25 h-25 rounded-3xl -ml-4 object-cover bg-[#372821]" />
                ) : (
                  <div className="min-w-25 max-w-25 h-25 rounded-3xl -ml-4 bg-[#372821] flex items-center justify-center">
                    <Coffee className="text-[#E6DAC1]/50" size={28} />
                  </div>
                )}
                <div className="flex-1 pr-4 min-w-0">
                  <h3 className="font-lancelot text-xl text-[#E6DAC1] uppercase tracking-wide truncate">{cafe.nombre}</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="text-yellow-500 fill-yellow-500" size={14} />
                    <span className="text-sm font-medium text-[#E6DAC1]/60">{cafe.rating || 'N/A'}</span>
                    <span className="text-xs text-[#E6DAC1]/35">({cafe.reviews || 0})</span>
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
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-[#E6DAC1]/45">
            No se encontraron cafeterias.
          </div>
        )}
      </section>
    </main>
  );
}

export default SearchPage;
