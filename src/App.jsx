import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, LocateFixed, AlertCircle, CheckCircle2, MapPin, Sparkles, Coffee } from 'lucide-react'
import CafeMarker from './components/CafeMarker'
import BottomNav from './components/BottomNav'
import { useAuth } from './context/AuthContext'
import { useCoffeeData } from './context/CoffeeDataContext'
import { supabase } from './supabase'
import { importGoogleMapsLibrary, loadGoogleMapsApi } from './utils/googleMapsLoader'

const getToastIcon = (type) => {
  switch(type) {
    case 'error': return <AlertCircle className="text-red-400 shrink-0" size={20} />;
    case 'success': return <CheckCircle2 className="text-green-400 shrink-0" size={20} />;
    case 'location': return <MapPin className="text-blue-400 shrink-0" size={20} />;
    case 'new': return <Sparkles className="text-yellow-400 shrink-0" size={20} />;
    default: return <Coffee className="text-[#E6DAC1] shrink-0" size={20} />;
  }
};

function App() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { cafes, cafesLoading, cafesError, interactions, addCafes } = useCoffeeData();
  const mapRef = useRef(null)
  const scanCacheRef = useRef(new Set())
  const [map, setMap] = useState(null)
  const [markerLib, setMarkerLib] = useState(null)
  const [mapLoading, setMapLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loggingOut, setLoggingOut] = useState(false)
  const [userLocation, setUserLocation] = useState(null)
  const [locating, setLocating] = useState(false)
  const [mapIntroPending, setMapIntroPending] = useState(() => {
    const animationType = window.sessionStorage.getItem('coffee-map:map-entry-animation');
    if (animationType === 'slide-up') {
      window.sessionStorage.removeItem('coffee-map:map-entry-animation');
      return true;
    }
    return false;
  })
  const [playMapReveal, setPlayMapReveal] = useState(false)

  const visitedCafeIds = useMemo(() => {
    return new Set(
      interactions
        .filter((interaction) => interaction.is_visited)
        .map((interaction) => interaction.cafe_id),
    );
  }, [interactions]);

  const showToast = useCallback((message, type = 'default') => {
    const id = Date.now() + Math.random();
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    if (cafesError) {
      showToast('Error al cargar las cafeterias.', 'error');
    }
  }, [cafesError, showToast]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  const locateUser = () => {
    if (!map) return;
    
    setLocating(true);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          
          setUserLocation(pos);
          map.panTo(pos);
          map.setZoom(15);
          setLocating(false);
        },
        (error) => {
          console.error('Error de geolocalizacion:', error);
          setLocating(false);
          showToast('No se pudo obtener tu ubicacion', 'error');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    } else {
      setLocating(false);
      showToast('Tu navegador no soporta geolocalizacion', 'error');
    }
  };

  const scanCurrentView = async () => {
    if (!map) return;
    setScanning(true);

    try {
      const currentCenter = map.getCenter();
      const lat = currentCenter.lat();
      const lng = currentCenter.lng();
      const scanKey = `${lat.toFixed(3)}:${lng.toFixed(3)}`;

      if (scanCacheRef.current.has(scanKey)) {
        showToast('Esta zona ya se escaneo durante esta sesion.', 'location');
        setScanning(false);
        return;
      }

      const yelpApiKey = import.meta.env.VITE_YELP_API_KEY;
      if (!yelpApiKey) {
        showToast('Falta VITE_YELP_API_KEY en .env', 'error');
        setScanning(false);
        return;
      }

      // Yelp bloquea peticiones directas desde el navegador por seguridad (CORS).
      // Usamos corsproxy.io temporalmente para saltar esta restriccion gratis.
      const targetUrl = encodeURIComponent(`https://api.yelp.com/v3/businesses/search?term=cafe,coffee&latitude=${lat}&longitude=${lng}&limit=20&radius=2000`);
      
      const response = await fetch(`https://corsproxy.io/?${targetUrl}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${yelpApiKey}`,
          'Accept': 'application/json'
        }
      });

      scanCacheRef.current.add(scanKey);

      if (!response.ok) {
        throw new Error(`Error de Yelp: ${response.status}`);
      }

      const data = await response.json();
      const places = data.businesses || [];

      if (places.length > 0) {
        const nuevosParaAgregar = [];
        const idsExistentes = new Set(cafes.map(c => c.id));

        const localesProcesados = places.map(p => ({
          id: p.id,
          nombre: p.name,
          lat: p.coordinates.latitude,
          lng: p.coordinates.longitude,
          pos: { lat: p.coordinates.latitude, lng: p.coordinates.longitude },
          rating: p.rating,
          reviews: p.review_count,
          link: p.url,
          image_url: p.image_url || null,
          imageUrl: p.image_url || null,
        }));

        localesProcesados.forEach(lp => {
          if (!idsExistentes.has(lp.id)) {
            nuevosParaAgregar.push(lp);
          }
        });

        if (nuevosParaAgregar.length > 0) {
          const cafesParaSupabase = nuevosParaAgregar.map(cafe => ({
            id: cafe.id,
            nombre: cafe.nombre,
            lat: cafe.pos.lat,
            lng: cafe.pos.lng,
            rating: cafe.rating,
            reviews: cafe.reviews,
            link: cafe.link,
            image_url: cafe.imageUrl
          }));

          const { error: insertError } = await supabase
            .from('cafes')
            .insert(cafesParaSupabase);

          if (insertError) {
            console.error('Error guardando en Supabase:', insertError);
            showToast('Error al guardar las nuevas cafeterias.', 'error');
          } else {
            addCafes(nuevosParaAgregar);

            nuevosParaAgregar.forEach((cafe, index) => {
              setTimeout(() => {
                showToast(`Nueva cafeteria guardada: "${cafe.nombre}".`, 'new');
              }, index * 600);
            });
          }
        } else {
          showToast('No hay nada nuevo en esta zona.', 'location');
        }
      } else {
        showToast('No se encontraron cafeterias aqui.', 'location');
      }
    } catch (error) {
      console.error(error);
      showToast('Error al escanear con Yelp.', 'error');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const initMap = async () => {
      setMapLoading(true);

      try {
        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
          importGoogleMapsLibrary('maps'),
          importGoogleMapsLibrary('marker'),
        ]);

        if (isCancelled || !mapRef.current) return;

        const mapInstance = new Map(mapRef.current, {
          center: { lat: 20.9753, lng: -89.6178 },
          zoom: 14,
          mapId: '383293d592cd3fce17f51410',
          disableDefaultUI: true,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          rotateControl: false,
          cameraControl: false,
        });

        if (!isCancelled) {
          setMap(mapInstance);
          setMarkerLib({ AdvancedMarkerElement });
        }
      } catch (error) {
        if (isCancelled) return;
        console.error(error);
        showToast('No se pudo cargar el mapa.', 'error');
      } finally {
        if (!isCancelled) {
          setMapLoading(false);
        }
      }
    };

    loadGoogleMapsApi()
      .then(initMap)
      .catch((error) => {
        if (isCancelled) return;
        console.error(error);
        setMapLoading(false);
        showToast(error.message || 'No se pudo cargar Google Maps.', 'error');
      });

    return () => {
      isCancelled = true;
    };
  }, [showToast]);

  const showInitialLoading = mapLoading || (cafesLoading && cafes.length === 0);

  useEffect(() => {
    if (!mapIntroPending || showInitialLoading) return;

    const frameId = window.requestAnimationFrame(() => {
      setPlayMapReveal(true);
      setMapIntroPending(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [mapIntroPending, showInitialLoading]);

  return (
    <main className={`h-full w-full relative overflow-hidden ${(playMapReveal || mapIntroPending) ? 'bg-[#E6DAC1]' : 'bg-gray-100'}`}>
      <style>{`
        @keyframes slideIn {
          0% { transform: translateX(120%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in {
          animation: slideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        @keyframes creamCurtainReveal {
          0% { transform: translateY(0); }
          100% { transform: translateY(-100%); }
        }
        .animate-cream-curtain-reveal {
          animation: creamCurtainReveal 780ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>

      <div className="absolute top-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
        {notifications.map((n) => (
          <div key={n.id} className="bg-black/85 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-3 animate-slide-in pointer-events-auto min-w-70">
            {getToastIcon(n.type)}
            <p className="text-sm font-medium tracking-tight">{n.message}</p>
          </div>
        ))}
      </div>

      {/* Barra de bÃºsqueda estilo input en la parte superior central */}
      <div 
        onClick={() => navigate('/search')}
        className="absolute top-8 left-1/2 -translate-x-1/2 z-40 w-[85%] max-w-md h-10 rounded-full bg-[#372821]/95 flex items-center px-5 cursor-pointer hover:bg-white transition-all active:scale-[0.98]"
      >
        <Search className="text-white mr-3" size={22} />
      </div>

      {/* BotÃ³n de geolocalizaciÃ³n ajustado un poco mÃ¡s arriba para no chocar con la barra inferior */}
      <button 
        onClick={locateUser}
        disabled={locating || !map}
        className="absolute bottom-28 right-6 z-30 w-10 h-10 rounded-full bg-white hover:bg-gray-50 shadow-[0_4px_12px_rgba(0,0,0,0.2)] border border-gray-200 transition-all active:scale-95 flex items-center justify-center disabled:opacity-60"
      >
        {locating ? (
          <div className="w-6 h-6 border-3 border-[#372821] border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <LocateFixed className="text-[#372821]" size={28} />
        )}
      </button>

      {/* Nueva Barra de navegaciÃ³n Inferior */}
      <BottomNav />

      {/*Este elemento es para pruebas y desarrollo, no forma parte de la UI final, pero tampoco debe ser eliminado o modificado */}
      <div className="hidden absolute top-6/11 left-6 z-20 bg-white/95 backdrop-blur-sm p-6 rounded-3xl shadow-2xl w-80 border border-gray-100">
        <h2 className="text-2xl font-black text-gray-900 mb-1">MÃ©rida DB</h2>
        <div className="flex items-center gap-2 mb-6">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Conectado a Supabase</p>
        </div>
        
        <div className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100 flex justify-around">
          <div className="text-center">
            <p className="text-[10px] text-gray-400 uppercase font-bold">Total Acumulado</p>
            <p className="text-3xl font-black text-gray-800">{cafes.length}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            onClick={scanCurrentView} 
            disabled={scanning}
            className={`w-full font-bold py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${scanning ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
          >
            {scanning ? "ESCANEANDO..." : "ESCANEAR Y GUARDAR"}
          </button>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className={`w-full font-bold py-3 rounded-2xl transition-all ${loggingOut ? 'bg-gray-200 text-gray-400' : 'bg-red-600 hover:bg-red-700 text-white'}`}
          >
            {loggingOut ? 'CERRANDO...' : 'CERRAR SESIÃ“N'}
          </button>
        </div>
      </div>

      <div className="absolute inset-0">
        <div id="map" ref={mapRef} className="h-full w-full" />

        {/*Este elemento es para pruebas y desarrollo, no forma parte de la UI final, pero tampoco debe ser eliminado o modificado */}
        <div 
          className="absolute inset-0 pointer-events-none bg-[#372821]/0" 
          style={{ zIndex: 1, mixBlendMode: 'sepia' }} 
        />
      </div>

      {showInitialLoading && !mapIntroPending && (
        <div className="absolute inset-0 z-20 bg-[#1D1A15] flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-[#372821] border-t-[#E6DAC1] rounded-full animate-spin"></div>
          <p className="mt-4 text-sm font-semibold text-[#E6DAC1]/60">Preparando cafeterias...</p>
        </div>
      )}

      {(mapIntroPending || playMapReveal) && (
        <div
          className={`absolute inset-0 z-[70] bg-[#E6DAC1] ${playMapReveal ? 'animate-cream-curtain-reveal' : ''}`}
          onAnimationEnd={() => setPlayMapReveal(false)}
        />
      )}

      {map && markerLib && cafes.map((cafe) => (
        <CafeMarker
          key={cafe.id}
          map={map}
          markerLib={markerLib}
          position={cafe.pos}
          title={cafe.nombre}
          imageUrl={cafe.imageUrl}
          link={cafe.link}
          markerColor={visitedCafeIds.has(cafe.id) ? '#B39978' : undefined}
          onClick={() => navigate(`/cafe/${cafe.id}`)}
        />
      ))}

      {map && markerLib && userLocation && (
        <CafeMarker
          key="user-location"
          map={map}
          markerLib={markerLib}
          position={userLocation}
          title="Tu ubicacion"
          markerColor="#3B82F6"
        />
      )}
    </main>
  );
}

export default App;
