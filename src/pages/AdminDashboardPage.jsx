import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, BarChart3, Camera, ClipboardList, Clock, Coffee, Database, Download, ExternalLink, FileUp, GripVertical, Image, Instagram, MapPin, MapPinned, MousePointer2, Music2, Palette, Plus, RefreshCw, ScanSearch, Search, Shield, Trash2, Type, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { supabase } from '../supabase';
import { areDuplicateCafes, deduplicateCafes, repairCafeText } from '../utils/cafeDeduplication';
import { geocodeCafeLocation, isGoogleMapsLink, normalizeGoogleMapsLink } from '../utils/cafeLocation';
import { sendCafeSubmission } from '../utils/cafeSubmissions';
import { toCafeDbRow } from '../utils/cafeDatabase';

const MERIDA_BBOX = { south: 20.86, west: -89.75, north: 21.08, east: -89.52 };
const OVERPASS_URLS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://ethiopia.overpass.openplaceguide.org/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
const OVERTURE_CAFE_CATEGORIES = new Set(['cafe', 'coffee_shop', 'coffee', 'tea_house', 'bubble_tea_shop']);
const OPEN_IMAGE_CACHE = new Map();
const OPENVERSE_API_URL = 'https://api.openverse.org/v1/images/';
const OPENVERSE_LICENSES = new Set(['by', 'by-sa', 'cc0', 'pdm']);
const ADMIN_CAFE_PAGE_SIZE = 24;
const ADMIN_TAB_STORAGE_KEY = 'coffee-map:admin-tab';
const TABS = [
  { id: 'overview', label: 'Resumen', icon: <BarChart3 size={17} /> },
  { id: 'requests', label: 'Solicitudes', icon: <ClipboardList size={17} /> },
  { id: 'cafes', label: 'Cafeterías', icon: <Coffee size={17} /> },
  { id: 'photos', label: 'Fotos', icon: <Image size={17} /> },
  { id: 'posts', label: 'Posts', icon: <Camera size={17} /> },
  { id: 'users', label: 'Usuarios', icon: <Users size={17} /> },
];

const normalizeName = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const parseCafeMenuImages = (value) => {
  if (Array.isArray(value)) return value.filter((url) => typeof url === 'string');
  try {
    const parsed = JSON.parse(String(value || ''));
    return Array.isArray(parsed) ? parsed.filter((url) => typeof url === 'string') : [];
  } catch {
    return [];
  }
};

const getOpenverseLicenseLabel = (image) => {
  const license = String(image?.license || '').toUpperCase();
  if (license === 'PDM') return 'Dominio público';
  return [license, image?.license_version].filter(Boolean).join(' ');
};

const searchOpenverse = async (cafeName) => {
  const request = async (query) => {
    const params = new URLSearchParams({
      q: query,
      license: 'by,by-sa,cc0,pdm',
      page_size: '12',
      mature: 'false',
    });
    const response = await fetch(`${OPENVERSE_API_URL}?${params}`);
    if (!response.ok) throw new Error(`Openverse respondió con ${response.status}. Intenta de nuevo en unos minutos.`);
    const payload = await response.json();
    return (payload.results || []).filter((image) => (
      !image.mature
      && OPENVERSE_LICENSES.has(String(image.license || '').toLowerCase())
      && /^https?:\/\//i.test(image.url || '')
      && /^https?:\/\//i.test(image.foreign_landing_url || '')
    ));
  };

  const exactResults = await request(`"${cafeName}" Mérida Yucatán`);
  return exactResults.length > 0 ? exactResults : request(`${cafeName} Mérida Yucatán cafetería`);
};

const ADMIN_DAYS = [
  { key: 'mo', short: 'Mo', label: 'Lunes' },
  { key: 'tu', short: 'Tu', label: 'Martes' },
  { key: 'we', short: 'We', label: 'Miércoles' },
  { key: 'th', short: 'Th', label: 'Jueves' },
  { key: 'fr', short: 'Fr', label: 'Viernes' },
  { key: 'sa', short: 'Sa', label: 'Sábado' },
  { key: 'su', short: 'Su', label: 'Domingo' },
];

const ADMIN_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 ? '30' : '00';
  return `${String(hours).padStart(2, '0')}:${minutes}`;
});

const createEmptyAdminSchedule = () => ADMIN_DAYS.reduce((schedule, day) => ({
  ...schedule,
  [day.key]: { open: false, from: '08:00', to: '18:00', split: false, from2: '16:00', to2: '20:00' },
}), {});

const parseAdminTime = (value, suffix = '') => {
  const match = String(value || '').trim().match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = `${suffix} ${value}`.toLowerCase();
  if (/p\.?\s*m\.?/.test(meridiem) && hours < 12) hours += 12;
  if (/a\.?\s*m\.?/.test(meridiem) && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const getAdminDayKeys = (value) => {
  const normalized = String(value || '').toLowerCase().replace(/[.:]/g, '').replace(/\s+/g, '');
  if (normalized === 'weekdays' || normalized === 'lunesaviernes') return ADMIN_DAYS.slice(0, 5).map((day) => day.key);
  if (normalized === 'weekend' || normalized === 'findesemana') return ADMIN_DAYS.slice(5).map((day) => day.key);
  const range = normalized.split('-');
  if (range.length === 2) {
    const start = ADMIN_DAYS.findIndex((day) => day.short.toLowerCase() === range[0] || day.key === range[0]);
    const end = ADMIN_DAYS.findIndex((day) => day.short.toLowerCase() === range[1] || day.key === range[1]);
    if (start >= 0 && end >= start) return ADMIN_DAYS.slice(start, end + 1).map((day) => day.key);
  }
  return ADMIN_DAYS.filter((day) => (
    normalized.includes(day.short.toLowerCase())
    || normalized.includes(day.key)
    || normalized.includes(day.label.toLowerCase().replace('é', 'e'))
  )).map((day) => day.key);
};

const parseAdminHours = (value) => {
  const schedule = createEmptyAdminSchedule();
  const text = String(value || '').trim();
  if (!text) return schedule;

  text.split(/[;\n]+/).forEach((part) => {
    const cleanPart = part.trim();
    if (!cleanPart) return;
    const rangeMatch = cleanPart.match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?)/i);
    const dayText = rangeMatch ? cleanPart.slice(0, rangeMatch.index).replace(/[:|]/g, '').trim() : cleanPart.replace(/\b(?:off|closed|cerrad[oa]s?)\b/gi, '').trim();
    const dayKeys = getAdminDayKeys(dayText);
    if (dayKeys.length === 0) return;
    if (/24\s*\/\s*7/i.test(cleanPart)) {
      dayKeys.forEach((key) => { schedule[key] = { open: true, from: '00:00', to: '23:59' }; });
      return;
    }
    if (!rangeMatch) {
      dayKeys.forEach((key) => { schedule[key] = { ...schedule[key], open: false }; });
      return;
    }
    const from = parseAdminTime(rangeMatch[1], rangeMatch[2]);
    const to = parseAdminTime(rangeMatch[2]);
    if (!from || !to) return;
    dayKeys.forEach((key) => { schedule[key] = { open: true, from, to }; });
  });
  return schedule;
};

const parseAdminHoursWithSplits = (value) => {
  const text = String(value || '').trim();
  if (!text.includes(',')) return parseAdminHours(value);
  const schedule = createEmptyAdminSchedule();
  if (!text) return schedule;

  text.split(/[;\n]+/).forEach((part) => {
    const cleanPart = part.trim();
    if (!cleanPart) return;
    const rangePattern = /(\d{1,2}(?::\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?)\s*[-\u2013]\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?)/gi;
    const rangeMatches = [...cleanPart.matchAll(rangePattern)];
    const dayText = rangeMatches.length > 0
      ? cleanPart.slice(0, rangeMatches[0].index).replace(/[:|]/g, '').trim()
      : cleanPart.replace(/\b(?:off|closed|cerrad[oa]s?)\b/gi, '').trim();
    const dayKeys = getAdminDayKeys(dayText);
    if (dayKeys.length === 0) return;
    if (/24\s*\/\s*7/i.test(cleanPart)) {
      dayKeys.forEach((key) => { schedule[key] = { ...schedule[key], open: true, from: '00:00', to: '23:59', split: false }; });
      return;
    }
    if (rangeMatches.length === 0) {
      dayKeys.forEach((key) => { schedule[key] = { ...schedule[key], open: false, split: false }; });
      return;
    }
    const ranges = rangeMatches.slice(0, 2).map((match) => ({
      from: parseAdminTime(match[1], match[2]),
      to: parseAdminTime(match[2]),
    })).filter((range) => range.from && range.to);
    if (ranges.length === 0) return;
    dayKeys.forEach((key) => {
      schedule[key] = {
        ...schedule[key],
        open: true,
        from: ranges[0].from,
        to: ranges[0].to,
        split: Boolean(ranges[1]),
        from2: ranges[1]?.from || schedule[key].from2,
        to2: ranges[1]?.to || schedule[key].to2,
      };
    });
  });
  return schedule;
};

const serializeAdminHours = (schedule) => ADMIN_DAYS
  .filter((day) => schedule?.[day.key]?.open)
  .map((day) => {
    const value = schedule[day.key];
    const ranges = [`${value.from}-${value.to}`];
    if (value.split && value.from2 && value.to2) ranges.push(`${value.from2}-${value.to2}`);
    return `${day.short} ${ranges.join(',')}`;
  })
  .join('; ') || null;

function AdminTimeSelect({ value, onChange, ariaLabel }) {
  return (
    <select className="admin-hours-time-select" value={value} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel}>
      {ADMIN_TIME_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

const isInsideMerida = ({ lat, lng }) => (
  lat >= MERIDA_BBOX.south && lat <= MERIDA_BBOX.north
  && lng >= MERIDA_BBOX.west && lng <= MERIDA_BBOX.east
);

const buildGrid = ({ rows, cols }) => {
  const latStep = (MERIDA_BBOX.north - MERIDA_BBOX.south) / rows;
  const lngStep = (MERIDA_BBOX.east - MERIDA_BBOX.west) / cols;
  return Array.from({ length: rows * cols }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      south: MERIDA_BBOX.south + latStep * row,
      west: MERIDA_BBOX.west + lngStep * col,
      north: row === rows - 1 ? MERIDA_BBOX.north : MERIDA_BBOX.south + latStep * (row + 1),
      east: col === cols - 1 ? MERIDA_BBOX.east : MERIDA_BBOX.west + lngStep * (col + 1),
    };
  });
};

const buildOverpassQuery = (box) => {
  const bbox = `${box.south},${box.west},${box.north},${box.east}`;
  return `[out:json][timeout:25];(
    nwr["amenity"="cafe"](${bbox});
    nwr["shop"="coffee"](${bbox});
    nwr["craft"="coffee_roaster"](${bbox});
    nwr["cuisine"~"^(coffee_shop|coffee)$",i](${bbox});
    nwr["amenity"~"^(restaurant|fast_food)$"]["name"~"(cafe|cafeteria|coffee)",i](${bbox});
    nwr["shop"="bakery"](${bbox});
  );out center tags qt;`;
};

const getOsmConfidence = (tags = {}) => (
  tags.amenity === 'cafe'
  || tags.shop === 'coffee'
  || tags.craft === 'coffee_roaster'
  || /^(coffee_shop|coffee)$/i.test(tags.cuisine || '')
    ? 'active'
    : 'needs_review'
);

const getOsmAddress = (tags = {}) => {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  return [street, tags['addr:suburb'] || tags['addr:neighbourhood'], tags['addr:city']].filter(Boolean).join(', ') || null;
};

const getOsmNeighborhood = (tags = {}) => tags['addr:suburb'] || tags['addr:neighbourhood'] || null;

const htmlToText = (value) => {
  const container = document.createElement('div');
  container.innerHTML = String(value || '');
  return container.textContent?.replace(/\s+/g, ' ').trim() || '';
};

const isReusableCommonsLicense = (license) => /^(CC0|CC BY(?:-SA)?|Public domain|PD)/i.test(license || '');

const getWikidataImageTitle = async (wikidataId) => {
  if (!/^Q\d+$/.test(wikidataId || '')) return null;
  const response = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${encodeURIComponent(wikidataId)}&property=P18&format=json&origin=*`);
  if (!response.ok) return null;
  const payload = await response.json();
  const filename = payload.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return filename ? `File:${filename}` : null;
};

const getCommonsImage = async (tags = {}) => {
  const directReference = String(tags.wikimedia_commons || tags.image || '');
  let title = /^File:/i.test(directReference) ? directReference : null;
  if (!title && tags.wikidata) title = await getWikidataImageTitle(tags.wikidata);
  if (!title) return null;
  if (OPEN_IMAGE_CACHE.has(title)) return OPEN_IMAGE_CACHE.get(title);

  const request = (async () => {
    const params = new URLSearchParams({
      action: 'query', format: 'json', origin: '*', prop: 'imageinfo', titles: title,
      iiprop: 'url|extmetadata', iiurlwidth: '1200', iiextmetadatalanguage: 'es',
    });
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
    if (!response.ok) return null;
    const payload = await response.json();
    const page = Object.values(payload.query?.pages || {})[0];
    const info = page?.imageinfo?.[0];
    const metadata = info?.extmetadata || {};
    const license = htmlToText(metadata.LicenseShortName?.value);
    if (!info || !isReusableCommonsLicense(license)) return null;
    return {
      image_url: info.thumburl || info.url,
      image_source_url: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
      image_attribution: htmlToText(metadata.Artist?.value || metadata.Credit?.value || 'Wikimedia Commons'),
      image_license: license,
    };
  })().catch(() => null);

  OPEN_IMAGE_CACHE.set(title, request);
  return request;
};

const scanOpenStreetMapBox = async (box) => {
  let lastError;
  for (const endpoint of OVERPASS_URLS) {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 35000);
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: buildOverpassQuery(box) }),
      });
      window.clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
      const payload = await response.json();
      const cafes = (payload.elements || []).map((element) => {
        const lat = Number(element.lat ?? element.center?.lat);
        const lng = Number(element.lon ?? element.center?.lon);
        const name = element.tags?.name || element.tags?.brand;
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const sourceId = `${element.type}/${element.id}`;
        const sourceUrl = `https://www.openstreetmap.org/${sourceId}`;
        return {
          id: `osm:${element.type}:${element.id}`,
          nombre: name,
          lat,
          lng,
          rating: null,
          reviews: 0,
          link: sourceUrl,
          image_url: null,
          address: getOsmAddress(element.tags),
          neighborhood: getOsmNeighborhood(element.tags),
          opening_hours: element.tags?.opening_hours || null,
          opening_hours_source: element.tags?.opening_hours ? 'osm' : null,
          opening_hours_source_url: element.tags?.opening_hours ? `https://www.openstreetmap.org/${element.type}/${element.id}` : null,
          opening_hours_verified_at: element.tags?.opening_hours ? new Date().toISOString() : null,
          category: element.tags?.shop === 'bakery' ? 'panaderia' : 'cafeteria',
          source: 'osm',
          source_id: sourceId,
          source_url: sourceUrl,
          status: getOsmConfidence(element.tags),
          last_verified_at: new Date().toISOString(),
          openImageTags: element.tags || {},
        };
      }).filter(Boolean);
      return Promise.all(cafes.map(async ({ openImageTags, ...cafe }) => ({
        ...cafe,
        ...(await getCommonsImage(openImageTags)),
      })));
    } catch (error) {
      lastError = error.name === 'AbortError' ? new Error('OpenStreetMap tardó demasiado en responder.') : error;
    }
  }
  throw lastError || new Error('No se pudo consultar OpenStreetMap.');
};

const scanOpenStreetMap = async (onProgress) => {
  const boxes = buildGrid({ rows: 4, cols: 4 });
  const cafesById = new Map();
  let failed = 0;
  for (const [index, box] of boxes.entries()) {
    onProgress?.({ current: index + 1, total: boxes.length, found: cafesById.size, failed });
    try {
      const results = await scanOpenStreetMapBox(box);
      results.forEach((cafe) => cafesById.set(cafe.id, cafe));
    } catch {
      failed += 1;
    }
  }
  if (cafesById.size === 0) throw new Error('OpenStreetMap no respondió en ninguna zona. Intenta nuevamente más tarde.');
  return { cafes: [...cafesById.values()], failed, total: boxes.length };
};

const fetchAllCafes = async () => {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('cafes')
      .select('id,nombre,lat,lng,source,source_id,opening_hours,opening_hours_source,opening_hours_source_url,opening_hours_verified_at')
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows.map((cafe) => ({ ...cafe, lat: Number(cafe.lat), lng: Number(cafe.lng) }));
};

const filterDuplicates = (incoming, existing) => {
  const accepted = [];
  const skipped = [];
  const comparison = [...existing];
  incoming.forEach((candidate) => {
    const duplicate = comparison.some((current) => areDuplicateCafes(current, candidate));
    if (duplicate) skipped.push(candidate);
    else {
      accepted.push(candidate);
      comparison.push(candidate);
    }
  });
  return { accepted, skipped };
};

const upsertDiscoveredCafes = async (incoming) => {
  const existing = await fetchAllCafes();
  const existingIds = new Set(existing.map((cafe) => cafe.id));
  const existingById = new Map(existing.map((cafe) => [cafe.id, cafe]));
  const { accepted: discovered, skipped } = filterDuplicates(incoming, existing);
  const accepted = discovered.map((cafe) => {
    const current = existingById.get(cafe.id);
    return current?.opening_hours && current.opening_hours_source !== 'osm'
      ? {
          ...cafe,
          opening_hours: current.opening_hours,
          opening_hours_source: current.opening_hours_source,
          opening_hours_source_url: current.opening_hours_source_url,
          opening_hours_verified_at: current.opening_hours_verified_at,
        }
      : cafe;
  });
  for (let index = 0; index < accepted.length; index += 250) {
    const { error } = await supabase.from('cafes').upsert(accepted.slice(index, index + 250).map(toCafeDbRow), { onConflict: 'id' });
    if (error) throw error;
  }
  Object.keys(window.sessionStorage)
    .filter((key) => key.startsWith('coffee-map:cafes:'))
    .forEach((key) => window.sessionStorage.removeItem(key));
  return {
    accepted,
    skipped,
    created: accepted.filter((cafe) => !existingIds.has(cafe.id)).length,
    refreshed: accepted.filter((cafe) => existingIds.has(cafe.id)).length,
  };
};

const getOvertureCategories = (properties = {}) => [
  properties.categories?.primary,
  ...(Array.isArray(properties.categories?.alternate) ? properties.categories.alternate : []),
  properties.category,
].filter(Boolean).map((value) => String(value).toLowerCase());

const parseOvertureGeoJson = (payload) => (payload.features || []).map((feature) => {
  const properties = feature.properties || {};
  const coordinates = feature.geometry?.coordinates;
  const lng = Number(coordinates?.[0]);
  const lat = Number(coordinates?.[1]);
  const nombre = properties.names?.primary || properties.names?.common?.[0]?.value || properties.name;
  const sourceId = properties.id || feature.id;
  const categories = getOvertureCategories(properties);
  const isBakery = categories.some((category) => category.includes('bakery') || category.includes('pastry') || category.includes('baker'));
  const isCafe = isBakery || categories.some((category) => OVERTURE_CAFE_CATEGORIES.has(category) || category.includes('coffee') || category.includes('cafe'));
  if (!sourceId || !nombre || !isCafe || !Number.isFinite(lat) || !Number.isFinite(lng) || !isInsideMerida({ lat, lng })) return null;
  const sourceUrl = `https://explore.overturemaps.org/place/${sourceId}`;
  return {
    id: `overture:${sourceId}`, nombre, lat, lng, rating: null, reviews: 0, link: sourceUrl,
    image_url: null, address: properties.addresses?.[0]?.freeform || null, neighborhood: properties.addresses?.[0]?.locality || null, category: isBakery ? 'panaderia' : 'cafeteria', source: 'overture',
    source_id: sourceId, source_url: sourceUrl, status: 'needs_review', last_verified_at: new Date().toISOString(),
  };
}).filter(Boolean);

function MetricCard({ label, value, icon }) {
  return (
    <article className="admin-metric-card">
      <span>{icon}</span>
      <strong>{value ?? '—'}</strong>
      <small>{label}</small>
    </article>
  );
}

const BUILDER_OPTIONS = [
  { type: 'heading', label: 'Título', icon: <Type size={15} />, description: 'Encabezado para el panel' },
  { type: 'text', label: 'Texto', icon: <FileUp size={15} />, description: 'Párrafo o descripción' },
  { type: 'image', label: 'Imagen', icon: <Image size={15} />, description: 'Imagen desde una URL' },
  { type: 'button', label: 'Botón', icon: <MousePointer2 size={15} />, description: 'Enlace con llamada a la acción' },
  { type: 'field', label: 'Campo', icon: <Database size={15} />, description: 'Etiqueta y valor' },
  { type: 'chart', label: 'Gráfica', icon: <BarChart3 size={15} />, description: 'Indicadores del panel' },
];

function AdminCustomBlock({ block, metrics, selected, onSelect, onRemove, onDragStart, onDragOver, onDrop }) {
  const option = BUILDER_OPTIONS.find((item) => item.type === block.type) || BUILDER_OPTIONS[0];
  const previewStyle = {
    color: block.color || '#eee5d2',
    backgroundColor: block.background || '#27211b',
    textAlign: block.alignment || 'left',
    padding: `${Math.max(8, Number(block.padding) || 16)}px`,
    borderRadius: `${Math.max(0, Number(block.radius) || 14)}px`,
    fontSize: `${Math.max(10, Number(block.fontSize) || 16)}px`,
  };
  return (
    <article className={`admin-custom-block ${selected ? 'is-selected' : ''}`} draggable onClick={onSelect} onDragStart={onDragStart} onDragOver={(event) => { event.preventDefault(); onDragOver?.(); }} onDrop={onDrop}>
      <header>
        <span className="admin-block-handle" title="Arrastrar bloque"><GripVertical size={15} /></span>
        <span className="admin-custom-block-kind">{option.icon}{option.label}</span>
        <button type="button" className="admin-custom-block-remove" onClick={(event) => { event.stopPropagation(); onRemove(); }} aria-label="Eliminar bloque" title="Eliminar bloque"><X size={14} /></button>
      </header>
      <div className={`admin-custom-block-preview is-${block.type}`} style={previewStyle}>
        {block.type === 'heading' && <h2>{block.content || 'Título del bloque'}</h2>}
        {block.type === 'text' && <p>{block.content || 'Escribe aquí una descripción para tu panel.'}</p>}
        {block.type === 'field' && <div className="admin-custom-field-preview"><small>{block.label || 'Etiqueta'}</small><strong>{block.value || 'Valor'}</strong></div>}
        {block.type === 'button' && <button type="button" className="admin-custom-preview-button">{block.label || 'Ver más'}</button>}
        {block.type === 'chart' && <div className="admin-custom-chart">{[['Cafeterías', metrics.cafes], ['Usuarios', metrics.users], ['Posts', metrics.posts], ['Fotos', metrics.photos]].map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${Math.min(100, Number(value || 0) * 5)}%` }} /></i><strong>{value ?? 0}</strong></div>)}</div>}
        {block.type === 'image' && (block.url ? <img className="admin-custom-preview-image" src={block.url} alt={block.alt || ''} /> : <div className="admin-custom-image-placeholder"><Image size={24} /><span>Agrega una URL de imagen en Propiedades</span></div>)}
      </div>
    </article>
  );
}

function AdminSectionBuilder({ section, blocks, metrics, menuOpen, onToggleMenu, onAdd, onChange, onRemove, onDragStart, onDragOver, onDrop }) {
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) || blocks[0] || null;
  const updateSelected = (patch) => selectedBlock && onChange(selectedBlock.id, patch);
  const handleAdd = (type) => {
    const id = onAdd(type);
    if (id) setSelectedBlockId(id);
  };
  const removeSelected = () => {
    if (!selectedBlock) return;
    const index = blocks.findIndex((block) => block.id === selectedBlock.id);
    onRemove(selectedBlock.id);
    setSelectedBlockId(blocks[index - 1]?.id || blocks[index + 1]?.id || null);
  };
  const updateType = (type) => {
    if (!selectedBlock) return;
    const defaults = type === 'heading' ? { content: 'Título del bloque' }
      : type === 'text' ? { content: '' }
        : type === 'image' ? { url: '', alt: '' }
          : type === 'button' ? { label: 'Ver más', url: '' }
            : type === 'field' ? { label: 'Etiqueta', value: 'Valor' } : {};
    onChange(selectedBlock.id, { ...defaults, type });
  };
  return (
    <section className="admin-builder-section">
      <div className="admin-builder-toolbar">
        <div><Palette size={17} /><strong>Editor visual de {TABS.find((item) => item.id === section)?.label || 'esta sección'}</strong><small>Agrega componentes y edita contenido, imagen y estilo en el panel lateral.</small></div>
        <button type="button" onClick={onToggleMenu}><Plus size={14} /> Añadir bloque</button>
      </div>
      {menuOpen && <div className="admin-block-menu"><strong>Elige un componente para agregarlo al panel</strong>{BUILDER_OPTIONS.map((option) => <button type="button" key={option.type} onClick={() => handleAdd(option.type)}>{option.icon}<span><b>{option.label}</b><small>{option.description}</small></span></button>)}</div>}
      <div className="admin-builder-workspace">
        <div className="admin-builder-canvas">
          <div className="admin-builder-canvas-heading"><span>Vista previa</span><small>Selecciona un bloque para editarlo</small></div>
          {blocks.length ? <div className="admin-custom-blocks">{blocks.map((block) => <AdminCustomBlock key={block.id} block={block} metrics={metrics} selected={selectedBlock?.id === block.id} onSelect={() => setSelectedBlockId(block.id)} onRemove={() => onRemove(block.id)} onDragStart={() => onDragStart(block.id)} onDragOver={() => onDragOver(block.id)} onDrop={() => onDrop(block.id)} />)}</div> : <div className="admin-builder-empty"><Plus size={20} /><span>Añade un componente para empezar a diseñar esta sección.</span><button type="button" onClick={onToggleMenu}>Agregar componente</button></div>}
        </div>
        <aside className="admin-builder-inspector">
          <header><div><Palette size={16} /><strong>Propiedades</strong></div>{selectedBlock && <button type="button" onClick={removeSelected} title="Eliminar bloque seleccionado" aria-label="Eliminar bloque seleccionado"><Trash2 size={15} /></button>}</header>
          {selectedBlock ? <div className="admin-builder-properties">
            <label>Tipo de componente<select value={selectedBlock.type} onChange={(event) => updateType(event.target.value)}>{BUILDER_OPTIONS.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}</select></label>
            {(selectedBlock.type === 'heading' || selectedBlock.type === 'text') && <label>{selectedBlock.type === 'heading' ? 'Título' : 'Texto'}{selectedBlock.type === 'heading' ? <input value={selectedBlock.content || ''} onChange={(event) => updateSelected({ content: event.target.value })} placeholder="Título del bloque" /> : <textarea value={selectedBlock.content || ''} onChange={(event) => updateSelected({ content: event.target.value })} placeholder="Escribe el contenido del bloque" />}</label>}
            {selectedBlock.type === 'field' && <><label>Etiqueta<input value={selectedBlock.label || ''} onChange={(event) => updateSelected({ label: event.target.value })} placeholder="Etiqueta" /></label><label>Valor<input value={selectedBlock.value || ''} onChange={(event) => updateSelected({ value: event.target.value })} placeholder="Valor" /></label></>}
            {selectedBlock.type === 'button' && <><label>Texto del botón<input value={selectedBlock.label || ''} onChange={(event) => updateSelected({ label: event.target.value })} placeholder="Ver más" /></label><label>Enlace<input value={selectedBlock.url || ''} onChange={(event) => updateSelected({ url: event.target.value })} placeholder="https://..." /></label></>}
            {selectedBlock.type === 'image' && <><label>URL de imagen<input value={selectedBlock.url || ''} onChange={(event) => updateSelected({ url: event.target.value })} placeholder="https://..." /></label><label>Texto alternativo<input value={selectedBlock.alt || ''} onChange={(event) => updateSelected({ alt: event.target.value })} placeholder="Describe la imagen" /></label></>}
            <div className="admin-builder-property-row"><label>Color del texto<input type="color" value={selectedBlock.color || '#eee5d2'} onChange={(event) => updateSelected({ color: event.target.value })} /></label><label>Fondo<input type="color" value={selectedBlock.background || '#27211b'} onChange={(event) => updateSelected({ background: event.target.value })} /></label></div>
            <label>Alineación<div className="admin-builder-alignment"><button type="button" className={(selectedBlock.alignment || 'left') === 'left' ? 'is-active' : ''} onClick={() => updateSelected({ alignment: 'left' })} aria-label="Alinear a la izquierda"><AlignLeft size={16} /></button><button type="button" className={selectedBlock.alignment === 'center' ? 'is-active' : ''} onClick={() => updateSelected({ alignment: 'center' })} aria-label="Centrar"><AlignCenter size={16} /></button><button type="button" className={selectedBlock.alignment === 'right' ? 'is-active' : ''} onClick={() => updateSelected({ alignment: 'right' })} aria-label="Alinear a la derecha"><AlignRight size={16} /></button></div></label>
            <label>Tamaño de texto<input type="range" min="10" max="40" value={selectedBlock.fontSize || 16} onChange={(event) => updateSelected({ fontSize: Number(event.target.value) })} /><small>{selectedBlock.fontSize || 16} px</small></label>
            <label>Espaciado<input type="range" min="8" max="40" value={selectedBlock.padding || 16} onChange={(event) => updateSelected({ padding: Number(event.target.value) })} /></label>
          </div> : <p className="admin-builder-inspector-empty">Selecciona un bloque o agrega uno nuevo para editar su tipo, contenido, imagen y estilo.</p>}
        </aside>
      </div>
    </section>
  );
}
function AdminCafeCard({ cafe, tiktoks = [], saving = false, menuSaving = false, onSave: persistCafe, onStatusChange, onUpload, onDeleteCover, onMenuUpload, onDeleteMenuImage, onFindImage, onAddTikTok, onDeleteTikTok, onDelete }) {
  const [draft, setDraft] = useState(() => ({
    nombre: cafe.nombre || '',
    address: cafe.address || '',
    link: cafe.link || '',
    neighborhood: cafe.neighborhood || '',
    category: cafe.category || 'cafeteria',
    image_url: cafe.image_url || '',
    instagram_url: cafe.instagram_url || '',
  }));
  const menuImages = parseCafeMenuImages(cafe.menu_url);
  const [dirtyFields, setDirtyFields] = useState(() => new Set());
  const [schedule, setSchedule] = useState(() => parseAdminHoursWithSplits(cafe.opening_hours));
  const [bulkHours, setBulkHours] = useState({ from: '08:00', to: '18:00' });
  const [locationDirty, setLocationDirty] = useState(false);
  const [locationField, setLocationField] = useState(null);

  const fieldValue = (field) => (dirtyFields.has(field) ? draft[field] : (cafe[field] || ''));
  const onSave = (_cafe, options) => {
    const editedFields = Object.fromEntries([...dirtyFields].map((field) => [field, draft[field]]));
    persistCafe({ ...cafe, ...editedFields }, options);
  };

  const changeField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirtyFields((current) => new Set(current).add(field));
    if (field === 'address' || field === 'link') {
      setLocationDirty(true);
      setLocationField(field);
    }
  };

  const textField = (field, placeholder, multiline = false) => {
    const Component = multiline ? 'textarea' : 'input';
    return <Component value={fieldValue(field)} placeholder={placeholder} onChange={(event) => changeField(field, event.target.value)} />;
  };

  const updateDay = (key, patch) => setSchedule((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  const applySchedulePreset = (dayKeys) => {
    const selectedDays = new Set(dayKeys);
    setSchedule((current) => Object.fromEntries(ADMIN_DAYS.map((day) => [
      day.key,
      selectedDays.has(day.key)
        ? { ...current[day.key], open: true, from: bulkHours.from, to: bulkHours.to }
        : { ...current[day.key], open: false },
    ])));
  };
  const applyBulkHours = () => setSchedule((current) => Object.fromEntries(ADMIN_DAYS.map((day) => [
    day.key,
    current[day.key].open ? { ...current[day.key], from: bulkHours.from, to: bulkHours.to } : current[day.key],
  ])));

  return (
    <article className="admin-cafe-card">
      <div className="admin-cafe-card-media">
        {cafe.image_url ? <>
          <img className="admin-cafe-card-media-backdrop" src={cafe.image_url} alt="" aria-hidden="true" />
          <div className="admin-cafe-card-media-foreground"><img src={cafe.image_url} alt={cafe.nombre} /></div>
        </> : <Coffee size={34} />}
        <span className="admin-cafe-status">{cafe.status === 'active' ? 'Activa' : cafe.status === 'closed' ? 'Cerrada' : 'Revisar'}</span>
        <label title="Subir foto de portada"><Camera size={16} /><input hidden type="file" accept="image/*" onChange={(event) => { onUpload(cafe, event.target.files?.[0]); event.target.value = ''; }} /></label>
        {cafe.image_url && <button type="button" className="admin-cafe-cover-remove" title="Eliminar portada" aria-label={`Eliminar portada de ${cafe.nombre}`} onClick={() => onDeleteCover(cafe)}><Trash2 size={15} /></button>}
      </div>
      <div className="admin-cafe-card-body">
        {textField('nombre', 'Nombre de la cafetería')}
        {textField('address', 'Dirección completa', true)}
        {textField('link', 'Enlace de Google Maps')}
        <small className="admin-location-note"><MapPin size={12} /> Usa un enlace de Google Maps. Al guardar, el mapa toma esa ubicación y calcula las coordenadas automáticamente.</small>
        <div className="admin-cafe-card-row">
          <input value={fieldValue('neighborhood')} placeholder="Zona" onChange={(event) => changeField('neighborhood', event.target.value)} />
          <select value={fieldValue('category') || 'cafeteria'} onChange={(event) => changeField('category', event.target.value)}><option value="cafeteria">Cafetería</option><option value="panaderia">Panadería</option></select>
        </div>
        <fieldset className="admin-hours-editor">
          <legend><Clock size={14} /> Horarios semanales</legend>
          <small>Marca los días abiertos y elige la hora de apertura y cierre.</small>
          <div className="admin-hours-tools">
            <div className="admin-hours-presets">
              <span>Atajos</span>
              <button type="button" onClick={() => applySchedulePreset(ADMIN_DAYS.slice(0, 5).map((day) => day.key))}>Lun–Vie</button>
              <button type="button" onClick={() => applySchedulePreset(ADMIN_DAYS.slice(0, 6).map((day) => day.key))}>Lun–Sáb</button>
              <button type="button" onClick={() => applySchedulePreset(ADMIN_DAYS.map((day) => day.key))}>Todos</button>
              <button type="button" onClick={() => applySchedulePreset([])}>Cerrar todo</button>
            </div>
            <div className="admin-hours-bulk">
              <span>Aplicar horas a días abiertos</span>
              <AdminTimeSelect value={bulkHours.from} onChange={(value) => setBulkHours((current) => ({ ...current, from: value }))} ariaLabel="Hora de apertura para días abiertos" />
              <span>a</span>
              <AdminTimeSelect value={bulkHours.to} onChange={(value) => setBulkHours((current) => ({ ...current, to: value }))} ariaLabel="Hora de cierre para días abiertos" />
              <button type="button" onClick={applyBulkHours}>Aplicar</button>
            </div>
          </div>
          {ADMIN_DAYS.map((day) => {
            const value = schedule[day.key];
            return <div className="admin-hours-row" key={day.key}>
              <label className="admin-hours-day"><input type="checkbox" checked={value.open} onChange={(event) => updateDay(day.key, { open: event.target.checked })} /><strong>{day.label}</strong></label>
              {value.open ? (
                <div className="admin-hours-ranges">
                  <div className="admin-hours-range">
                    <AdminTimeSelect value={value.from} onChange={(nextValue) => updateDay(day.key, { from: nextValue })} ariaLabel={`Hora de apertura ${day.label}`} />
                    <span>a</span>
                    <AdminTimeSelect value={value.to} onChange={(nextValue) => updateDay(day.key, { to: nextValue })} ariaLabel={`Hora de cierre ${day.label}`} />
                  </div>
                  {value.split && <div className="admin-hours-range">
                    <AdminTimeSelect value={value.from2 || '16:00'} onChange={(nextValue) => updateDay(day.key, { from2: nextValue })} ariaLabel={`Segunda hora de apertura ${day.label}`} />
                    <span>a</span>
                    <AdminTimeSelect value={value.to2 || '20:00'} onChange={(nextValue) => updateDay(day.key, { to2: nextValue })} ariaLabel={`Segunda hora de cierre ${day.label}`} />
                    <button type="button" className="admin-hours-remove-split" onClick={() => updateDay(day.key, { split: false })} aria-label={`Quitar segundo horario de ${day.label}`} title="Quitar segundo horario">×</button>
                  </div>}
                  {!value.split && <button type="button" className="admin-hours-add-split" onClick={() => updateDay(day.key, { split: true, from2: '16:00', to2: '20:00' })}>+ Segundo horario</button>}
                </div>
              ) : <em>Cerrada</em>}
            </div>;
          })}
        </fieldset>
        {textField('image_url', 'URL de foto de portada')}
        <div className="admin-cafe-card-socials">
          <label><Instagram size={14} /><input value={fieldValue('instagram_url')} placeholder="Instagram" onChange={(event) => changeField('instagram_url', event.target.value)} /></label>
        </div>
        <div className="admin-cafe-menu-images">
          <div className="admin-cafe-menu-images-heading"><span><Coffee size={14} /> Imágenes del menú</span><small>{menuImages.length}</small></div>
          {menuImages.length > 0 ? <div className="admin-cafe-menu-images-grid">{menuImages.map((url, index) => <div key={`${url}-${index}`}><img src={url} alt={`Menú ${index + 1} de ${cafe.nombre}`} loading="lazy" /><button type="button" onClick={() => onDeleteMenuImage(cafe, url)} disabled={menuSaving} aria-label={`Eliminar imagen ${index + 1} del menú`} title="Eliminar imagen"><Trash2 size={12} /></button></div>)}</div> : <p>Aún no hay imágenes adjuntas.</p>}
          <label className="admin-cafe-menu-upload"><FileUp size={13} /> {menuSaving ? 'Subiendo imágenes…' : 'Adjuntar imágenes'}<input hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple disabled={menuSaving} onChange={(event) => { onMenuUpload(cafe, [...(event.target.files || [])]); event.target.value = ''; }} /></label>
          <small className="admin-cafe-menu-note">Hasta 8 MB por imagen. Puedes adjuntar varias páginas.</small>
        </div>
        <div className="admin-cafe-tiktoks">
          <div className="admin-cafe-tiktoks-heading"><span><Music2 size={14} /> TikToks relacionados</span><small>{tiktoks.length}</small></div>
          {tiktoks.map((tiktok) => <div className="admin-cafe-tiktok-row" key={tiktok.id}><a href={tiktok.url} target="_blank" rel="noreferrer" title={tiktok.title || tiktok.url}>{tiktok.title || tiktok.url}</a><button type="button" onClick={() => onDeleteTikTok(tiktok)} aria-label="Eliminar TikTok" title="Eliminar TikTok"><Trash2 size={13} /></button></div>)}
          <button type="button" className="admin-add-tiktok" onClick={() => onAddTikTok(cafe)}><Plus size={13} /> Añadir TikTok</button>
        </div>
        <div className="admin-cafe-card-row">
          <select value={cafe.status} onChange={(event) => onStatusChange(cafe, event.target.value)}><option value="active">Activa</option><option value="needs_review">Revisar</option><option value="closed">Cerrada</option></select>
          <small className="admin-row-copy"><span>{cafe.source || 'manual'} · {cafe.neighborhood || 'Zona por confirmar'}</span></small>
        </div>
        <div className="admin-cafe-card-actions">
          <button type="button" className="admin-cafe-save" title="Guardar cambios" onClick={() => { onSave(cafe, { locationDirty, locationField, opening_hours: serializeAdminHours(schedule) }); setLocationDirty(false); }} disabled={saving}><Database size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}</button>
          <button type="button" title="Buscar foto con licencia abierta" onClick={() => onFindImage(cafe)}><Search size={14} /> Foto</button>
          {cafe.link && <a href={cafe.link} target="_blank" rel="noreferrer" title="Abrir ubicación"><MapPin size={14} /> Maps</a>}
          <button type="button" className="is-danger" title="Eliminar cafetería" onClick={() => onDelete(cafe)}><Trash2 size={14} /> Eliminar</button>
        </div>
      </div>
    </article>
  );
}

function AdminCoverCropper({ file, onCancel, onConfirm }) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [zoom, setZoom] = useState(1);
  const [imageSize, setImageSize] = useState(null);
  const [cropRect, setCropRect] = useState(null);
  const cropInteractionRef = useRef(null);
  const viewportRef = useRef(null);

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  const imageRect = imageSize ? {
    width: imageSize.baseWidth * zoom,
    height: imageSize.baseHeight * zoom,
    left: (imageSize.viewportWidth - imageSize.baseWidth * zoom) / 2,
    top: (imageSize.viewportHeight - imageSize.baseHeight * zoom) / 2,
  } : null;

  const getCropBounds = () => {
    const viewport = viewportRef.current;
    if (!viewport || !imageRect) return null;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    return {
      left: Math.max(0, imageRect.left),
      top: Math.max(0, imageRect.top),
      right: Math.min(width, imageRect.left + imageRect.width),
      bottom: Math.min(height, imageRect.top + imageRect.height),
    };
  };

  const handleImageLoad = (event) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { naturalWidth, naturalHeight } = event.currentTarget;
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const scale = Math.min(viewportWidth / naturalWidth, viewportHeight / naturalHeight);
    const baseWidth = naturalWidth * scale;
    const baseHeight = naturalHeight * scale;
    const left = (viewportWidth - baseWidth) / 2;
    const top = (viewportHeight - baseHeight) / 2;
    setImageSize({ naturalWidth, naturalHeight, viewportWidth, viewportHeight, baseWidth, baseHeight });
    setCropRect({ x: left, y: top, width: baseWidth, height: baseHeight });
  };

  const clampCropRect = (nextRect, bounds) => {
    const minSize = 70;
    const width = Math.max(minSize, Math.min(nextRect.width, bounds.right - bounds.left));
    const height = Math.max(minSize, Math.min(nextRect.height, bounds.bottom - bounds.top));
    return {
      x: Math.max(bounds.left, Math.min(nextRect.x, bounds.right - width)),
      y: Math.max(bounds.top, Math.min(nextRect.y, bounds.bottom - height)),
      width,
      height,
    };
  };

  const beginCropInteraction = (event, type = 'move', handle = null) => {
    if (!cropRect || !viewportRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = viewportRef.current.getBoundingClientRect();
    cropInteractionRef.current = {
      pointerId: event.pointerId,
      type,
      handle,
      startX: event.clientX - bounds.left,
      startY: event.clientY - bounds.top,
      startRect: cropRect,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleCropPointerMove = (event) => {
    const interaction = cropInteractionRef.current;
    const viewport = viewportRef.current;
    const bounds = getCropBounds();
    if (!interaction || interaction.pointerId !== event.pointerId || !viewport || !bounds) return;
    const viewportBounds = viewport.getBoundingClientRect();
    const dx = event.clientX - viewportBounds.left - interaction.startX;
    const dy = event.clientY - viewportBounds.top - interaction.startY;
    const start = interaction.startRect;
    if (interaction.type === 'move') {
      setCropRect(clampCropRect({ ...start, x: start.x + dx, y: start.y + dy }, bounds));
    } else {
      let left = start.x;
      let top = start.y;
      let right = start.x + start.width;
      let bottom = start.y + start.height;
      if (interaction.handle.includes('w')) left += dx;
      if (interaction.handle.includes('e')) right += dx;
      if (interaction.handle.includes('n')) top += dy;
      if (interaction.handle.includes('s')) bottom += dy;
      setCropRect(clampCropRect({ x: left, y: top, width: right - left, height: bottom - top }, bounds));
    }
  };

  const endCropInteraction = () => { cropInteractionRef.current = null; };

  const exportCrop = async () => {
    if (!cropRect || !imageSize || !imageRect) return;
    const image = new window.Image();
    image.src = previewUrl;
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });

    const left = Math.max(cropRect.x, imageRect.left);
    const top = Math.max(cropRect.y, imageRect.top);
    const right = Math.min(cropRect.x + cropRect.width, imageRect.left + imageRect.width);
    const bottom = Math.min(cropRect.y + cropRect.height, imageRect.top + imageRect.height);
    const cropWidth = Math.max(1, right - left);
    const cropHeight = Math.max(1, bottom - top);
    const sourceLeft = ((left - imageRect.left) / imageRect.width) * image.naturalWidth;
    const sourceTop = ((top - imageRect.top) / imageRect.height) * image.naturalHeight;
    const sourceWidth = (cropWidth / imageRect.width) * image.naturalWidth;
    const sourceHeight = (cropHeight / imageRect.height) * image.naturalHeight;
    const outputWidth = Math.max(1, Math.round(sourceWidth));
    const outputHeight = Math.max(1, Math.round(sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, sourceLeft, sourceTop, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
    const outputType = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outputType, outputType === 'image/png' ? undefined : 0.98));
    if (!blob) return;
    const extension = outputType.split('/')[1].replace('jpeg', 'jpg');
    onConfirm(new File([blob], `cafe-cover-cropped.${extension}`, { type: outputType, lastModified: Date.now() }));
  };

  return (
    <div className="profile-crop-backdrop" role="dialog" aria-modal="true" aria-label="Ajustar portada de cafetería">
      <section className="profile-crop-modal">
        <header><div><small>AJUSTAR VISTA DE PORTADA</small><h2>Vista previa de portada</h2></div><button type="button" onClick={onCancel} aria-label="Cerrar"><X size={18} /></button></header>
        <div
          ref={viewportRef}
          className="profile-crop-viewport is-cover"
          onPointerMove={handleCropPointerMove}
          onPointerUp={endCropInteraction}
          onPointerCancel={endCropInteraction}
        >
          <img draggable={false} src={previewUrl} alt="Vista previa de portada" onLoad={handleImageLoad} style={imageRect ? { left: `${imageRect.left}px`, top: `${imageRect.top}px`, width: `${imageRect.width}px`, height: `${imageRect.height}px` } : { visibility: 'hidden' }} />
          {cropRect && <div className="profile-crop-selection" style={{ left: `${cropRect.x}px`, top: `${cropRect.y}px`, width: `${cropRect.width}px`, height: `${cropRect.height}px` }} onPointerDown={(event) => beginCropInteraction(event)}>
            <div className="profile-crop-grid" aria-hidden="true" />
            {['nw', 'ne', 'sw', 'se'].map((handle) => <span key={handle} className={`profile-crop-handle is-${handle}`} onPointerDown={(event) => beginCropInteraction(event, 'resize', handle)} aria-hidden="true" />)}
          </div>}
        </div>
        <label className="profile-crop-zoom">Zoom <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <p className="profile-crop-help profile-crop-original-note">Arrastra el marco, ajusta sus esquinas y usa el zoom. Lo que quede dentro sera la portada.</p>
        <div className="profile-crop-actions"><button type="button" className="is-secondary" onClick={onCancel}>Cancelar</button><button type="button" onClick={exportCrop}>Usar este recorte</button></div>
      </section>
    </div>
  );
}

function AdminDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addCafes, refreshCafes } = useCoffeeData();
  const [tab, setTab] = useState(() => {
    try {
      const savedTab = window.sessionStorage.getItem(ADMIN_TAB_STORAGE_KEY);
      return TABS.some((item) => item.id === savedTab) ? savedTab : 'overview';
    } catch {
      return 'overview';
    }
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [notice, setNotice] = useState('');
  const [photoFeedback, setPhotoFeedback] = useState({});
  const [metrics, setMetrics] = useState({});
  const [cafes, setCafes] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [cafeTiktoks, setCafeTiktoks] = useState([]);
  const [postPhotos, setPostPhotos] = useState([]);
  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [manualCafe, setManualCafe] = useState({ nombre: '', address: '', link: '' });
  const [openImageCafe, setOpenImageCafe] = useState(null);
  const [openImageResults, setOpenImageResults] = useState([]);
  const [openImageLoading, setOpenImageLoading] = useState(false);
  const [openImageError, setOpenImageError] = useState('');
  const [openImageVerified, setOpenImageVerified] = useState(false);
  const [cafeSearch, setCafeSearch] = useState('');
  const [cafeVisibleCount, setCafeVisibleCount] = useState(ADMIN_CAFE_PAGE_SIZE);
  const [coverCropRequest, setCoverCropRequest] = useState(null);
  const cafeLoadMoreRef = useRef(null);
  const [adminTheme, setAdminTheme] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('coffee-map:admin-theme')) || { background: '#191511', panel: '#27211b', accent: '#e6dac1' }; } catch { return { background: '#191511', panel: '#27211b', accent: '#e6dac1' }; }
  });
  const [overviewBlocks, setOverviewBlocks] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('coffee-map:admin-blocks'));
      return Array.isArray(saved) && saved.length ? saved : ['metrics', 'welcome'];
    } catch { return ['metrics', 'welcome']; }
  });
  const [draggedOverviewBlock, setDraggedOverviewBlock] = useState(null);
  const [customBlocksBySection, setCustomBlocksBySection] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('coffee-map:admin-custom-blocks'));
      return saved && typeof saved === 'object' ? saved : {};
    } catch { return {}; }
  });
  const [openBuilderMenu, setOpenBuilderMenu] = useState(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [draggedCustomBlock, setDraggedCustomBlock] = useState(null);

  const profileMap = useMemo(() => new Map(users.map((profile) => [profile.id, profile])), [users]);
  const cafeMap = useMemo(() => new Map(cafes.map((cafe) => [cafe.id, cafe])), [cafes]);
  const postMap = useMemo(() => new Map(posts.map((post) => [post.id, post])), [posts]);
  const pendingCafeRequests = useMemo(() => (
    cafes
      .filter((cafe) => cafe.source === 'community' && cafe.status === 'needs_review')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  ), [cafes]);
  const cafeTiktoksByCafeId = useMemo(() => {
    const grouped = new Map();
    cafeTiktoks.forEach((tiktok) => {
      if (!grouped.has(tiktok.cafe_id)) grouped.set(tiktok.cafe_id, []);
      grouped.get(tiktok.cafe_id).push(tiktok);
    });
    return grouped;
  }, [cafeTiktoks]);
  const filteredCafes = useMemo(() => {
    const search = normalizeName(cafeSearch);
    if (!search) return cafes;
    return cafes.filter((cafe) => normalizeName([cafe.nombre, cafe.address, cafe.neighborhood].filter(Boolean).join(' ')).includes(search));
  }, [cafeSearch, cafes]);
  const visibleCafes = useMemo(() => filteredCafes.slice(0, cafeVisibleCount), [cafeVisibleCount, filteredCafes]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const [cafeCount, userCount, postCount, photoCount, reviewCount, cafeRows, tiktokRows, photoRows, postRows, postImageRows, profileRows] = await Promise.all([
        supabase.from('cafes').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('posts').select('id', { count: 'exact', head: true }),
        supabase.from('cafe_photos').select('id', { count: 'exact', head: true }),
        supabase.from('user_cafes').select('id', { count: 'exact', head: true }).not('review_text', 'eq', ''),
        supabase.from('cafes').select('id,nombre,lat,lng,address,link,source_url,neighborhood,category,image_url,image_source_url,image_attribution,image_license,instagram_url,tiktok_url,menu_url,opening_hours,opening_hours_source,opening_hours_source_url,opening_hours_verified_at,source,source_id,status,submitted_by,created_at,last_verified_at').order('nombre').limit(1000),
        supabase.from('cafe_tiktoks').select('id,cafe_id,url,thumbnail_url,title,position,created_at').order('position').order('created_at'),
        supabase.from('cafe_photos').select('id,cafe_id,user_id,post_id,storage_path,public_url,status,is_cover,rights_confirmed,rights_basis,rights_note,created_at').eq('status', 'pending').is('post_id', null).order('created_at', { ascending: false }).limit(100),
        supabase.from('posts').select('id,user_id,cafe_id,content,image_url,status,created_at').order('created_at', { ascending: false }).limit(1000),
        supabase.from('post_images').select('id,post_id,user_id,storage_path,public_url,position,created_at').order('created_at', { ascending: false }).limit(1000),
        supabase.from('profiles').select('id,username,avatar_url,role,updated_at').order('updated_at', { ascending: false }).limit(250),
      ]);
      const firstError = [cafeCount, userCount, postCount, photoCount, reviewCount, cafeRows, photoRows, postRows, postImageRows, profileRows].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      const activeMapCafes = deduplicateCafes((cafeRows.data || [])
        .filter((cafe) => cafe.status === 'active')
        .map((cafe) => ({ ...cafe, nombre: repairCafeText(cafe.nombre), address: repairCafeText(cafe.address) })));
      setMetrics({ cafes: activeMapCafes.length, users: userCount.count, posts: postCount.count, photos: photoCount.count, reviews: reviewCount.count });
      setCafes(cafeRows.data || []);
      setCafeTiktoks(tiktokRows.error ? [] : (tiktokRows.data || []));
      setPhotos(photoRows.data || []);
      setPosts(postRows.data || []);
      setPostPhotos(postImageRows.data || []);
      setUsers(profileRows.data || []);
    } catch (error) {
      setNotice(error.message?.includes('relation') ? 'Aplica primero la migración 20260808_admin_social_photos.sql en Supabase.' : error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    if (!notice) return undefined;
    const timeoutId = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);
  useEffect(() => { setCafeVisibleCount(ADMIN_CAFE_PAGE_SIZE); }, [cafeSearch]);
  useEffect(() => {
    if (tab !== 'cafes' || visibleCafes.length >= filteredCafes.length || !cafeLoadMoreRef.current || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setCafeVisibleCount((current) => Math.min(current + ADMIN_CAFE_PAGE_SIZE, filteredCafes.length));
      }
    }, { rootMargin: '700px 0px' });
    observer.observe(cafeLoadMoreRef.current);
    return () => observer.disconnect();
  }, [filteredCafes.length, tab, visibleCafes.length]);
  useEffect(() => { window.localStorage.setItem('coffee-map:admin-theme', JSON.stringify(adminTheme)); }, [adminTheme]);
  useEffect(() => { window.localStorage.setItem('coffee-map:admin-blocks', JSON.stringify(overviewBlocks)); }, [overviewBlocks]);
  useEffect(() => { window.localStorage.setItem('coffee-map:admin-custom-blocks', JSON.stringify(customBlocksBySection)); }, [customBlocksBySection]);
  useEffect(() => { window.sessionStorage.setItem(ADMIN_TAB_STORAGE_KEY, tab); }, [tab]);

  const moveOverviewBlock = (targetBlock) => {
    if (!draggedOverviewBlock || draggedOverviewBlock === targetBlock) return;
    setOverviewBlocks((current) => {
      const next = current.filter((block) => block !== draggedOverviewBlock);
      next.splice(Math.max(0, next.indexOf(targetBlock)), 0, draggedOverviewBlock);
      return next;
    });
    setDraggedOverviewBlock(null);
  };

  const addCustomBlock = (section, type) => {
    const id = `${type}-${Date.now()}`;
    setCustomBlocksBySection((current) => ({
      ...current,
      [section]: [...(current[section] || []), { id, type, label: '', value: '', content: '', url: '', alt: '', color: '#eee5d2', background: '#27211b', alignment: 'left', fontSize: 16, padding: 16, radius: 14 }],
    }));
    setOpenBuilderMenu(null);
    return id;
  };

  const updateCustomBlock = (section, id, patch) => setCustomBlocksBySection((current) => ({
    ...current,
    [section]: (current[section] || []).map((block) => block.id === id ? { ...block, ...patch } : block),
  }));

  const removeCustomBlock = (section, id) => setCustomBlocksBySection((current) => ({
    ...current,
    [section]: (current[section] || []).filter((block) => block.id !== id),
  }));

  const moveCustomBlock = (section, targetId) => {
    if (!draggedCustomBlock || draggedCustomBlock.section !== section || draggedCustomBlock.id === targetId) return;
    setCustomBlocksBySection((current) => {
      const blocks = [...(current[section] || [])];
      const sourceIndex = blocks.findIndex((block) => block.id === draggedCustomBlock.id);
      const targetIndex = blocks.findIndex((block) => block.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [moved] = blocks.splice(sourceIndex, 1);
      blocks.splice(targetIndex, 0, moved);
      return { ...current, [section]: blocks };
    });
    setDraggedCustomBlock(null);
  };

  const runAction = async (key, action, successMessage, { reload = true } = {}) => {
    setActionLoading(key);
    setNotice('');
    try {
      const actionMessage = await action();
      if (reload) await loadDashboard();
      setNotice(actionMessage || successMessage);
    } catch (error) {
      setNotice(`Error: ${error.message}`);
    } finally {
      setActionLoading('');
    }
  };

  const importOsm = () => runAction('scan', async () => {
    const result = await scanOpenStreetMap(({ current, total, found, failed }) => {
      setNotice(`Escaneando OpenStreetMap: zona ${current}/${total} · ${found} encontradas · ${failed} fallidas`);
    });
    const saved = await upsertDiscoveredCafes(result.cafes);
    // Keep the map's shared state current so accepted discoveries become pins
    // as soon as the scan finishes, without needing a reload.
    addCafes(saved.accepted);
    await refreshCafes();
    const reviewCount = saved.accepted.filter((cafe) => cafe.status === 'needs_review').length;
    return `OSM terminado: ${result.cafes.length} detectadas, ${saved.created} nuevas, ${saved.refreshed} actualizadas, ${saved.skipped.length} duplicadas, ${reviewCount} para revisar y ${result.failed}/${result.total} zonas fallidas.`;
  }, 'Escaneo de Mérida completado.');

  const importOverture = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    return runAction('overture', async () => {
      const payload = JSON.parse(await file.text());
      const incoming = parseOvertureGeoJson(payload);
      const saved = await upsertDiscoveredCafes(incoming);
      addCafes(saved.accepted);
      await refreshCafes();
      return `Overture terminado: ${incoming.length} válidas, ${saved.created} nuevas, ${saved.refreshed} actualizadas y ${saved.skipped.length} duplicadas. Los registros quedan en “Revisar”.`;
    }, 'Archivo de Overture importado.');
  };

  const addManualCafe = (event) => {
    event.preventDefault();
    return runAction('manual', async () => {
      const address = manualCafe.address.trim();
      const link = normalizeGoogleMapsLink(manualCafe.link);
      if (link && !isGoogleMapsLink(link)) throw new Error('El enlace debe ser una URL válida de Google Maps.');
      const location = await geocodeCafeLocation({ address, link });
      const lat = Number(location?.lat);
      const lng = Number(location?.lng);
      if (!manualCafe.nombre.trim() || lat < MERIDA_BBOX.south || lat > MERIDA_BBOX.north || lng < MERIDA_BBOX.west || lng > MERIDA_BBOX.east) {
        throw new Error(location
          ? 'El nombre y una ubicación dentro de Mérida son obligatorios.'
          : 'No pudimos ubicar la cafetería. Agrega una dirección o un enlace válido de Google Maps.');
      }
      const existingCafes = await fetchAllCafes();
      const duplicate = existingCafes.find((cafe) => areDuplicateCafes(cafe, { nombre: manualCafe.nombre, lat, lng }));
      if (duplicate) throw new Error(`Ya existe “${duplicate.nombre}” cerca de estas coordenadas.`);
      const sourceId = `${normalizeName(manualCafe.nombre).replaceAll(' ', '-')}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
      const { error } = await supabase.from('cafes').insert({
        id: `manual:${sourceId}`,
        nombre: manualCafe.nombre.trim(),
        lat,
        lng,
        address: address || null,
        link: link || null,
        neighborhood: location.neighborhood || null,
        source: 'manual',
        source_id: sourceId,
        status: 'active',
      });
      if (error) throw error;
      setManualCafe({ nombre: '', address: '', link: '' });
    }, 'Cafetería agregada.');
  };

  const moderateCafeRequest = (cafe, nextStatus) => runAction(`request:${cafe.id}:${nextStatus}`, async () => {
    if (nextStatus === 'active') {
      await sendCafeSubmission({ id: cafe.id }, 'PATCH');
      await refreshCafes();
      return;
    }
    const update = {
      status: nextStatus,
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('cafes')
      .update(update)
      .eq('id', cafe.id)
      .eq('source', 'community')
      .eq('status', 'needs_review');
    if (error) throw error;
  }, nextStatus === 'active' ? `Solicitud aceptada: ${cafe.nombre}.` : `Solicitud rechazada: ${cafe.nombre}.`);

  const saveCafeCover = (cafe, file) => runAction(`cover:${cafe.id}`, async () => {
    if (!file?.type.startsWith('image/') || file.size > 8 * 1024 * 1024) throw new Error('La foto debe pesar máximo 8 MB.');
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const storagePath = `${user.id}/covers/${Date.now()}-${normalizeName(cafe.nombre).replaceAll(' ', '-')}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('cafe-photos').upload(storagePath, file, { contentType: file.type });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('cafe-photos').getPublicUrl(storagePath);
    const { error: cafeError } = await supabase.from('cafes').update({
      image_url: data.publicUrl,
      image_source_url: null,
      image_attribution: 'Foto añadida por la administración de Coffee Map',
      image_license: null,
    }).eq('id', cafe.id);
    if (cafeError) throw cafeError;
    const { error: resetCoverError } = await supabase.from('cafe_photos').update({ is_cover: false }).eq('cafe_id', cafe.id);
    if (resetCoverError) throw resetCoverError;
    setCafes((current) => current.map((item) => (
      item.id === cafe.id ? { ...item, image_url: data.publicUrl } : item
    )));
    await refreshCafes();
  }, `Portada de ${cafe.nombre} actualizada.`);

  const uploadCafeCover = (cafe, file) => {
    if (!file) return undefined;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      setNotice('Error: la foto debe ser una imagen de máximo 8 MB.');
      return undefined;
    }
    setCoverCropRequest({ cafe, file });
    return undefined;
  };

  const uploadCafeMenuImages = (cafe, files) => {
    const selectedFiles = files.filter(Boolean);
    if (!selectedFiles.length) return undefined;
    const currentImages = parseCafeMenuImages(cafe.menu_url);
    if (currentImages.length + selectedFiles.length > 12) {
      setNotice('Error: cada cafetería puede tener hasta 12 imágenes de menú.');
      return undefined;
    }
    if (selectedFiles.some((file) => !file.type.startsWith('image/') || file.size > 8 * 1024 * 1024)) {
      setNotice('Error: cada imagen del menú debe ser una imagen de máximo 8 MB.');
      return undefined;
    }
    return runAction(`menu:${cafe.id}`, async () => {
      const uploaded = [];
      try {
        for (const [index, file] of selectedFiles.entries()) {
          const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          const storagePath = `${user.id}/menus/${normalizeName(cafe.nombre).replaceAll(' ', '-')}/${Date.now()}-${index}.${extension}`;
          const { error } = await supabase.storage.from('cafe-photos').upload(storagePath, file, { contentType: file.type });
          if (error) throw error;
          uploaded.push({ storagePath, url: supabase.storage.from('cafe-photos').getPublicUrl(storagePath).data.publicUrl });
        }
        const menuImages = [...currentImages, ...uploaded.map((image) => image.url)];
        const savedMenu = JSON.stringify(menuImages);
        const { error } = await supabase.from('cafes').update({ menu_url: savedMenu, updated_at: new Date().toISOString() }).eq('id', cafe.id);
        if (error) throw error;
        setCafes((current) => current.map((item) => item.id === cafe.id ? { ...item, menu_url: savedMenu } : item));
        await refreshCafes();
        return `${uploaded.length} imagen${uploaded.length === 1 ? '' : 'es'} de menú añadida${uploaded.length === 1 ? '' : 's'} a ${cafe.nombre}.`;
      } catch (error) {
        if (uploaded.length) await supabase.storage.from('cafe-photos').remove(uploaded.map((image) => image.storagePath));
        throw error;
      }
    }, 'Imágenes del menú añadidas.');
  };

  const deleteCafeMenuImage = (cafe, url) => runAction(`menu-delete:${cafe.id}`, async () => {
    const menuImages = parseCafeMenuImages(cafe.menu_url).filter((image) => image !== url);
    const savedMenu = JSON.stringify(menuImages);
    const { error } = await supabase.from('cafes').update({ menu_url: savedMenu, updated_at: new Date().toISOString() }).eq('id', cafe.id);
    if (error) throw error;
    const marker = '/storage/v1/object/public/cafe-photos/';
    const storagePath = new URL(url).pathname.split(marker)[1];
    if (storagePath) await supabase.storage.from('cafe-photos').remove([decodeURIComponent(storagePath)]);
    setCafes((current) => current.map((item) => item.id === cafe.id ? { ...item, menu_url: savedMenu } : item));
    await refreshCafes();
    return `Imagen del menú eliminada de ${cafe.nombre}.`;
  }, 'Imagen del menú eliminada.');

  const confirmCafeCoverCrop = (file) => {
    const request = coverCropRequest;
    setCoverCropRequest(null);
    if (!request) return undefined;
    return saveCafeCover(request.cafe, file);
  };

  const deleteCafeCover = (cafe) => {
    if (!cafe.image_url || !window.confirm(`¿Eliminar la portada de ${cafe.nombre}?`)) return undefined;
    return runAction(`cover-delete:${cafe.id}`, async () => {
      const { error } = await supabase.from('cafes').update({
        image_url: null,
        image_source_url: null,
        image_attribution: null,
        image_license: null,
        updated_at: new Date().toISOString(),
      }).eq('id', cafe.id);
      if (error) throw error;
      const { error: photoError } = await supabase.from('cafe_photos').update({ is_cover: false }).eq('cafe_id', cafe.id);
      if (photoError) throw photoError;
    }, `Portada de ${cafe.nombre} eliminada.`);
  };

  const editCafeHours = (cafe) => {
    const value = window.prompt('Horario semanal (ejemplo: Mo-Fr 08:00-20:00; Sa-Su 09:00-18:00). Déjalo vacío para marcarlo por confirmar.', cafe.opening_hours || '');
    if (value === null) return;
    return runAction(`hours:${cafe.id}`, async () => {
      const openingHours = value.trim() || null;
      const { error } = await supabase.from('cafes').update({
        opening_hours: openingHours,
        opening_hours_source: openingHours ? 'admin' : null,
        opening_hours_source_url: null,
        opening_hours_verified_at: openingHours ? new Date().toISOString() : null,
      }).eq('id', cafe.id);
      if (error) throw error;
      await refreshCafes();
    }, `Horario de ${cafe.nombre} actualizado.`);
  };

  const findOpenImages = async (cafe) => {
    setOpenImageCafe(cafe);
    setOpenImageResults([]);
    setOpenImageError('');
    setOpenImageVerified(false);
    setOpenImageLoading(true);
    try {
      const results = await searchOpenverse(cafe.nombre);
      setOpenImageResults(results);
      if (results.length === 0) setOpenImageError('No encontramos coincidencias abiertas. En este caso conviene pedir una foto al negocio o a la comunidad.');
    } catch (error) {
      setOpenImageError(error.message);
    } finally {
      setOpenImageLoading(false);
    }
  };

  const applyOpenverseImage = (image) => runAction(`open-image:${openImageCafe.id}`, async () => {
    if (!openImageVerified) throw new Error('Primero confirma que revisaste la foto y su licencia.');
    const attribution = [image.creator || image.title || 'Autor no indicado', image.provider ? `vía ${image.provider}` : 'vía Openverse'].join(' · ');
    const { error } = await supabase.from('cafes').update({
      image_url: image.url,
      image_source_url: image.foreign_landing_url,
      image_attribution: attribution,
      image_license: getOpenverseLicenseLabel(image),
    }).eq('id', openImageCafe.id);
    if (error) throw error;
    await refreshCafes();
    setOpenImageCafe(null);
    setOpenImageResults([]);
    setOpenImageVerified(false);
  }, `Foto abierta agregada a ${openImageCafe?.nombre}.`);

  const moderatePhoto = (photo, status, makeCover = false) => runAction(`photo:${photo.id}`, async () => {
    const { error } = await supabase.from('cafe_photos').update({
      status,
      is_cover: status === 'approved' && makeCover,
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
    }).eq('id', photo.id);
    if (error) throw error;
    if (status === 'approved' && makeCover) {
      const { error: coverError } = await supabase.from('cafes').update({
        image_url: photo.public_url,
        image_source_url: null,
        image_attribution: 'Foto de la comunidad de Coffee Map',
        image_license: null,
      }).eq('id', photo.cafe_id);
      if (coverError) throw coverError;
      await refreshCafes();
    }
  }, status === 'approved' ? 'Foto aprobada.' : 'Foto rechazada.');

  const moderatePostPhoto = (photo, action) => {
    const actionKey = 'post-photo:' + photo.id + ':' + action;
    setPhotoFeedback((current) => ({ ...current, [photo.id]: '' }));
    return runAction(actionKey, async () => {
      const post = postMap.get(photo.post_id);
      const cafeId = post?.cafe_id;

      if (action === 'cover') {
        if (!cafeId) throw new Error('Esta publicación no está relacionada con una cafetería.');
        const { error: cafeError } = await supabase.from('cafes').update({
          image_url: photo.public_url,
          image_source_url: null,
          image_attribution: 'Foto aprobada de una publicación de Coffee Map',
          image_license: null,
        }).eq('id', cafeId);
        if (cafeError) throw cafeError;
        const { error: resetCoverError } = await supabase.from('cafe_photos').update({ is_cover: false }).eq('cafe_id', cafeId);
        if (resetCoverError) throw resetCoverError;
        const { error: coverError } = await supabase.from('cafe_photos').update({
          status: 'approved',
          is_cover: true,
          moderated_at: new Date().toISOString(),
          moderated_by: user.id,
        }).eq('storage_path', photo.storage_path);
        if (coverError) throw coverError;
        await refreshCafes();
        setPhotoFeedback((current) => ({ ...current, [photo.id]: 'Portada actualizada correctamente.' }));
        return 'Portada actualizada correctamente.';
      }

      const { data: replacement, error: replacementError } = await supabase
        .from('post_images')
        .select('public_url')
        .eq('post_id', photo.post_id)
        .neq('id', photo.id)
        .order('position')
        .limit(1)
        .maybeSingle();
      if (replacementError) throw replacementError;
      const { error: deleteImageError } = await supabase.from('post_images').delete().eq('id', photo.id);
      if (deleteImageError) throw deleteImageError;
      const { error: postError } = await supabase.from('posts').update({
        image_url: replacement?.public_url || null,
        updated_at: new Date().toISOString(),
      }).eq('id', photo.post_id);
      if (postError) throw postError;
      const { error: cafePhotoError } = await supabase.from('cafe_photos').delete()
        .eq('post_id', photo.post_id)
        .eq('storage_path', photo.storage_path);
      if (cafePhotoError) throw cafePhotoError;
      await supabase.storage.from('cafe-photos').remove([photo.storage_path]);
    }, 'Foto bloqueada y retirada de la publicación.');
  };

  const updatePost = (post, status) => runAction(`post:${post.id}`, async () => {
    const { error } = await supabase.from('posts').update({ status }).eq('id', post.id);
    if (error) throw error;
  }, status === 'hidden' ? 'Publicación oculta.' : 'Publicación restaurada.');

  const deletePost = (post) => runAction(`post:${post.id}`, async () => {
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) throw error;
  }, 'Publicación eliminada.');

  const saveCafe = (cafe, options = {}) => runAction(`cafe-save:${cafe.id}`, async () => {
    const timestamp = new Date().toISOString();
    const normalizedLink = normalizeGoogleMapsLink(cafe.link);
    if (options.locationDirty && options.locationField === 'link' && normalizedLink && !isGoogleMapsLink(normalizedLink)) {
      throw new Error('El enlace debe ser una URL válida de Google Maps.');
    }
    const patch = {
      nombre: String(cafe.nombre || '').trim(),
      address: String(cafe.address || '').trim() || null,
      link: normalizedLink || null,
      neighborhood: String(cafe.neighborhood || '').trim() || null,
      category: cafe.category || 'cafeteria',
      opening_hours: options.opening_hours || null,
      opening_hours_source: options.opening_hours ? 'admin' : null,
      opening_hours_source_url: null,
      opening_hours_verified_at: options.opening_hours ? timestamp : null,
      image_url: String(cafe.image_url || '').trim() || null,
      instagram_url: String(cafe.instagram_url || '').trim() || null,
      updated_at: timestamp,
    };
    if (!patch.nombre) throw new Error('El nombre de la cafetería es obligatorio.');
    if (options.locationDirty) {
      const locationInput = options.locationField === 'address'
        ? { ...cafe, ...patch, link: null, source_url: null }
        : { ...cafe, ...patch };
      const location = await geocodeCafeLocation(locationInput);
      if (!location || !isInsideMerida(location)) {
        throw new Error('No pudimos encontrar una ubicación válida dentro de Mérida. Revisa la dirección o el enlace de Google Maps.');
      }
      patch.lat = location.lat;
      patch.lng = location.lng;
      patch.neighborhood = location.neighborhood || patch.neighborhood;
      patch.last_verified_at = timestamp;
    }
    const { error } = await supabase.from('cafes').update(patch).eq('id', cafe.id);
    if (error) throw error;
    setCafes((current) => current.map((item) => item.id === cafe.id ? { ...item, ...patch } : item));
  }, 'Cafetería guardada. El mapa ya usa la nueva ubicación.', { reload: false });

  const updateCafeStatus = (cafe, status) => runAction(`cafe:${cafe.id}`, async () => {
    if (status === 'active' && cafe.source === 'community' && cafe.status === 'needs_review') {
      await sendCafeSubmission({ id: cafe.id }, 'PATCH');
      await refreshCafes();
      return;
    }
    const { error } = await supabase.from('cafes').update({ status, updated_at: new Date().toISOString() }).eq('id', cafe.id);
    if (error) throw error;
    await refreshCafes();
  }, 'Estado actualizado.');

  const addCafeTikTok = (cafe, suppliedUrl = '') => {
    const url = suppliedUrl || window.prompt('Pega el enlace del TikTok relacionado con esta cafetería:');
    if (!url?.trim()) return;
    return runAction(`tiktok:add:${cafe.id}`, async () => {
      const cleanUrl = url.trim();
      if (!/^https?:\/\/([a-z]+\.)?tiktok\.com\//i.test(cleanUrl)) throw new Error('Agrega un enlace válido de TikTok.');
      let metadata = {};
      try {
        const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(cleanUrl)}`);
        if (response.ok) metadata = await response.json();
      } catch {
        // The link is still useful when TikTok blocks oEmbed from the browser.
      }
      const { error } = await supabase.from('cafe_tiktoks').insert({
        cafe_id: cafe.id,
        url: cleanUrl,
        thumbnail_url: metadata.thumbnail_url || null,
        title: metadata.title || null,
        position: (cafeTiktoksByCafeId.get(cafe.id) || []).length,
      });
      if (error) throw error;
    }, 'TikTok relacionado agregado.');
  };

  const deleteCafeTikTok = (tiktok) => runAction(`tiktok:delete:${tiktok.id}`, async () => {
    const { error } = await supabase.from('cafe_tiktoks').delete().eq('id', tiktok.id);
    if (error) throw error;
  }, 'TikTok eliminado.');

  const deleteCafe = (cafe) => {
    if (!window.confirm(`¿Eliminar definitivamente “${cafe.nombre}” y todos sus datos asociados?`)) return;
    return runAction(`cafe:delete:${cafe.id}`, async () => {
      const { error } = await supabase.from('cafes').delete().eq('id', cafe.id);
      if (error) throw error;
      await refreshCafes();
    }, 'Cafetería eliminada.');
  };

  const updateRole = (profile, role) => runAction(`user:${profile.id}`, async () => {
    if (profile.id === user.id && role !== 'administrador') throw new Error('No puedes quitarte tu propio acceso admin.');
    const { error } = await supabase.from('profiles').update({ role, updated_at: new Date().toISOString() }).eq('id', profile.id);
    if (error) throw error;
  }, 'Rol actualizado.');

  return (
    <main className="admin-page" style={{ '--admin-page-bg': adminTheme.background, '--admin-panel-bg': adminTheme.panel, '--admin-accent': adminTheme.accent }}>
      <div className="admin-topbar">
      <header className="admin-header">
        <button type="button" onClick={() => navigate('/')} aria-label="Volver"><ArrowLeft size={22} /></button>
        <div><small>COFFEE MAP MÉRIDA</small><h1>Centro de control</h1></div>
        <button type="button" onClick={loadDashboard} disabled={loading} aria-label="Actualizar"><RefreshCw size={19} className={loading ? 'admin-spin' : ''} /></button>
      </header>

      <nav className="admin-tabs" aria-label="Secciones de administración">
        {TABS.map(({ id, label, icon }) => (
          <button type="button" key={id} className={tab === id ? 'is-active' : ''} onClick={() => { setTab(id); setBuilderOpen(false); setOpenBuilderMenu(null); }}>{icon}<span>{label}{id === 'requests' && pendingCafeRequests.length > 0 ? ` (${pendingCafeRequests.length})` : ''}</span></button>
        ))}
      </nav>
      </div>

      {notice && <p className="admin-notice">{notice}</p>}

      <div className="admin-content">
        <button type="button" className="admin-editor-launch" onClick={() => setBuilderOpen(true)}>
          <Palette size={17} />
          <span><strong>Editor visual</strong><small>Personaliza {TABS.find((item) => item.id === tab)?.label || 'esta sección'} con bloques</small></span>
          <span className="admin-editor-launch-action">Abrir editor</span>
        </button>
        {tab === 'overview' && (
          <section>
            <article className="admin-panel admin-visual-editor">
              <div><Palette size={18} /><strong>Personaliza tu centro</strong><small>Arrastra los bloques y ajusta los colores sin tocar código.</small></div>
              <label>Fondo <input type="color" value={adminTheme.background} onChange={(event) => setAdminTheme((current) => ({ ...current, background: event.target.value }))} /></label>
              <label>Paneles <input type="color" value={adminTheme.panel} onChange={(event) => setAdminTheme((current) => ({ ...current, panel: event.target.value }))} /></label>
              <label>Acento <input type="color" value={adminTheme.accent} onChange={(event) => setAdminTheme((current) => ({ ...current, accent: event.target.value }))} /></label>
              <button type="button" onClick={() => setAdminTheme({ background: '#191511', panel: '#27211b', accent: '#e6dac1' })}>Restaurar</button>
            </article>
            <div className="admin-overview-blocks">
              {overviewBlocks.map((block) => (
                <div key={block} className="admin-overview-block" draggable onDragStart={() => setDraggedOverviewBlock(block)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveOverviewBlock(block)}>
                  <div className="admin-block-handle" title="Arrastrar bloque"><GripVertical size={15} /></div>
                  {block === 'metrics' ? (
                    <div className="admin-metrics">
                      <MetricCard label="Cafeterías en mapa" value={metrics.cafes} icon={<Coffee size={18} />} />
                      <MetricCard label="Usuarios" value={metrics.users} icon={<Users size={18} />} />
                      <MetricCard label="Publicaciones" value={metrics.posts} icon={<Camera size={18} />} />
                      <MetricCard label="Fotos" value={metrics.photos} icon={<Image size={18} />} />
                      <MetricCard label="Reseñas" value={metrics.reviews} icon={<BarChart3 size={18} />} />
                    </div>
                  ) : block === 'welcome' ? (
                    <article className="admin-panel admin-welcome">
                      <Shield size={28} /><div><h2>Moderación centralizada</h2><p>Las fotos de usuarios llegan pendientes. Apruébalas y elige cuáles pueden convertirse en portada de una cafetería.</p></div>
                    </article>
                  ) : (
                    <article className="admin-panel admin-welcome">
                      <Coffee size={28} /><div><h2>Guía rápida</h2><p>Usa la búsqueda para encontrar una cafetería, arrastra los bloques del resumen y cambia los colores desde este editor visual.</p></div>
                    </article>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'cafes' && (
          <section className="admin-stack">
            <article className="admin-panel admin-scan-panel">
              <div><ScanSearch size={24} /><h2>Escáner abierto de Mérida</h2><p>Recorre 16 zonas de OpenStreetMap, obtiene fotos reutilizables de Wikimedia Commons, evita duplicados contra toda la base y permite sumar datos abiertos de Overture.</p></div>
              <div className="admin-scan-actions">
                <button type="button" onClick={importOsm} disabled={Boolean(actionLoading)}>{actionLoading === 'scan' ? 'Escaneando OSM…' : 'Escanear OSM gratis'}</button>
                <label className="admin-import-action">
                  <FileUp size={15} /> {actionLoading === 'overture' ? 'Importando…' : 'Importar Overture'}
                  <input hidden type="file" accept=".json,.geojson,application/json" onChange={importOverture} disabled={Boolean(actionLoading)} />
                </label>
              </div>
            </article>
            {pendingCafeRequests.length > 0 && (
              <article className="admin-panel admin-request-panel">
                <div className="admin-request-heading">
                  <div><h2>Solicitudes pendientes</h2><p>Estas cafeterías fueron propuestas por usuarios y todavía no aparecen como activas en el mapa.</p></div>
                  <strong>{pendingCafeRequests.length}</strong>
                </div>
                <div className="admin-request-list">
                  {pendingCafeRequests.map((cafe) => (
                    <div className="admin-request-row" key={cafe.id}>
                      <div className="admin-row-copy">
                        <strong>{cafe.nombre}</strong>
                        <span>{cafe.address || 'Dirección por confirmar'}</span>
                        <small>{cafe.lat != null && cafe.lng != null ? 'Ubicación lista para verificar al aceptar' : 'Ubicación pendiente: se verificará al aceptar'}</small>
                        {isGoogleMapsLink(cafe.link) && <a href={cafe.link} target="_blank" rel="noreferrer">Ver lugar en Google Maps</a>}
                        <small>{cafe.created_at ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(cafe.created_at)) : 'Solicitud reciente'}</small>
                      </div>
                      <div className="admin-request-actions">
                        <button type="button" onClick={() => moderateCafeRequest(cafe, 'active')} disabled={Boolean(actionLoading)}>Aceptar</button>
                        <button type="button" className="danger" onClick={() => moderateCafeRequest(cafe, 'closed')} disabled={Boolean(actionLoading)}>Rechazar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            )}
            <form className="admin-panel admin-manual-form" onSubmit={addManualCafe}>
              <h2><MapPinned size={19} /> Agregar cafetería faltante</h2>
              <input placeholder="Nombre" value={manualCafe.nombre} onChange={(event) => setManualCafe({ ...manualCafe, nombre: event.target.value })} />
              <input placeholder="Dirección" value={manualCafe.address} onChange={(event) => setManualCafe({ ...manualCafe, address: event.target.value })} />
              <input type="url" inputMode="url" placeholder="Enlace de Google Maps (opcional)" value={manualCafe.link} onChange={(event) => setManualCafe({ ...manualCafe, link: event.target.value })} />
              <small className="admin-manual-location-note">La ubicación se obtiene primero del enlace de Google Maps y después de la dirección.</small>
              <button type="submit" disabled={Boolean(actionLoading)}>Guardar cafetería</button>
            </form>
            <div className="admin-cafe-toolbar">
              <label className="admin-cafe-search"><Search size={16} /><input value={cafeSearch} onChange={(event) => setCafeSearch(event.target.value)} placeholder="Buscar por nombre, dirección o zona" /></label>
              <span>{visibleCafes.length} de {filteredCafes.length} registros administrables</span>
            </div>
            {tab === 'legacy-cafes' && <div className="admin-cafe-legacy-list">
              {cafes.map((cafe) => (
                <article className="admin-row admin-cafe-row" key={cafe.id}>
                  <div className="admin-thumb">{cafe.image_url ? <img src={cafe.image_url} alt="" /> : <Coffee size={20} />}</div>
                  <div className="admin-row-copy"><strong>{cafe.nombre}</strong><small>{cafe.source} · {cafe.status}</small>{cafe.address && <span>{cafe.address}</span>}<span>{cafe.opening_hours || 'Horario por confirmar'}</span></div>
                  <select value={cafe.status} onChange={(event) => runAction(`cafe:${cafe.id}`, async () => { const { error } = await supabase.from('cafes').update({ status: event.target.value }).eq('id', cafe.id); if (error) throw error; }, 'Estado actualizado.')}><option value="active">Activa</option><option value="needs_review">Revisar</option><option value="closed">Cerrada</option></select>
                  <button type="button" className="admin-icon-action" title="Buscar foto con licencia abierta" onClick={() => findOpenImages(cafe)}><Search size={17} /></button>
                  <button type="button" className="admin-icon-action" title="Editar horario" onClick={() => editCafeHours(cafe)}><Clock size={17} /></button>
                  <label className="admin-icon-action" title="Subir portada"><Camera size={17} /><input hidden type="file" accept="image/*" onChange={(event) => uploadCafeCover(cafe, event.target.files?.[0])} /></label>
                </article>
              ))}
            </div>}
            <div className="admin-cafe-grid">
              {visibleCafes.map((cafe) => (
                <AdminCafeCard key={cafe.id} cafe={cafe} tiktoks={cafeTiktoksByCafeId.get(cafe.id) || []} saving={actionLoading === `cafe-save:${cafe.id}`} menuSaving={actionLoading === `menu:${cafe.id}` || actionLoading === `menu-delete:${cafe.id}`} onSave={saveCafe} onStatusChange={updateCafeStatus} onUpload={uploadCafeCover} onDeleteCover={deleteCafeCover} onMenuUpload={uploadCafeMenuImages} onDeleteMenuImage={deleteCafeMenuImage} onFindImage={findOpenImages} onAddTikTok={addCafeTikTok} onDeleteTikTok={deleteCafeTikTok} onDelete={deleteCafe} />
              ))}
            </div>
            {visibleCafes.length === 0 && <p className="admin-empty">No encontramos cafeterías con esa búsqueda.</p>}
            {visibleCafes.length < filteredCafes.length && (
              <div className="admin-cafe-load-more" ref={cafeLoadMoreRef}>
                <span>Cargando más cafeterías…</span>
                <button type="button" onClick={() => setCafeVisibleCount((current) => Math.min(current + ADMIN_CAFE_PAGE_SIZE, filteredCafes.length))}>Cargar más</button>
              </div>
            )}
          </section>
        )}

        {tab === 'requests' && (
          <section className="admin-stack">
            <article className="admin-panel admin-request-panel">
              <div className="admin-request-heading">
                <div><h2>Solicitudes de nuevas cafeterías</h2><p>Revisa la dirección y el enlace de Google Maps. Al aprobar una solicitud, el sistema verifica la ubicación y guarda el lugar correcto para el mapa.</p></div>
                <strong>{pendingCafeRequests.length}</strong>
              </div>
              <div className="admin-request-list">
                {pendingCafeRequests.length === 0 && <p className="admin-empty">No hay solicitudes pendientes.</p>}
                {pendingCafeRequests.map((cafe) => (
                  <div className="admin-request-row" key={cafe.id}>
                    <div className="admin-row-copy">
                      <strong>{cafe.nombre}</strong>
                      <span>{cafe.address || 'Dirección por confirmar'}</span>
                      {cafe.link && <a href={cafe.link} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Ver enlace de Maps</a>}
                      <small>{cafe.created_at ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(cafe.created_at)) : 'Solicitud reciente'}</small>
                    </div>
                    <div className="admin-request-actions">
                      <button type="button" onClick={() => moderateCafeRequest(cafe, 'active')} disabled={Boolean(actionLoading)}>Aceptar y ubicar</button>
                      <button type="button" className="danger" onClick={() => moderateCafeRequest(cafe, 'closed')} disabled={Boolean(actionLoading)}>Rechazar</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}

        {tab === 'photos' && <section className="admin-stack">
          <article className="admin-panel admin-photo-guide">
            <Image size={22} />
            <div><h2>Moderación de fotos</h2><p>Aquí aparecen las fotos de las publicaciones. Descárgalas para revisarlas, bloquéalas si son indebidas y decide manualmente cuál será la portada de cada cafetería.</p></div>
          </article>
          <div className="admin-photo-grid">
            {postPhotos.length === 0 && <p className="admin-empty">No hay fotos en publicaciones.</p>}
            {postPhotos.map((photo) => {
              const post = postMap.get(photo.post_id);
              const cafe = post?.cafe_id ? cafeMap.get(post.cafe_id) : null;
              return (
                <article className={`admin-photo-card ${photoFeedback[photo.id] ? 'is-success' : ''}`} key={photo.id}>
                  <img src={photo.public_url} alt={cafe?.nombre || 'Foto de publicación'} />
                  <div><strong>{cafe?.nombre || 'Publicación general'}</strong><small>{profileMap.get(photo.user_id)?.username || 'Usuario'} · Publicación</small></div>
                  <div className="admin-photo-rights">{post?.content || 'Sin texto en la publicación.'}</div>
                  <div className="admin-photo-actions">
                    <button disabled={!cafe || Boolean(actionLoading)} onClick={() => moderatePostPhoto(photo, 'cover')}>
                      {actionLoading === `post-photo:${photo.id}:cover` ? 'Guardando portada…' : photoFeedback[photo.id] || 'Usar como portada'}
                    </button>
                    <button className="danger" onClick={() => moderatePostPhoto(photo, 'block')}>Bloquear</button>
                    <a className="admin-photo-download" href={photo.public_url} download target="_blank" rel="noreferrer" aria-label="Descargar foto" title="Descargar"><Download size={15} /></a>
                  </div>
                  {photoFeedback[photo.id] && <p className="admin-photo-success" role="status">✓ Esta foto ya es la portada de {cafe?.nombre || 'la cafetería'}.</p>}
                </article>
              );
            })}
          </div>
          {photos.length > 0 && <article className="admin-panel">
            <h2>Fotos enviadas directamente a cafeterías</h2>
            <p>También puedes moderar las fotos que no pertenecen a una publicación.</p>
            <div className="admin-photo-grid admin-photo-grid-secondary">
          {photos.length === 0 && <p className="admin-empty">No hay fotos pendientes de revisión.</p>}
          {photos.map((photo) => <article className="admin-photo-card" key={photo.id}>
            <img src={photo.public_url} alt={cafeMap.get(photo.cafe_id)?.nombre || 'Foto de cafetería'} />
            <div><strong>{cafeMap.get(photo.cafe_id)?.nombre || 'Cafetería'}</strong><small>{profileMap.get(photo.user_id)?.username || 'Usuario'} · {photo.status}</small></div>
            <div className="admin-photo-rights">{photo.rights_confirmed ? `Derechos confirmados · ${photo.rights_basis === 'own' ? 'foto propia' : 'con permiso'}` : 'Sin declaración de derechos (foto anterior)'}</div>
            <div className="admin-photo-actions"><button disabled={!photo.rights_confirmed} onClick={() => moderatePhoto(photo, 'approved')}>Aprobar y publicar</button><button disabled={!photo.rights_confirmed} onClick={() => moderatePhoto(photo, 'approved', true)}>Aprobar como portada</button><button className="danger" onClick={() => moderatePhoto(photo, 'rejected')}>Rechazar foto</button></div>
          </article>)}
          </div>
          </article>}
        </section>}

        {tab === 'posts' && <section className="admin-list">
          {posts.length === 0 && <p className="admin-empty">No hay publicaciones.</p>}
          {posts.map((post) => <article className="admin-row admin-post-row" key={post.id}>
            {post.image_url && <img src={post.image_url} alt="" />}
            <div className="admin-row-copy"><strong>{profileMap.get(post.user_id)?.username || 'Usuario'} {cafeMap.get(post.cafe_id)?.nombre ? `· ${cafeMap.get(post.cafe_id).nombre}` : ''}</strong><p>{post.content}</p><small>{post.status} · {new Date(post.created_at).toLocaleDateString('es-MX')}</small></div>
            <button onClick={() => updatePost(post, post.status === 'hidden' ? 'published' : 'hidden')}>{post.status === 'hidden' ? 'Mostrar' : 'Ocultar'}</button>
            <button className="admin-delete" onClick={() => deletePost(post)} aria-label="Eliminar"><Trash2 size={17} /></button>
          </article>)}
        </section>}

        {tab === 'users' && <section className="admin-list">
          {users.map((profile) => <article className="admin-row" key={profile.id}>
            <div className="admin-thumb admin-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <Users size={18} />}</div>
            <div className="admin-row-copy"><strong>{profile.username}</strong><small>{profile.id === user.id ? 'Tu cuenta' : profile.id.slice(0, 8)}</small></div>
            <select value={profile.role} onChange={(event) => updateRole(profile, event.target.value)} disabled={profile.id === user.id}><option value="usuario">Usuario</option><option value="administrador">Administrador</option></select>
          </article>)}
        </section>}
      </div>

      {builderOpen && (
        <div className="admin-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setBuilderOpen(false); setOpenBuilderMenu(null); } }}>
          <aside className="admin-editor-drawer" role="dialog" aria-modal="true" aria-label={`Editor visual de ${TABS.find((item) => item.id === tab)?.label || 'esta sección'}`}>
            <header className="admin-editor-drawer-header">
              <div><Palette size={18} /><span><strong>Editor visual</strong><small>{TABS.find((item) => item.id === tab)?.label || 'Esta sección'}</small></span></div>
              <button type="button" onClick={() => { setBuilderOpen(false); setOpenBuilderMenu(null); }} aria-label="Cerrar editor"><X size={18} /></button>
            </header>
            <div className="admin-editor-drawer-body">
              <AdminSectionBuilder
                section={tab}
                blocks={customBlocksBySection[tab] || []}
                metrics={metrics}
                menuOpen={openBuilderMenu === tab}
                onToggleMenu={() => setOpenBuilderMenu((current) => current === tab ? null : tab)}
                onAdd={(type) => addCustomBlock(tab, type)}
                onChange={(id, patch) => updateCustomBlock(tab, id, patch)}
                onRemove={(id) => removeCustomBlock(tab, id)}
                onDragStart={(id) => setDraggedCustomBlock({ section: tab, id })}
                onDragOver={() => undefined}
                onDrop={(id) => moveCustomBlock(tab, id)}
              />
            </div>
          </aside>
        </div>
      )}

      {openImageCafe && (
        <div className="open-image-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !actionLoading) setOpenImageCafe(null);
        }}>
          <section className="open-image-modal" role="dialog" aria-modal="true" aria-labelledby="open-image-title">
            <header>
              <div><small>OPENVERSE · LICENCIAS ABIERTAS</small><h2 id="open-image-title">Fotos para {openImageCafe.nombre}</h2></div>
              <button type="button" onClick={() => setOpenImageCafe(null)} disabled={Boolean(actionLoading)} aria-label="Cerrar"><X size={18} /></button>
            </header>

            <p className="open-image-warning">Los resultados son candidatos, no coincidencias garantizadas. Abre la fuente y confirma que la imagen sí muestra este negocio antes de usarla.</p>

            {openImageLoading && <p className="open-image-state">Buscando fotos reutilizables…</p>}
            {openImageError && <p className="open-image-state is-error">{openImageError}</p>}
            {!openImageLoading && openImageResults.length > 0 && (
              <div className="open-image-grid">
                {openImageResults.map((image) => (
                  <article key={image.id}>
                    <img src={image.thumbnail || image.url} alt={image.title || openImageCafe.nombre} />
                    <div>
                      <strong>{image.title || 'Sin título'}</strong>
                      <small>{image.creator || 'Autor no indicado'} · {getOpenverseLicenseLabel(image)}</small>
                      <a href={image.foreign_landing_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Revisar fuente</a>
                      <button type="button" disabled={!openImageVerified || Boolean(actionLoading)} onClick={() => applyOpenverseImage(image)}>
                        {actionLoading === `open-image:${openImageCafe.id}` ? 'Guardando…' : 'Usar esta foto'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <label className="open-image-confirmation">
              <input type="checkbox" checked={openImageVerified} onChange={(event) => setOpenImageVerified(event.target.checked)} />
              Confirmo que revisé la fuente, la licencia y que la foto corresponde a esta cafetería.
            </label>
          </section>
        </div>
      )}

      {coverCropRequest && <AdminCoverCropper file={coverCropRequest.file} onCancel={() => setCoverCropRequest(null)} onConfirm={confirmCafeCoverCrop} />}
    </main>
  );
}

export default AdminDashboardPage;
