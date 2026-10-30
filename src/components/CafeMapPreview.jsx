import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function CafeMapPreview({ lat, lng }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    let cancelled = false;
    let vectorLayer;
    let fallbackLayer;
    const container = containerRef.current;
    const markReady = () => { if (!cancelled) container.dataset.mapReady = 'true'; };
    const map = L.map(containerRef.current, {
      center: [lat, lng], zoom: 16, zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false,
    });
    L.marker([lat, lng], {
      interactive: false,
      icon: L.divIcon({
        className: 'cafe-preview-pin',
        html: '<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true"><path d="M16 40S2 25 2 16a14 14 0 0 1 28 0c0 9-14 24-14 24Z" fill="#7a5533"/></svg>',
        iconSize: [32, 42], iconAnchor: [16, 42],
      }),
    }).addTo(map);
    const showFallback = () => {
      if (cancelled || fallbackLayer) return;
      vectorLayer?.remove();
      fallbackLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
      }).on('load', markReady).addTo(map);
    };
    const tileUrl = import.meta.env.VITE_MAP_TILE_URL;
    if (tileUrl) {
      L.tileLayer(tileUrl, { attribution: import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; OpenStreetMap contributors', maxZoom: 19 }).on('load', markReady).addTo(map);
    } else {
      import('@maplibre/maplibre-gl-leaflet').then(({ maplibreGL }) => {
        if (cancelled) return;
        vectorLayer = maplibreGL({ style: import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty', interactive: false, attributionControl: false, maxZoom: 19 }).addTo(map);
        vectorLayer.getMaplibreMap().on('error', showFallback);
        vectorLayer.getMaplibreMap().once('idle', markReady);
      }).catch(showFallback);
    }
    const observer = new ResizeObserver(() => { if (!cancelled) map.invalidateSize({ pan: false }); });
    observer.observe(containerRef.current);
    return () => { cancelled = true; observer.disconnect(); map.remove(); };
  }, [lat, lng]);

  return <div ref={containerRef} className="cafe-map-preview" aria-hidden="true" />;
}
