import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, ScanSearch, LocateFixed, AlertCircle, CheckCircle2, MapPin, Sparkles, Coffee } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import BottomNav from './components/BottomNav'
import { useAuth } from './context/AuthContext'
import { useCoffeeData } from './context/CoffeeDataContext'

const MERIDA_CENTER = { lat: 20.9753, lng: -89.6178 };
const MERIDA_BOUNDS = [[20.86, -89.75], [21.08, -89.52]];
const MAP_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL
  || 'https://tiles.openfreemap.org/styles/liberty';
const MAP_TILE_URL = import.meta.env.VITE_MAP_TILE_URL || '';
const MAP_TILE_ATTRIBUTION = import.meta.env.VITE_MAP_TILE_ATTRIBUTION
  || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const MAP_TARGET_STORAGE_KEY = 'coffee-map:focus-cafe';
const MARKER_RENDER_PADDING = 0.18;
const MAX_RENDERED_MARKERS = 140;

const getToastIcon = (type) => {
  switch(type) {
    case 'error': return <AlertCircle className="text-red-400 shrink-0" size={20} />;
    case 'success': return <CheckCircle2 className="text-green-400 shrink-0" size={20} />;
    case 'location': return <MapPin className="text-blue-400 shrink-0" size={20} />;
    case 'new': return <Sparkles className="text-yellow-400 shrink-0" size={20} />;
    default: return <Coffee className="text-[#E6DAC1] shrink-0" size={20} />;
  }
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const getSafeImageStyle = (imageUrl) => {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return '';
  }

  return `background-image: url('${String(imageUrl).replaceAll("'", '%27')}');`;
};

const getCafeMarkerHtml = ({ cafe, markerColor, showPreview }) => {
  if (!showPreview) {
    return `
      <span class="coffee-map-leaflet-shell">
        <span class="coffee-map-leaflet-pin" style="--marker-color: ${markerColor}">
          <span class="coffee-map-leaflet-dot"></span>
        </span>
      </span>
    `;
  }

  const imageStyle = getSafeImageStyle(cafe.imageUrl);
  const previewClassName = imageStyle
    ? 'coffee-map-leaflet-preview coffee-map-leaflet-preview--image'
    : 'coffee-map-leaflet-preview';

  return `
    <span class="coffee-map-leaflet-shell">
      <span class="coffee-map-leaflet-pin" style="--marker-color: ${markerColor}">
        <span class="coffee-map-leaflet-dot"></span>
      </span>
      <span class="${previewClassName}" style="--marker-color: ${markerColor}; ${imageStyle}">
        <span class="coffee-map-leaflet-preview-overlay"></span>
        <span class="coffee-map-leaflet-preview-name">${escapeHtml(cafe.nombre)}</span>
      </span>
    </span>
  `;
};

const getClusterMarkerHtml = (count) => `
  <span class="coffee-map-leaflet-cluster" aria-label="${count} cafeterías cercanas">
    <span>${count}</span>
  </span>
`;

const getMarkerGroups = (map, cafes) => {
  const zoom = map.getZoom();
  const paddedBounds = map.getBounds().pad(MARKER_RENDER_PADDING);
  const visibleCafes = cafes.filter((cafe) => {
    const lat = Number(cafe.lat);
    const lng = Number(cafe.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && paddedBounds.contains([lat, lng]);
  });

  let cellSize = zoom <= 11 ? 76 : zoom <= 13 ? 56 : zoom <= 14 ? 44 : zoom <= 15 ? 32 : zoom <= 16 ? 22 : 14;
  let groups = [];

  do {
    const cells = new Map();

    visibleCafes.forEach((cafe) => {
      const point = map.project([Number(cafe.lat), Number(cafe.lng)], zoom);
      const cellKey = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
      const cell = cells.get(cellKey);

      if (cell) {
        cell.cafes.push(cafe);
        cell.latTotal += Number(cafe.lat);
        cell.lngTotal += Number(cafe.lng);
      } else {
        cells.set(cellKey, {
          key: cellKey,
          cafes: [cafe],
          latTotal: Number(cafe.lat),
          lngTotal: Number(cafe.lng),
        });
      }
    });

    groups = [...cells.values()];
    cellSize = Math.ceil(cellSize * 1.3);
  } while (groups.length > MAX_RENDERED_MARKERS && cellSize < 180);

  return groups.map((group) => {
    if (group.cafes.length === 1) {
      const cafe = group.cafes[0];
      return {
        key: `cafe:${cafe.id}`,
        type: 'cafe',
        cafe,
        lat: Number(cafe.lat),
        lng: Number(cafe.lng),
      };
    }

    return {
      key: `cluster:${zoom}:${group.key}`,
      type: 'cluster',
      cafes: group.cafes,
      lat: group.latTotal / group.cafes.length,
      lng: group.lngTotal / group.cafes.length,
    };
  });
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { cafes, cafesLoading, cafesError, interactions } = useCoffeeData();
  const mapRef = useRef(null)
  const markerLayerRef = useRef(null)
  const cafeMarkerEntriesRef = useRef(new Map())
  const markerRenderFrameRef = useRef(null)
  const userMarkerRef = useRef(null)
  const scanTimerRef = useRef(null)
  const [map, setMap] = useState(null)
  const [mapLoading, setMapLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanResultCount, setScanResultCount] = useState(null)
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

          const isInMerida = pos.lat >= MERIDA_BOUNDS[0][0]
            && pos.lat <= MERIDA_BOUNDS[1][0]
            && pos.lng >= MERIDA_BOUNDS[0][1]
            && pos.lng <= MERIDA_BOUNDS[1][1];

          if (!isInMerida) {
            setLocating(false);
            map.setView([MERIDA_CENTER.lat, MERIDA_CENTER.lng], 13, { animate: true });
            showToast('Coffee Map está limitado a Mérida.', 'location');
            return;
          }

          setUserLocation(pos);
          map.setView([pos.lat, pos.lng], 15, { animate: true });
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

  const scanCurrentView = () => {
    if (!map || scanning || cafesLoading) return;

    setScanning(true);
    setScanResultCount(null);

    scanTimerRef.current = window.setTimeout(() => {
      const bounds = map.getBounds();
      const visibleCafes = cafes.filter((cafe) => (
        Number.isFinite(Number(cafe.lat))
        && Number.isFinite(Number(cafe.lng))
        && bounds.contains([Number(cafe.lat), Number(cafe.lng)])
      ));

      setScanResultCount(visibleCafes.length);
      setScanning(false);
      scanTimerRef.current = null;

      if (visibleCafes.length === 0) {
        showToast('No encontramos cafeterías en esta zona. Aleja el mapa e intenta otra vez.', 'location');
        return;
      }

      showToast(
        `${visibleCafes.length} ${visibleCafes.length === 1 ? 'cafetería encontrada' : 'cafeterías encontradas'} en esta zona.`,
        'new',
      );
    }, 2400);
  };

  useEffect(() => () => {
    if (scanTimerRef.current) {
      window.clearTimeout(scanTimerRef.current);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    let leafletMap = null;
    const markerEntries = cafeMarkerEntriesRef.current;

    const initMap = async () => {
      setMapLoading(true);

      try {
        if (isCancelled || !mapRef.current) return;

        leafletMap = L.map(mapRef.current, {
          center: [MERIDA_CENTER.lat, MERIDA_CENTER.lng],
          zoom: 14,
          minZoom: 11,
          maxBounds: MERIDA_BOUNDS,
          maxBoundsViscosity: 1,
          zoomControl: false,
          attributionControl: false,
        });

        L.control.attribution({ position: 'topright', prefix: false })
          .addTo(leafletMap);

        if (MAP_TILE_URL) {
          L.tileLayer(MAP_TILE_URL, {
            attribution: MAP_TILE_ATTRIBUTION,
            maxZoom: 19,
            updateWhenIdle: true,
            updateWhenZooming: false,
            keepBuffer: 2,
          }).addTo(leafletMap);
        } else {
          const { maplibreGL } = await import('@maplibre/maplibre-gl-leaflet');
          if (isCancelled) return;
          maplibreGL({
            style: MAP_STYLE_URL,
            interactive: false,
            maxZoom: 19,
          }).addTo(leafletMap);
        }

        markerLayerRef.current = L.layerGroup().addTo(leafletMap);

        if (!isCancelled) {
          setMap(leafletMap);
        }
      } catch (error) {
        if (isCancelled) return;
        console.error(error);
        showToast('No se pudo cargar el mapa de Merida.', 'error');
      } finally {
        if (!isCancelled) {
          setMapLoading(false);
        }
      }
    };

    initMap();

    return () => {
      isCancelled = true;
      if (markerLayerRef.current) {
        markerLayerRef.current.remove();
        markerLayerRef.current = null;
      }
      markerEntries.clear();
      if (markerRenderFrameRef.current) {
        window.cancelAnimationFrame(markerRenderFrameRef.current);
        markerRenderFrameRef.current = null;
      }
      if (leafletMap) {
        leafletMap.remove();
      }
      setMap(null);
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

  const renderVisibleMarkers = useCallback(() => {
    if (!map || !markerLayerRef.current) return;

    const markerGroups = getMarkerGroups(map, cafes);
    const nextKeys = new Set(markerGroups.map((group) => group.key));
    const showMarkerPreviews = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;

    cafeMarkerEntriesRef.current.forEach((entry, key) => {
      if (nextKeys.has(key)) return;
      entry.marker.remove();
      cafeMarkerEntriesRef.current.delete(key);
    });

    markerGroups.forEach((group) => {
      const isCafe = group.type === 'cafe';
      const markerColor = isCafe && visitedCafeIds.has(group.cafe.id) ? '#B39978' : '#4B2C20';
      const signature = isCafe
        ? `${markerColor}|${group.cafe.nombre}|${group.cafe.imageUrl || ''}`
        : group.cafes.map((cafe) => cafe.id).join('|');
      const existingEntry = cafeMarkerEntriesRef.current.get(group.key);

      if (existingEntry?.signature === signature) return;
      if (existingEntry) existingEntry.marker.remove();

      const marker = L.marker([group.lat, group.lng], {
        title: isCafe ? group.cafe.nombre : `${group.cafes.length} cafeterías cercanas`,
        riseOnHover: true,
        icon: L.divIcon(isCafe ? {
          className: 'coffee-map-leaflet-marker',
          html: getCafeMarkerHtml({ cafe: group.cafe, markerColor, showPreview: showMarkerPreviews }),
          iconSize: [28, 36],
          iconAnchor: [14, 34],
        } : {
          className: 'coffee-map-leaflet-marker coffee-map-leaflet-cluster-icon',
          html: getClusterMarkerHtml(group.cafes.length),
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        }),
      });

      if (isCafe) {
        marker.on('click', () => navigate(`/cafe/${group.cafe.id}`));
      } else {
        marker.on('click', () => {
          const clusterBounds = L.latLngBounds(
            group.cafes.map((cafe) => [Number(cafe.lat), Number(cafe.lng)]),
          );

          if (!clusterBounds.isValid()) return;

          const northEast = clusterBounds.getNorthEast();
          const southWest = clusterBounds.getSouthWest();
          if (northEast.equals(southWest)) {
            map.setView([group.lat, group.lng], 18, { animate: true });
            return;
          }

          map.fitBounds(clusterBounds.pad(0.35), {
            animate: true,
            duration: 0.55,
            maxZoom: 18,
            paddingTopLeft: [72, 86],
            paddingBottomRight: [72, 118],
          });
        });
      }

      marker.addTo(markerLayerRef.current);
      cafeMarkerEntriesRef.current.set(group.key, { marker, signature });
    });
  }, [cafes, map, navigate, visitedCafeIds]);

  useEffect(() => {
    if (!map) return undefined;

    const scheduleMarkerRender = () => {
      if (markerRenderFrameRef.current) {
        window.cancelAnimationFrame(markerRenderFrameRef.current);
      }

      markerRenderFrameRef.current = window.requestAnimationFrame(() => {
        markerRenderFrameRef.current = null;
        renderVisibleMarkers();
      });
    };

    scheduleMarkerRender();
    map.on('moveend resize', scheduleMarkerRender);

    return () => {
      map.off('moveend resize', scheduleMarkerRender);
      if (markerRenderFrameRef.current) {
        window.cancelAnimationFrame(markerRenderFrameRef.current);
        markerRenderFrameRef.current = null;
      }
    };
  }, [map, renderVisibleMarkers]);

  useEffect(() => {
    const scanTargets = [];

    cafeMarkerEntriesRef.current.forEach(({ marker }) => {
      const element = marker.getElement();
      const target = element?.querySelector('.coffee-map-leaflet-shell, .coffee-map-leaflet-cluster');
      target?.classList.remove('coffee-map-leaflet-shell--scan-target', 'coffee-map-leaflet-cluster--scan-target');
      target?.style.removeProperty('--scan-delay');

      if (!scanning || !map?.getBounds().contains(marker.getLatLng()) || !target) return;

      const targetClass = target.classList.contains('coffee-map-leaflet-cluster')
        ? 'coffee-map-leaflet-cluster--scan-target'
        : 'coffee-map-leaflet-shell--scan-target';
      target.classList.add(targetClass);
      target.style.setProperty('--scan-delay', `${Math.min(scanTargets.length * 95, 1850)}ms`);
      scanTargets.push(target);
    });

    return () => {
      scanTargets.forEach((target) => {
        target.classList.remove('coffee-map-leaflet-shell--scan-target', 'coffee-map-leaflet-cluster--scan-target');
        target.style.removeProperty('--scan-delay');
      });
    };
  }, [map, scanning]);

  useEffect(() => {
    if (!map || !userLocation) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
      title: 'Tu ubicacion',
      icon: L.divIcon({
        className: 'coffee-map-leaflet-marker',
        html: `
          <span class="coffee-map-leaflet-pin coffee-map-leaflet-pin--user">
            <span class="coffee-map-leaflet-dot"></span>
          </span>
        `,
        iconSize: [28, 36],
        iconAnchor: [14, 34],
      }),
    }).addTo(map);

    return () => {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
    };
  }, [map, userLocation]);

  useEffect(() => {
    if (!map || location.pathname !== '/map') return;

    let target = null;
    try {
      target = JSON.parse(window.sessionStorage.getItem(MAP_TARGET_STORAGE_KEY) || 'null');
    } catch {
      target = null;
    }

    if (!target) return;

    const cafe = cafes.find((currentCafe) => currentCafe.id === target.id);
    const lat = Number(cafe?.lat ?? target.lat);
    const lng = Number(cafe?.lng ?? target.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    window.sessionStorage.removeItem(MAP_TARGET_STORAGE_KEY);
    map.setView([lat, lng], 18, { animate: true });
    showToast(`Mostrando ${cafe?.nombre || target.nombre || 'cafeteria'} en el mapa.`, 'location');
  }, [cafes, location.pathname, map, showToast]);

  return (
    <main className={`isolate h-full w-full relative overflow-hidden ${(playMapReveal || mapIntroPending) ? 'bg-[#E6DAC1]' : 'bg-gray-100'} ${scanning ? 'map-scan-active' : ''}`}>
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
        .leaflet-container {
          background: #E6DAC1;
          font-family: inherit;
        }
        .coffee-map-leaflet-marker {
          background: transparent;
          border: 0;
          overflow: visible !important;
        }
        .coffee-map-leaflet-shell {
          position: relative;
          display: block;
          width: 28px;
          height: 36px;
        }
        .coffee-map-leaflet-cluster-icon {
          display: grid !important;
          place-items: center;
        }
        .coffee-map-leaflet-cluster {
          display: grid;
          place-items: center;
          width: 42px;
          height: 42px;
          color: #fff8e9;
          background: #4B2C20;
          border: 3px solid rgba(255, 248, 233, .92);
          border-radius: 50%;
          box-shadow: 0 5px 14px rgba(0, 0, 0, .32);
          font-size: 12px;
          font-weight: 900;
          line-height: 1;
          transform: translateZ(0);
        }
        .coffee-map-leaflet-pin {
          --marker-color: #4B2C20;
          position: absolute;
          left: 3px;
          bottom: 5px;
          display: block;
          width: 22px;
          height: 22px;
          border-radius: 12px 12px 12px 2px;
          background: var(--marker-color);
          border: 2px solid var(--marker-color);
          box-shadow: 0 5px 12px rgba(0, 0, 0, 0.35);
          transform: rotate(-45deg);
          z-index: 2;
          transition: transform 220ms ease, box-shadow 220ms ease;
        }
        .coffee-map-leaflet-pin--user {
          --marker-color: #3B82F6;
        }
        .coffee-map-leaflet-dot {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #fff;
          transform: translate(-50%, -50%);
        }
        .coffee-map-leaflet-preview {
          position: absolute;
          left: 50%;
          bottom: 38px;
          width: 150px;
          min-height: 74px;
          border-radius: 12px;
          border: 2px solid var(--marker-color);
          background: var(--marker-color);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.34);
          opacity: 0;
          pointer-events: none;
          overflow: hidden;
          transform: translate(-50%, 8px) scale(0.82);
          transform-origin: bottom center;
          transition: opacity 220ms ease, transform 220ms ease;
          z-index: 3;
        }
        .coffee-map-leaflet-preview--image {
          background-size: cover;
          background-position: center;
        }
        .coffee-map-leaflet-preview-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.74), rgba(0, 0, 0, 0.14));
        }
        .coffee-map-leaflet-preview-name {
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 8px;
          color: white;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.15;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
          text-transform: uppercase;
        }
        .coffee-map-leaflet-shell:hover .coffee-map-leaflet-pin {
          transform: rotate(-45deg) scale(1.08);
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.4);
        }
        .coffee-map-leaflet-shell:hover .coffee-map-leaflet-preview {
          opacity: 1;
          transform: translate(-50%, 0) scale(1);
        }
        .leaflet-control-attribution {
          max-width: 128px;
          margin: max(58px, calc(env(safe-area-inset-top, 0px) + 45px)) 8px 0 0 !important;
          padding: 3px 7px !important;
          color: rgba(39, 32, 26, .68) !important;
          background: rgba(255,255,255,.76) !important;
          border-radius: 999px !important;
          box-shadow: 0 3px 10px rgba(0,0,0,.1);
          font-size: 7px !important;
          line-height: 1.25 !important;
          backdrop-filter: blur(8px);
        }
        .leaflet-control-attribution a { color: inherit !important; }
        .map-scan-overlay {
          position: absolute;
          inset: 0;
          z-index: 800;
          overflow: hidden;
          pointer-events: none;
          background: radial-gradient(circle at center, rgba(230, 218, 193, .08), rgba(39, 32, 26, .42));
        }
        .map-scan-overlay::before {
          content: '';
          position: absolute;
          inset: 0;
          opacity: .38;
          background-image: linear-gradient(rgba(55, 40, 33, .12) 1px, transparent 1px), linear-gradient(90deg, rgba(55, 40, 33, .12) 1px, transparent 1px);
          background-size: 38px 38px;
          animation: mapScanGrid 2.4s ease-out both;
        }
        .map-scan-lens {
          position: absolute;
          left: 0;
          top: 0;
          width: 112px;
          height: 112px;
          display: grid;
          place-items: center;
          color: #fff8e9;
          background: rgba(39, 32, 26, .2);
          border: 4px solid rgba(255, 248, 233, .98);
          border-radius: 50%;
          box-shadow: 0 0 0 999px rgba(55, 40, 33, .08), inset 0 0 26px rgba(255,255,255,.22), 0 12px 34px rgba(0,0,0,.28);
          backdrop-filter: saturate(1.25) contrast(1.08);
          animation: mapScanLens 2.4s cubic-bezier(.45,.05,.3,1) both;
        }
        .map-scan-lens::after {
          content: '';
          position: absolute;
          right: -23px;
          bottom: -13px;
          width: 32px;
          height: 8px;
          background: #fff8e9;
          border-radius: 999px;
          transform: rotate(45deg);
          transform-origin: left center;
          box-shadow: 0 3px 9px rgba(0,0,0,.22);
        }
        .map-scan-copy {
          position: absolute;
          left: 50%;
          bottom: calc(94px + env(safe-area-inset-bottom, 0px));
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 13px;
          color: #fff8e9;
          background: rgba(55, 40, 33, .88);
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          transform: translateX(-50%);
          box-shadow: 0 8px 22px rgba(0,0,0,.24);
          backdrop-filter: blur(10px);
        }
        .map-scan-copy span {
          width: 6px;
          height: 6px;
          background: #e6dac1;
          border-radius: 50%;
          animation: mapScanDot .7s ease-in-out infinite alternate;
        }
        .map-scan-active .coffee-map-leaflet-pin {
          animation: mapScanMarker 900ms ease-in-out infinite alternate;
        }
        .map-scan-active .coffee-map-leaflet-shell--scan-target,
        .map-scan-active .coffee-map-leaflet-cluster--scan-target {
          opacity: 0;
          animation: mapScanPinReveal 480ms cubic-bezier(.2,.9,.28,1.25) var(--scan-delay) both;
        }
        @keyframes mapScanLens {
          0% { transform: translate(-20px, max(30px, env(safe-area-inset-top, 0px))) scale(.78); opacity: 0; }
          12% { opacity: 1; }
          27% { transform: translate(calc(100vw - 126px), 18vh) scale(1); }
          52% { transform: translate(10vw, calc(100dvh - 310px)) scale(.94); }
          76% { transform: translate(calc(100vw - 132px), 54vh) scale(1.08); }
          100% { transform: translate(42vw, 34vh) scale(.9); opacity: 0; }
        }
        @keyframes mapScanGrid { from { opacity: 0; transform: scale(1.08); } to { opacity: .38; transform: scale(1); } }
        @keyframes mapScanMarker { to { filter: drop-shadow(0 0 9px rgba(255,248,233,.95)); transform: rotate(-45deg) translate(3px, -3px) scale(1.08); } }
        @keyframes mapScanPinReveal { 0% { opacity: 0; transform: translateY(22px) scale(.45); } 70% { opacity: 1; transform: translateY(-4px) scale(1.12); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes mapScanDot { to { opacity: .25; transform: scale(.72); } }
        @media (prefers-reduced-motion: reduce) {
          .map-scan-lens, .map-scan-overlay::before, .map-scan-active .coffee-map-leaflet-pin, .map-scan-active .coffee-map-leaflet-shell--scan-target, .map-scan-active .coffee-map-leaflet-cluster--scan-target, .map-scan-copy span { animation: none; opacity: 1; }
          .map-scan-lens { left: 50%; top: 42%; opacity: 1; transform: translate(-50%, -50%); }
        }
      `}</style>

      <div className="map-toast-stack absolute right-6 z-[1100] flex flex-col gap-3 pointer-events-none">
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
        className="map-search-control absolute left-1/2 -translate-x-1/2 z-[1000] w-[85%] max-w-md h-11 rounded-full bg-[#27201A]/95 flex items-center px-5 cursor-pointer transition-all active:scale-[0.98] shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
      >
        <Search className="text-white mr-3" size={22} />
      </div>

      {/* BotÃ³n de geolocalizaciÃ³n ajustado un poco mÃ¡s arriba para no chocar con la barra inferior */}
      <button 
        onClick={locateUser}
        disabled={locating || !map}
        className="map-locate-control absolute right-6 z-[1000] w-11 h-11 rounded-full bg-white hover:bg-gray-50 shadow-[0_4px_12px_rgba(0,0,0,0.2)] border border-gray-200 transition-all active:scale-95 flex items-center justify-center disabled:opacity-60"
      >
        {locating ? (
          <div className="w-6 h-6 border-3 border-[#372821] border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <LocateFixed className="text-[#372821]" size={28} />
        )}
      </button>

      {/* Nueva Barra de navegaciÃ³n Inferior */}
      <button
        type="button"
        onClick={scanCurrentView}
        disabled={scanning || !map || cafesLoading}
        aria-label="Escanear cafeterías en la zona visible"
        className="map-scan-control absolute left-6 z-[1000] h-11 max-w-[calc(100%_-_7rem)] rounded-full bg-[#27201A]/95 text-[#FFF8E9] shadow-[0_4px_14px_rgba(0,0,0,0.28)] border border-white/15 transition-all active:scale-95 flex items-center justify-center gap-2 px-4 disabled:opacity-60"
      >
        <ScanSearch size={19} className={scanning ? 'animate-pulse' : ''} />
        <span className="text-[11px] font-bold whitespace-nowrap">
          {scanning ? 'Escaneando…' : scanResultCount === null ? 'Escanear zona' : `${scanResultCount} ${scanResultCount === 1 ? 'encontrada' : 'encontradas'}`}
        </span>
      </button>

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
            onClick={handleLogout}
            disabled={loggingOut}
            className={`w-full font-bold py-3 rounded-2xl transition-all ${loggingOut ? 'bg-gray-200 text-gray-400' : 'bg-red-600 hover:bg-red-700 text-white'}`}
          >
            {loggingOut ? 'CERRANDO...' : 'CERRAR SESIÃ“N'}
          </button>
        </div>
      </div>

      <div className="absolute inset-0 z-0">
        <div id="map" ref={mapRef} className="h-full w-full" />

        {/*Este elemento es para pruebas y desarrollo, no forma parte de la UI final, pero tampoco debe ser eliminado o modificado */}
        <div 
          className="absolute inset-0 pointer-events-none bg-[#372821]/0" 
          style={{ zIndex: 1, mixBlendMode: 'sepia' }} 
        />
      </div>

      {scanning && (
        <div className="map-scan-overlay" role="status" aria-live="polite" aria-label="Escaneando cafeterías en el mapa">
          <div className="map-scan-lens"><Search size={34} strokeWidth={2.2} /></div>
          <div className="map-scan-copy"><span /> Explorando esta zona</div>
        </div>
      )}

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

    </main>
  );
}

export default App;
