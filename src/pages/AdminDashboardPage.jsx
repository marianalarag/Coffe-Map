import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Camera, ChevronLeft, ChevronRight, Clock, Coffee, Database, ExternalLink, FileUp, Image, MapPinned, RefreshCw, ScanSearch, Search, Shield, Sparkles, Trash2, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { supabase } from '../supabase';
import { areDuplicateCafes, distanceBetweenCafes } from '../utils/cafeDeduplication';

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
const CAFE_ASSISTANT_URL = import.meta.env.VITE_CAFE_ASSISTANT_URL || '';
const TABS = [
  { id: 'overview', label: 'Resumen', icon: <BarChart3 size={17} /> },
  { id: 'cafes', label: 'Cafeterías', icon: <Coffee size={17} /> },
  { id: 'photos', label: 'Fotos', icon: <Image size={17} /> },
  { id: 'posts', label: 'Posts', icon: <Camera size={17} /> },
  { id: 'users', label: 'Usuarios', icon: <Users size={17} /> },
];

const normalizeName = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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

const getReverseGeocodeSuggestion = async (cafe) => {
  const params = new URLSearchParams({
    lat: String(cafe.lat),
    lon: String(cafe.lng),
    format: 'jsonv2',
    zoom: '18',
    addressdetails: '1',
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    headers: { Accept: 'application/json', 'Accept-Language': 'es' },
  });
  if (!response.ok) throw new Error(`Nominatim respondió con ${response.status}.`);
  const payload = await response.json();
  const address = payload.address || {};
  const neighborhood = address.suburb || address.neighbourhood || address.quarter || address.city_district || null;
  const addressText = [
    [address.road, address.house_number].filter(Boolean).join(' '),
    neighborhood,
    address.city || address.town || address.municipality,
    address.state,
    address.postcode,
  ].filter(Boolean).join(', ');
  return {
    address: addressText || null,
    neighborhood,
    source_url: payload.place_id ? `https://www.openstreetmap.org/?mlat=${cafe.lat}&mlon=${cafe.lng}#map=19/${cafe.lat}/${cafe.lng}` : null,
  };
};

const researchCafe = async (cafe, request = '') => {
  if (CAFE_ASSISTANT_URL) {
    const response = await fetch(CAFE_ASSISTANT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: request, cafe, locale: 'es-MX', city: 'Mérida, Yucatán' }),
    });
    if (!response.ok) throw new Error(`El asistente respondió con ${response.status}.`);
    return response.json();
  }

  const [locationResult, imageResult] = await Promise.allSettled([
    getReverseGeocodeSuggestion(cafe),
    searchOpenverse(cafe.nombre),
  ]);
  const location = locationResult.status === 'fulfilled' ? locationResult.value : {};
  const images = imageResult.status === 'fulfilled' ? imageResult.value : [];
  return {
    address: location.address || cafe.address || null,
    neighborhood: location.neighborhood || cafe.neighborhood || null,
    opening_hours: cafe.opening_hours || null,
    opening_hours_source: cafe.opening_hours ? cafe.opening_hours_source || 'osm' : null,
    opening_hours_source_url: cafe.opening_hours_source_url || null,
    image: images[0] || null,
    sources: [location.source_url, images[0]?.foreign_landing_url].filter(Boolean),
    mode: 'open-sources',
  };
};

const getOsmCafeSuggestion = async (cafe) => {
  const sourceId = String(cafe.source_id || '');
  if (!/^(node|way|relation)\/\d+$/.test(sourceId)) return {};
  const response = await fetch(`https://api.openstreetmap.org/api/0.6/${sourceId}.json`);
  if (!response.ok) return {};
  const payload = await response.json();
  const element = payload.elements?.[0];
  const tags = element?.tags || {};
  return tags.opening_hours ? {
    opening_hours: tags.opening_hours,
    opening_hours_source: 'osm',
    opening_hours_source_url: `https://www.openstreetmap.org/${sourceId}`,
  } : {};
};

const inferAssistantFields = (message) => {
  const normalized = normalizeName(message);
  const fields = new Set();
  if (/horar|hora|apertura|cerrad|abiert/.test(normalized)) fields.add('hours');
  if (/portada|foto|imagen|cover/.test(normalized)) fields.add('image');
  if (/ubicacion|direccion|colonia|zona/.test(normalized)) fields.add('location');
  return fields.size > 0 ? fields : new Set(['hours', 'image', 'location']);
};

const researchCafeForTask = async (cafe, request, fields) => {
  if (CAFE_ASSISTANT_URL) {
    const payload = await researchCafe(cafe, request);
    return payload.suggestion || payload.data || payload;
  }
  const requests = [];
  if (fields.has('hours')) requests.push(getOsmCafeSuggestion(cafe));
  if (fields.has('location')) requests.push(getReverseGeocodeSuggestion(cafe));
  if (fields.has('image')) requests.push(searchOpenverse(cafe.nombre).then((images) => ({ image: images[0] || null, sources: [images[0]?.foreign_landing_url].filter(Boolean) })));
  const results = await Promise.allSettled(requests);
  return results.reduce((suggestion, result) => result.status === 'fulfilled' ? { ...suggestion, ...result.value } : suggestion, {
    address: cafe.address || null,
    neighborhood: cafe.neighborhood || null,
    opening_hours: cafe.opening_hours || null,
    opening_hours_source: cafe.opening_hours ? cafe.opening_hours_source || 'osm' : null,
    opening_hours_source_url: cafe.opening_hours_source_url || null,
    mode: 'open-sources',
  });
};

const getAssistantPatch = (cafe, suggestion) => {
  const image = suggestion?.image || {};
  const patch = {};
  const imageUrl = suggestion?.image_url || image.url;
  if (!cafe.address && suggestion?.address) patch.address = suggestion.address;
  if (!cafe.neighborhood && suggestion?.neighborhood) patch.neighborhood = suggestion.neighborhood;
  if (!cafe.opening_hours && suggestion?.opening_hours) {
    patch.opening_hours = suggestion.opening_hours;
    patch.opening_hours_source = suggestion.opening_hours_source || 'assistant';
    patch.opening_hours_source_url = suggestion.opening_hours_source_url || null;
    patch.opening_hours_verified_at = new Date().toISOString();
  }
  if (!cafe.image_url && imageUrl) {
    patch.image_url = imageUrl;
    patch.image_source_url = suggestion.image_source_url || image.foreign_landing_url || null;
    patch.image_attribution = suggestion.image_attribution || [image.creator || image.title || 'Autor no indicado', image.provider ? `vía ${image.provider}` : 'vía Openverse'].join(' · ');
    patch.image_license = suggestion.image_license || getOpenverseLicenseLabel(image);
  }
  return patch;
};

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
    const { error } = await supabase.from('cafes').upsert(accepted.slice(index, index + 250), { onConflict: 'id' });
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

function AdminDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addCafes, refreshCafes } = useCoffeeData();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [notice, setNotice] = useState('');
  const [metrics, setMetrics] = useState({});
  const [cafes, setCafes] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [manualCafe, setManualCafe] = useState({ nombre: '', lat: '', lng: '', address: '', link: '' });
  const [openImageCafe, setOpenImageCafe] = useState(null);
  const [openImageResults, setOpenImageResults] = useState([]);
  const [openImageLoading, setOpenImageLoading] = useState(false);
  const [openImageError, setOpenImageError] = useState('');
  const [openImageVerified, setOpenImageVerified] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState('');
  const [assistantBatch, setAssistantBatch] = useState(null);
  const [assistantVerified, setAssistantVerified] = useState(false);
  const [assistantProgress, setAssistantProgress] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantMessages, setAssistantMessages] = useState([]);

  const profileMap = useMemo(() => new Map(users.map((profile) => [profile.id, profile])), [users]);
  const cafeMap = useMemo(() => new Map(cafes.map((cafe) => [cafe.id, cafe])), [cafes]);
  const exactLocationCandidates = useMemo(() => {
    const candidates = [];
    for (let index = 0; index < cafes.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < cafes.length; nextIndex += 1) {
        const first = cafes[index];
        const second = cafes[nextIndex];
        const distance = distanceBetweenCafes(first, second);
        if (distance <= 8 && normalizeName(first.nombre) !== normalizeName(second.nombre)) {
          candidates.push({ first, second, distance: Math.round(distance) });
        }
      }
    }
    return candidates;
  }, [cafes]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const [cafeCount, userCount, postCount, photoCount, reviewCount, cafeRows, photoRows, postRows, profileRows] = await Promise.all([
        supabase.from('cafes').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('posts').select('id', { count: 'exact', head: true }),
        supabase.from('cafe_photos').select('id', { count: 'exact', head: true }),
        supabase.from('user_cafes').select('id', { count: 'exact', head: true }).not('review_text', 'eq', ''),
        supabase.from('cafes').select('id,nombre,lat,lng,address,neighborhood,image_url,image_source_url,image_attribution,image_license,opening_hours,opening_hours_source,opening_hours_source_url,opening_hours_verified_at,source,source_id,status,last_verified_at').order('nombre').limit(1000),
        supabase.from('cafe_photos').select('id,cafe_id,user_id,storage_path,public_url,status,is_cover,rights_confirmed,rights_basis,rights_note,created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('posts').select('id,user_id,cafe_id,content,image_url,status,created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('profiles').select('id,username,avatar_url,role,updated_at').order('updated_at', { ascending: false }).limit(250),
      ]);
      const firstError = [cafeCount, userCount, postCount, photoCount, reviewCount, cafeRows, photoRows, postRows, profileRows].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setMetrics({ cafes: cafeCount.count, users: userCount.count, posts: postCount.count, photos: photoCount.count, reviews: reviewCount.count });
      setCafes(cafeRows.data || []);
      setPhotos(photoRows.data || []);
      setPosts(postRows.data || []);
      setUsers(profileRows.data || []);
    } catch (error) {
      setNotice(error.message?.includes('relation') ? 'Aplica primero la migración 20260808_admin_social_photos.sql en Supabase.' : error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const runAction = async (key, action, successMessage) => {
    setActionLoading(key);
    setNotice('');
    try {
      const actionMessage = await action();
      await loadDashboard();
      setNotice(actionMessage || successMessage);
    } catch (error) {
      setNotice(`Error: ${error.message}`);
    } finally {
      setActionLoading('');
    }
  };

  const openCafeAssistant = (cafe = null) => {
    setAssistantError('');
    setAssistantVerified(false);
    setAssistantBatch(null);
    setAssistantProgress('');
    setAssistantInput(cafe ? `Revisa la información faltante de ${cafe.nombre}` : '');
    setAssistantCollapsed(false);
    setAssistantMessages([{
      role: 'assistant',
      content: cafe
        ? `Puedo revisar ${cafe.nombre} o trabajar por lotes. Pídeme horarios, ubicaciones, colonias o portadas faltantes.`
        : 'Hola. Pídeme una tarea para todo el panel, por ejemplo: “busca los horarios de las cafeterías y agrégalos a las faltantes”.',
    }]);
    setAssistantOpen(true);
  };

  const sendAssistantMessage = async (event) => {
    event.preventDefault();
    const message = assistantInput.trim();
    if (!message || assistantLoading) return;

    const nextMessages = [...assistantMessages, { role: 'user', content: message }];
    const fields = inferAssistantFields(message);
    const normalizedMessage = normalizeName(message);
    const namedCafes = cafes.filter((cafe) => normalizedMessage.includes(normalizeName(cafe.nombre)));
    const targetPool = namedCafes.length > 0 ? namedCafes : cafes;
    const targets = targetPool.filter((cafe) => (
      (fields.has('hours') && !cafe.opening_hours)
      || (fields.has('image') && !cafe.image_url)
      || (fields.has('location') && (!cafe.address || !cafe.neighborhood))
    ));

    setAssistantMessages(nextMessages);
    setAssistantInput('');
    setAssistantError('');
    setAssistantVerified(false);
    setAssistantBatch(null);
    setAssistantLoading(true);
    try {
      if (targets.length === 0) {
        setAssistantMessages((current) => [...current, { role: 'assistant', content: 'No encontré cafeterías con esos datos faltantes. No modifiqué registros existentes.' }]);
        return;
      }

      const results = [];
      const batchSize = CAFE_ASSISTANT_URL ? 4 : 3;
      for (let index = 0; index < targets.length; index += batchSize) {
        const currentTargets = targets.slice(index, index + batchSize);
        setAssistantProgress(`Investigando ${Math.min(index + currentTargets.length, targets.length)} de ${targets.length} cafeterías…`);
        const researched = await Promise.allSettled(currentTargets.map((cafe) => researchCafeForTask(cafe, message, fields)));
        researched.forEach((result, resultIndex) => {
          if (result.status === 'fulfilled') {
            const cafe = currentTargets[resultIndex];
            const patch = getAssistantPatch(cafe, result.value);
            if (Object.keys(patch).length > 0) results.push({ cafe, suggestion: result.value, patch });
          }
        });
      }

      setAssistantBatch(results);
      const changes = results.reduce((total, result) => total + Object.keys(result.patch).length, 0);
      setAssistantMessages((current) => [...current, {
        role: 'assistant',
        content: `Terminé la revisión de ${targets.length} cafeterías. Preparé ${changes} cambios en ${results.length} registros. Revisa las fuentes y confirma para guardarlos en la web.`,
      }]);
    } catch (error) {
      setAssistantError(error.message || 'No se pudo completar la tarea.');
      setAssistantMessages((current) => [...current, { role: 'assistant', content: 'No pude completar la tarea. Revisa la conexión e intenta otra vez.' }]);
    } finally {
      setAssistantProgress('');
      setAssistantLoading(false);
    }
  };

  const applyAssistantBatch = () => runAction('assistant-batch', async () => {
    if (!assistantVerified) throw new Error('Confirma que revisaste las fuentes antes de guardar.');
    if (!assistantBatch?.length) throw new Error('No hay cambios sugeridos para guardar.');
    const updates = await Promise.all(assistantBatch.map(({ cafe, patch }) => (
      supabase.from('cafes').update(patch).eq('id', cafe.id)
    )));
    const updateError = updates.find((result) => result.error)?.error;
    if (updateError) throw updateError;
    await refreshCafes();
    setAssistantMessages((current) => [...current, { role: 'assistant', content: `Guardé ${assistantBatch.length} cafeterías. Los horarios, ubicaciones y portadas ya quedaron conservados en la base de datos.` }]);
    setAssistantBatch(null);
    setAssistantVerified(false);
  }, `Cambios del asistente guardados en ${assistantBatch?.length || 0} cafeterías.`);

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
      const lat = Number(manualCafe.lat);
      const lng = Number(manualCafe.lng);
      if (!manualCafe.nombre.trim() || lat < MERIDA_BBOX.south || lat > MERIDA_BBOX.north || lng < MERIDA_BBOX.west || lng > MERIDA_BBOX.east) {
        throw new Error('Nombre y coordenadas válidas dentro de Mérida son obligatorios.');
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
        address: manualCafe.address.trim() || null,
        link: manualCafe.link.trim() || null,
        source: 'manual',
        source_id: sourceId,
        status: 'active',
      });
      if (error) throw error;
      setManualCafe({ nombre: '', lat: '', lng: '', address: '', link: '' });
    }, 'Cafetería agregada.');
  };

  const uploadCafeCover = (cafe, file) => {
    if (!file) return undefined;
    if (!window.confirm('Confirma que esta foto es tuya o que tienes permiso para publicarla en Coffee Map.')) return undefined;
    return runAction(`cover:${cafe.id}`, async () => {
    if (!file?.type.startsWith('image/') || file.size > 8 * 1024 * 1024) throw new Error('La foto debe pesar máximo 8 MB.');
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const storagePath = `${user.id}/covers/${Date.now()}-${normalizeName(cafe.nombre).replaceAll(' ', '-')}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('cafe-photos').upload(storagePath, file, { contentType: file.type });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('cafe-photos').getPublicUrl(storagePath);
    const { error: cafeError } = await supabase.from('cafes').update({
      image_url: data.publicUrl,
      image_source_url: null,
      image_attribution: 'Foto de la comunidad de Coffee Map',
      image_license: null,
    }).eq('id', cafe.id);
    if (cafeError) throw cafeError;
    const { error: photoError } = await supabase.from('cafe_photos').insert({
      cafe_id: cafe.id,
      user_id: user.id,
      storage_path: storagePath,
      public_url: data.publicUrl,
      status: 'approved',
      is_cover: true,
      rights_confirmed: true,
      rights_basis: 'permission',
      rights_note: 'La administración confirmó que cuenta con derechos o permiso para publicar esta portada.',
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
    });
    if (photoError) throw photoError;
    setCafes((current) => current.map((item) => (
      item.id === cafe.id ? { ...item, image_url: data.publicUrl } : item
    )));
    await refreshCafes();
    }, `Portada de ${cafe.nombre} actualizada.`);
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

  const updatePost = (post, status) => runAction(`post:${post.id}`, async () => {
    const { error } = await supabase.from('posts').update({ status }).eq('id', post.id);
    if (error) throw error;
  }, status === 'hidden' ? 'Publicación oculta.' : 'Publicación restaurada.');

  const deletePost = (post) => runAction(`post:${post.id}`, async () => {
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) throw error;
  }, 'Publicación eliminada.');

  const updateRole = (profile, role) => runAction(`user:${profile.id}`, async () => {
    if (profile.id === user.id && role !== 'administrador') throw new Error('No puedes quitarte tu propio acceso admin.');
    const { error } = await supabase.from('profiles').update({ role, updated_at: new Date().toISOString() }).eq('id', profile.id);
    if (error) throw error;
  }, 'Rol actualizado.');

  return (
    <main className="admin-page">
      <div className="admin-topbar">
      <header className="admin-header">
        <button type="button" onClick={() => navigate('/')} aria-label="Volver"><ArrowLeft size={22} /></button>
        <div><small>COFFEE MAP MÉRIDA</small><h1>Centro de control</h1></div>
        <button type="button" onClick={loadDashboard} disabled={loading} aria-label="Actualizar"><RefreshCw size={19} className={loading ? 'admin-spin' : ''} /></button>
      </header>

      <nav className="admin-tabs" aria-label="Secciones de administración">
        {TABS.map(({ id, label, icon }) => (
          <button type="button" key={id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{icon}<span>{label}</span></button>
        ))}
      </nav>
      </div>

      {notice && <p className="admin-notice">{notice}</p>}

      <div className="admin-content">
        {tab === 'overview' && (
          <section>
            <div className="admin-metrics">
              <MetricCard label="Cafeterías" value={metrics.cafes} icon={<Coffee size={18} />} />
              <MetricCard label="Usuarios" value={metrics.users} icon={<Users size={18} />} />
              <MetricCard label="Publicaciones" value={metrics.posts} icon={<Camera size={18} />} />
              <MetricCard label="Fotos" value={metrics.photos} icon={<Image size={18} />} />
              <MetricCard label="Reseñas" value={metrics.reviews} icon={<BarChart3 size={18} />} />
            </div>
            <article className="admin-panel admin-welcome">
              <Shield size={28} /><div><h2>Moderación centralizada</h2><p>Las fotos de usuarios llegan pendientes. Apruébalas y elige cuáles pueden convertirse en portada de una cafetería.</p></div>
            </article>
          </section>
        )}

        {tab === 'cafes' && (
          <section className="admin-stack">
            <article className="admin-panel admin-scan-panel">
              <div><ScanSearch size={24} /><h2>Escáner abierto de Mérida</h2><p>Recorre 16 zonas de OpenStreetMap, obtiene fotos reutilizables de Wikimedia Commons, evita duplicados contra toda la base y permite sumar datos abiertos de Overture.</p></div>
              <div className="admin-scan-actions">
                <button type="button" onClick={() => openCafeAssistant()} disabled={Boolean(actionLoading)}><Sparkles size={15} /> Abrir asistente</button>
                <button type="button" onClick={importOsm} disabled={Boolean(actionLoading)}>{actionLoading === 'scan' ? 'Escaneando OSM…' : 'Escanear OSM gratis'}</button>
                <label className="admin-import-action">
                  <FileUp size={15} /> {actionLoading === 'overture' ? 'Importando…' : 'Importar Overture'}
                  <input hidden type="file" accept=".json,.geojson,application/json" onChange={importOverture} disabled={Boolean(actionLoading)} />
                </label>
              </div>
            </article>
            <form className="admin-panel admin-manual-form" onSubmit={addManualCafe}>
              <h2><MapPinned size={19} /> Agregar cafetería faltante</h2>
              <input placeholder="Nombre" value={manualCafe.nombre} onChange={(event) => setManualCafe({ ...manualCafe, nombre: event.target.value })} />
              <input placeholder="Dirección" value={manualCafe.address} onChange={(event) => setManualCafe({ ...manualCafe, address: event.target.value })} />
              <div><input inputMode="decimal" placeholder="Latitud" value={manualCafe.lat} onChange={(event) => setManualCafe({ ...manualCafe, lat: event.target.value })} /><input inputMode="decimal" placeholder="Longitud" value={manualCafe.lng} onChange={(event) => setManualCafe({ ...manualCafe, lng: event.target.value })} /></div>
              <input placeholder="Enlace de Maps (opcional)" value={manualCafe.link} onChange={(event) => setManualCafe({ ...manualCafe, link: event.target.value })} />
              <button type="submit" disabled={Boolean(actionLoading)}>Guardar cafetería</button>
            </form>
            {exactLocationCandidates.length > 0 && (
              <article className="admin-panel admin-duplicate-warning">
                <strong>Posibles duplicados en el mismo punto</strong>
                <p>Revisa estos registros antes de seguir importando. No se combinan automáticamente porque podrían ser negocios distintos dentro de la misma plaza.</p>
                {exactLocationCandidates.slice(0, 4).map(({ first, second, distance }) => (
                  <span key={`${first.id}:${second.id}`}>{first.nombre} · {second.nombre} <small>{distance} m</small></span>
                ))}
                {exactLocationCandidates.length > 4 && <small>+{exactLocationCandidates.length - 4} coincidencias más</small>}
              </article>
            )}
            <div className="admin-list">
              {cafes.map((cafe) => (
                <article className="admin-row admin-cafe-row" key={cafe.id}>
                  <div className="admin-thumb">{cafe.image_url ? <img src={cafe.image_url} alt="" /> : <Coffee size={20} />}</div>
                  <div className="admin-row-copy"><strong>{cafe.nombre}</strong><small>{cafe.source} · {cafe.status}</small>{cafe.address && <span>{cafe.address}</span>}<span>{cafe.opening_hours || 'Horario por confirmar'}</span></div>
                  <select value={cafe.status} onChange={(event) => runAction(`cafe:${cafe.id}`, async () => { const { error } = await supabase.from('cafes').update({ status: event.target.value }).eq('id', cafe.id); if (error) throw error; }, 'Estado actualizado.')}><option value="active">Activa</option><option value="needs_review">Revisar</option><option value="closed">Cerrada</option></select>
                  <button type="button" className="admin-icon-action" title="Asistente: revisar horario, ubicación y portada" onClick={() => openCafeAssistant(cafe)}><Sparkles size={17} /></button>
                  <button type="button" className="admin-icon-action" title="Buscar foto con licencia abierta" onClick={() => findOpenImages(cafe)}><Search size={17} /></button>
                  <button type="button" className="admin-icon-action" title="Editar horario" onClick={() => editCafeHours(cafe)}><Clock size={17} /></button>
                  <label className="admin-icon-action" title="Subir portada"><Camera size={17} /><input hidden type="file" accept="image/*" onChange={(event) => uploadCafeCover(cafe, event.target.files?.[0])} /></label>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'photos' && <section className="admin-photo-grid">
          {photos.length === 0 && <p className="admin-empty">No hay fotos para moderar.</p>}
          {photos.map((photo) => <article className="admin-photo-card" key={photo.id}>
            <img src={photo.public_url} alt={cafeMap.get(photo.cafe_id)?.nombre || 'Foto de cafetería'} />
            <div><strong>{cafeMap.get(photo.cafe_id)?.nombre || 'Cafetería'}</strong><small>{profileMap.get(photo.user_id)?.username || 'Usuario'} · {photo.status}</small></div>
            <div className="admin-photo-rights">{photo.rights_confirmed ? `Derechos confirmados · ${photo.rights_basis === 'own' ? 'foto propia' : 'con permiso'}` : 'Sin declaración de derechos (foto anterior)'}</div>
            <div className="admin-photo-actions"><button disabled={!photo.rights_confirmed} onClick={() => moderatePhoto(photo, 'approved')}>Aprobar</button><button disabled={!photo.rights_confirmed} onClick={() => moderatePhoto(photo, 'approved', true)}>Usar portada</button><button className="danger" onClick={() => moderatePhoto(photo, 'rejected')}>Rechazar</button></div>
          </article>)}
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

      {!assistantOpen && (
        <button type="button" className="admin-assistant-launcher" onClick={() => openCafeAssistant()}>
          <Sparkles size={17} /> <span>Asistente</span>
        </button>
      )}

      {assistantOpen && assistantCollapsed && (
        <button type="button" className="admin-assistant-tab" onClick={() => setAssistantCollapsed(false)} aria-label="Mostrar asistente">
          <ChevronLeft size={17} /> <span>IA</span>
        </button>
      )}

      {assistantOpen && !assistantCollapsed && (
        <aside className="admin-assistant-drawer">
          <section className="open-image-modal cafe-assistant-modal" role="dialog" aria-modal="false" aria-labelledby="cafe-assistant-title">
            <header>
              <div><small>ASISTENTE DE DATOS · REVISIÓN MANUAL</small><h2 id="cafe-assistant-title">Asistente Coffee Map</h2></div>
              <div className="admin-assistant-header-actions">
                <button type="button" onClick={() => setAssistantCollapsed(true)} disabled={assistantLoading || Boolean(actionLoading)} aria-label="Contraer asistente"><ChevronRight size={18} /></button>
                <button type="button" onClick={() => setAssistantOpen(false)} disabled={assistantLoading || Boolean(actionLoading)} aria-label="Cerrar"><X size={18} /></button>
              </div>
            </header>
            <p className="open-image-warning">Pídele tareas generales: investigar faltantes, preparar horarios, ubicar colonias y buscar portadas con licencia abierta. No consulta ni copia la base privada de Google.</p>
            <div className="cafe-assistant-chat">
              <div className="cafe-assistant-messages" aria-live="polite">
                {assistantMessages.map((message, index) => (
                  <p className={`cafe-assistant-message is-${message.role}`} key={`${message.role}:${index}`}>{message.content}</p>
                ))}
                {assistantLoading && <p className="cafe-assistant-message is-assistant">Estoy investigando…</p>}
                {assistantProgress && <p className="cafe-assistant-progress">{assistantProgress}</p>}
              </div>
              <form className="cafe-assistant-composer" onSubmit={sendAssistantMessage}>
                <input value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} placeholder="Ej. busca horarios y portadas faltantes…" disabled={assistantLoading} />
                <button type="submit" disabled={!assistantInput.trim() || assistantLoading} aria-label="Enviar consulta">Enviar</button>
              </form>
            </div>
            {assistantError && <p className="open-image-state is-error">{assistantError}</p>}
            {assistantBatch && (
              <div className="cafe-assistant-suggestion">
                <div className="cafe-assistant-field"><small>Cambios preparados</small><strong>{assistantBatch.length} cafeterías listas para actualizar</strong><span>Solo se llenan campos faltantes; los datos existentes no se sobrescriben.</span></div>
                <div className="cafe-assistant-batch-list">
                  {assistantBatch.slice(0, 12).map(({ cafe, patch }) => (
                    <span key={cafe.id}>{cafe.nombre} · {Object.keys(patch).filter((key) => !key.endsWith('_source') && !key.endsWith('_attribution') && !key.endsWith('_license') && !key.endsWith('_verified_at')).join(', ')}</span>
                  ))}
                  {assistantBatch.length > 12 && <small>+{assistantBatch.length - 12} cafeterías más</small>}
                </div>
                <label className="open-image-confirmation">
                  <input type="checkbox" checked={assistantVerified} onChange={(event) => setAssistantVerified(event.target.checked)} />
                  Confirmo que revisé las fuentes y autorizo guardar estos cambios.
                </label>
                <button type="button" className="cafe-assistant-save" disabled={!assistantVerified || Boolean(actionLoading)} onClick={applyAssistantBatch}>
                  {actionLoading === 'assistant-batch' ? 'Guardando…' : 'Guardar cambios en la web'}
                </button>
              </div>
            )}
          </section>
        </aside>
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
    </main>
  );
}

export default AdminDashboardPage;
