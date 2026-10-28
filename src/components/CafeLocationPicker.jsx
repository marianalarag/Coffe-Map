import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Selecting a point is explicit: opening the map never saves its center.
export default function CafeLocationPicker({ onSelect, coordinates }) {
  const containerRef = useRef(null);
  const initialCoordinatesRef = useRef(coordinates);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const initialCoordinates = initialCoordinatesRef.current;
    const map = L.map(containerRef.current, { center: initialCoordinates || [20.9753, -89.6178], zoom: initialCoordinates ? 17 : 14 });
    let cancelled = false;
    let marker;
    const icon = L.divIcon({
      className: 'cafe-preview-pin',
      html: '<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true"><path d="M16 40S2 25 2 16a14 14 0 0 1 28 0c0 9-14 24-14 24Z" fill="#7a5533" stroke="#fffaf0" stroke-width="3"/><circle cx="16" cy="16" r="5" fill="#fffaf0"/></svg>',
      iconSize: [32, 42], iconAnchor: [16, 42],
    });
    const select = (latlng) => {
      if (!marker) {
        marker = L.marker(latlng, { icon, draggable: true, title: 'Ubicación de la cafetería' }).addTo(map);
        marker.on('dragend', () => onSelectRef.current(marker.getLatLng()));
      } else marker.setLatLng(latlng);
      onSelectRef.current(latlng);
    };
    map.on('click', (event) => select(event.latlng));
    if (initialCoordinates) {
      marker = L.marker(initialCoordinates, { icon, draggable: true, title: 'Ubicación de la cafetería' }).addTo(map);
      marker.on('dragend', () => onSelectRef.current(marker.getLatLng()));
    }
    const tileUrl = import.meta.env.VITE_MAP_TILE_URL;
    if (tileUrl) {
      L.tileLayer(tileUrl, { attribution: import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    } else {
      import('@maplibre/maplibre-gl-leaflet').then(({ maplibreGL }) => {
        if (!cancelled) maplibreGL({ style: import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty', interactive: false, maxZoom: 19 }).addTo(map);
      }).catch(() => {
        if (!cancelled) L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
      });
    }
    return () => { cancelled = true; map.remove(); };
  }, []);

  return <div className="missing-cafe-map-picker">
    <p>Toca el lugar exacto de la cafetería. Puedes arrastrar el pin para ajustarlo.</p>
    <div ref={containerRef} aria-label="Seleccionar la ubicación de la cafetería en el mapa" />
  </div>;
}
