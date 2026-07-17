import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, FileUp, Plus, Server, Terminal } from 'lucide-react';
import { supabase } from '../supabase';

const CAFES_CACHE_KEY = 'coffee-map:cafes:v1';
const OVERPASS_URLS = (import.meta.env.VITE_OVERPASS_API_URLS || import.meta.env.VITE_OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const MERIDA_BBOX = {
  south: 20.86,
  west: -89.75,
  north: 21.08,
  east: -89.52,
};

const CAFE_COLUMNS = 'id,nombre,lat,lng,rating,reviews,link,image_url,source,source_id,source_url';
const VISIBLE_SOURCES = ['manual', 'community', 'osm', 'overture'];
const OVERTURE_CAFE_CATEGORIES = new Set([
  'cafe',
  'coffee_shop',
  'coffee',
  'tea_house',
  'bubble_tea_shop',
]);

const clearCafesCache = () => {
  try {
    window.sessionStorage.removeItem(CAFES_CACHE_KEY);
  } catch {
    // Cache clearing is only needed to refresh visible data after admin imports.
  }
};

const normalizeName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const calculateDistanceMeters = (a, b) => {
  const radiusMeters = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return radiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const isInsideMeridaBox = ({ lat, lng }) => (
  lat >= MERIDA_BBOX.south &&
  lat <= MERIDA_BBOX.north &&
  lng >= MERIDA_BBOX.west &&
  lng <= MERIDA_BBOX.east
);

const isProbablyDuplicate = (candidate, existingCafes) => {
  const candidateName = normalizeName(candidate.nombre);
  if (!candidateName) return false;

  return existingCafes.some((cafe) => {
    const existingName = normalizeName(cafe.nombre);
    const namesMatch =
      existingName === candidateName ||
      existingName.includes(candidateName) ||
      candidateName.includes(existingName);

    if (!namesMatch) return false;

    return calculateDistanceMeters(candidate, cafe) <= 90;
  });
};

const uniqueById = (cafes) => Array.from(
  new Map(cafes.filter((cafe) => cafe.id).map((cafe) => [cafe.id, cafe])).values(),
);

const buildBboxGrid = ({ rows = 3, cols = 3 } = {}) => {
  const latStep = (MERIDA_BBOX.north - MERIDA_BBOX.south) / rows;
  const lngStep = (MERIDA_BBOX.east - MERIDA_BBOX.west) / cols;
  const boxes = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      boxes.push({
        south: MERIDA_BBOX.south + latStep * row,
        west: MERIDA_BBOX.west + lngStep * col,
        north: row === rows - 1 ? MERIDA_BBOX.north : MERIDA_BBOX.south + latStep * (row + 1),
        east: col === cols - 1 ? MERIDA_BBOX.east : MERIDA_BBOX.west + lngStep * (col + 1),
      });
    }
  }

  return boxes;
};

const buildMeridaOverpassQuery = (box) => {
  const bbox = `${box.south},${box.west},${box.north},${box.east}`;

  return `
    [out:json][timeout:18];
    (
      node["amenity"="cafe"](${bbox});
      way["amenity"="cafe"](${bbox});
      relation["amenity"="cafe"](${bbox});
      node["shop"="coffee"](${bbox});
      way["shop"="coffee"](${bbox});
      relation["shop"="coffee"](${bbox});
      node["cuisine"~"coffee|coffee_shop",i](${bbox});
      way["cuisine"~"coffee|coffee_shop",i](${bbox});
      relation["cuisine"~"coffee|coffee_shop",i](${bbox});
      node["name"~"cafe|coffee",i](${bbox});
      way["name"~"cafe|coffee",i](${bbox});
      relation["name"~"cafe|coffee",i](${bbox});
    );
    out center tags;
  `;
};

const fetchExistingVisibleCafes = async () => {
  const { data, error } = await supabase
    .from('cafes')
    .select(CAFE_COLUMNS)
    .in('source', VISIBLE_SOURCES);

  if (error) throw error;

  return (data || []).map((cafe) => ({
    ...cafe,
    lat: Number(cafe.lat),
    lng: Number(cafe.lng),
  }));
};

const mapOverpassElementsToCafes = (elements) => uniqueById(elements
  .map((element) => {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    const tags = element.tags || {};
    const name = tags.name || tags.brand;

    if (!lat || !lng || !name) {
      return null;
    }

    const sourceId = `${element.type}/${element.id}`;
    const sourceUrl = `https://www.openstreetmap.org/${sourceId}`;
    const imageUrl = /^https?:\/\//i.test(tags.image || '') ? tags.image : null;

    return {
      id: `osm:${element.type}:${element.id}`,
      nombre: name,
      lat,
      lng,
      rating: null,
      reviews: 0,
      link: sourceUrl,
      image_url: imageUrl,
      source: 'osm',
      source_id: sourceId,
      source_url: sourceUrl,
    };
  })
  .filter(Boolean));

const fetchOverpassBox = async (box) => {
  let lastError = null;

  for (const overpassUrl of OVERPASS_URLS) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 24000);

    try {
      const response = await fetch(overpassUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: new URLSearchParams({ data: buildMeridaOverpassQuery(box) }),
      });

      if (!response.ok) {
        throw new Error(`Overpass HTTP ${response.status}`);
      }

      const data = await response.json();
      const elements = Array.isArray(data.elements) ? data.elements : [];
      return mapOverpassElementsToCafes(elements);
    } catch (error) {
      lastError = error.name === 'AbortError'
        ? new Error('OpenStreetMap/Overpass no respondio despues de 24 segundos.')
        : error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('No se pudo consultar Overpass.');
};

const fetchOsmMeridaCafes = async ({ onProgress } = {}) => {
  const boxes = buildBboxGrid({ rows: 3, cols: 3 });
  const cafesById = new Map();
  const failedBoxes = [];

  for (const [index, box] of boxes.entries()) {
    onProgress?.({
      current: index + 1,
      total: boxes.length,
      found: cafesById.size,
      failed: failedBoxes.length,
    });

    try {
      const boxCafes = await fetchOverpassBox(box);
      boxCafes.forEach((cafe) => cafesById.set(cafe.id, cafe));
    } catch (error) {
      failedBoxes.push({ box, error });
    }
  }

  if (cafesById.size === 0 && failedBoxes.length > 0) {
    throw new Error(`Overpass fallo en todas las zonas. Ultimo error: ${failedBoxes.at(-1).error.message}`);
  }

  onProgress?.({
    current: boxes.length,
    total: boxes.length,
    found: cafesById.size,
    failed: failedBoxes.length,
  });

  return {
    cafes: Array.from(cafesById.values()),
    failedBoxes,
  };
};

const getOvertureName = (properties) => (
  properties?.names?.primary ||
  properties?.names?.common?.[0]?.value ||
  properties?.name ||
  ''
);

const getOvertureCategories = (properties) => {
  const categories = properties?.categories || {};
  return [
    categories.primary,
    ...(Array.isArray(categories.alternate) ? categories.alternate : []),
    properties?.category,
  ]
    .filter(Boolean)
    .map((category) => String(category).toLowerCase());
};

const isOvertureCafe = (properties) => {
  const categories = getOvertureCategories(properties);
  return categories.some((category) => (
    OVERTURE_CAFE_CATEGORIES.has(category) ||
    category.includes('coffee') ||
    category.includes('cafe')
  ));
};

const extractFirstUrl = (value) => {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    const firstUrl = value.find((item) => typeof item === 'string' && /^https?:\/\//i.test(item));
    if (firstUrl) return firstUrl;
  }
  return null;
};

const parseOvertureGeoJson = (geoJson) => {
  const features = Array.isArray(geoJson?.features) ? geoJson.features : [];

  return uniqueById(features
    .map((feature) => {
      const properties = feature.properties || {};
      const coordinates = feature.geometry?.coordinates;
      const lng = Number(coordinates?.[0]);
      const lat = Number(coordinates?.[1]);
      const name = getOvertureName(properties);

      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name || !isInsideMeridaBox({ lat, lng }) || !isOvertureCafe(properties)) {
        return null;
      }

      const sourceId = properties.id || feature.id;
      if (!sourceId) return null;

      const website = extractFirstUrl(properties.websites);
      const sourceUrl = `https://explore.overturemaps.org/place/${sourceId}`;

      return {
        id: `overture:${sourceId}`,
        nombre: name,
        lat,
        lng,
        rating: null,
        reviews: 0,
        link: website || sourceUrl,
        image_url: null,
        source: 'overture',
        source_id: sourceId,
        source_url: sourceUrl,
      };
    })
    .filter(Boolean));
};

const upsertWithoutDuplicateNames = async (incomingCafes, existingCafes) => {
  const accepted = [];
  const skipped = [];
  const comparisonSet = [...existingCafes];

  incomingCafes.forEach((cafe) => {
    if (isProbablyDuplicate(cafe, comparisonSet)) {
      skipped.push(cafe);
      return;
    }

    accepted.push(cafe);
    comparisonSet.push(cafe);
  });

  if (accepted.length > 0) {
    const { error } = await supabase
      .from('cafes')
      .upsert(accepted, { onConflict: 'id' });

    if (error) throw error;
  }

  clearCafesCache();
  return { accepted, skipped };
};

function AdminDashboardPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState('Esperando ejecucion de pruebas...');
  const [loading, setLoading] = useState(false);
  const [manualCafe, setManualCafe] = useState({
    nombre: '',
    lat: '',
    lng: '',
    link: '',
    image_url: '',
  });

  const testSupabaseConnection = async () => {
    setLoading(true);
    setResult('Probando Supabase...');

    try {
      const { error, count } = await supabase
        .from('cafes')
        .select('id', { count: 'exact', head: true });

      if (error) throw error;

      setResult(`[OK] Conexion Supabase exitosa.\nTotal de cafeterias en tabla: ${count}`);
    } catch (err) {
      setResult(`[ERROR] Supabase: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testOsmConnection = async () => {
    setLoading(true);
    setResult('Probando OpenStreetMap/Overpass...');

    try {
      const { cafes, failedBoxes } = await fetchOsmMeridaCafes({
        onProgress: ({ current, total, found, failed }) => {
          setResult(`Probando OpenStreetMap/Overpass...\nZona ${current}/${total}\nEncontradas hasta ahora: ${found}\nZonas fallidas: ${failed}`);
        },
      });
      setResult(
        `[OK] OpenStreetMap/Overpass respondio.\nCafeterias con nombre encontradas: ${cafes.length}\nZonas fallidas: ${failedBoxes.length}/9\nEjemplo: ${cafes[0]?.nombre || 'Sin ejemplo'}`,
      );
    } catch (err) {
      setResult(`[ERROR] OpenStreetMap/Overpass: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const importOsmMeridaCafes = async () => {
    setLoading(true);
    setResult('Importando cafeterias desde OpenStreetMap/Overpass...\nEsto no usa Google Places.');

    try {
      const existingCafes = await fetchExistingVisibleCafes();
      const { cafes: osmCafes, failedBoxes } = await fetchOsmMeridaCafes({
        onProgress: ({ current, total, found, failed }) => {
          setResult(`Importando cafeterias desde OpenStreetMap/Overpass...\nZona ${current}/${total}\nEncontradas hasta ahora: ${found}\nZonas fallidas: ${failed}`);
        },
      });

      const { accepted, skipped } = await upsertWithoutDuplicateNames(osmCafes, existingCafes);
      setResult(
        `[OK] Importacion OSM completada.\nEncontradas: ${osmCafes.length}\nGuardadas/actualizadas: ${accepted.length}\nOmitidas por duplicado cercano: ${skipped.length}\nZonas fallidas: ${failedBoxes.length}/9\n\nRecarga mapa y busqueda.`,
      );
    } catch (err) {
      setResult(`[ERROR] Importacion OSM: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const importOvertureFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setLoading(true);
    setResult(`Leyendo ${file.name}...`);

    try {
      const text = await file.text();
      const geoJson = JSON.parse(text);
      const overtureCafes = parseOvertureGeoJson(geoJson);
      const existingCafes = await fetchExistingVisibleCafes();
      const { accepted, skipped } = await upsertWithoutDuplicateNames(overtureCafes, existingCafes);

      setResult(
        `[OK] Importacion Overture completada.\nCafeterias validas en archivo: ${overtureCafes.length}\nGuardadas/actualizadas: ${accepted.length}\nOmitidas por duplicado cercano: ${skipped.length}\n\nDescarga GeoJSON desde Overture Explorer sobre Merida y puedes repetir por zonas.`,
      );
    } catch (err) {
      setResult(`[ERROR] Importacion Overture: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveManualCafe = async (event) => {
    event.preventDefault();
    setLoading(true);
    setResult('Guardando cafeteria manual...');

    try {
      const nombre = manualCafe.nombre.trim();
      const lat = Number(manualCafe.lat);
      const lng = Number(manualCafe.lng);

      if (!nombre || !Number.isFinite(lat) || !Number.isFinite(lng) || !isInsideMeridaBox({ lat, lng })) {
        throw new Error('Nombre, latitud y longitud deben ser validos y estar dentro de Merida.');
      }

      const sourceId = `${normalizeName(nombre).replaceAll(' ', '-')}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
      const cafe = {
        id: `manual:${sourceId}`,
        nombre,
        lat,
        lng,
        rating: null,
        reviews: 0,
        link: manualCafe.link.trim() || null,
        image_url: manualCafe.image_url.trim() || null,
        source: 'manual',
        source_id: sourceId,
        source_url: manualCafe.link.trim() || null,
      };

      const existingCafes = await fetchExistingVisibleCafes();
      const { accepted, skipped } = await upsertWithoutDuplicateNames([cafe], existingCafes);

      if (accepted.length === 0) {
        setResult(`[OK] No se guardo porque parece duplicada de: ${skipped[0]?.nombre || nombre}`);
        return;
      }

      setManualCafe({ nombre: '', lat: '', lng: '', link: '', image_url: '' });
      setResult(`[OK] Cafeteria manual guardada: ${nombre}`);
    } catch (err) {
      setResult(`[ERROR] Manual: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateManualField = (field, value) => {
    setManualCafe((current) => ({ ...current, [field]: value }));
  };

  return (
    <main className="min-h-screen w-full bg-[#1D1A15] flex flex-col p-6 font-mono text-[#E6DAC1]">
      <header className="flex items-center gap-4 mb-8 pb-4 border-b border-white/10">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-full bg-[#372821] hover:bg-[#493A33] flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="text-[#E6DAC1]" size={24} />
        </button>
        <h1 className="text-2xl font-bold text-white tracking-widest flex items-center gap-2">
          <Server className="text-blue-400" size={26} />
          Admin Dashboard
        </h1>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(320px,520px)_1fr] gap-6">
        <div className="flex flex-col gap-6">
          <div className="bg-[#27201A] p-6 rounded-2xl border border-white/5 h-min">
            <h2 className="text-xl font-bold mb-4 text-white">Datos sin Google</h2>

            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-green-400/20 bg-green-500/10 p-3 text-xs leading-relaxed text-green-100">
                Flujo recomendado: importar OSM, importar GeoJSON de Overture por zonas de Merida, y agregar manualmente las faltantes importantes.
              </div>

              <button
                onClick={testSupabaseConnection}
                disabled={loading}
                className="w-full bg-[#372821] hover:bg-[#493A33] border border-[#E6DAC1]/20 py-3 rounded-xl transition-all font-bold tracking-wide active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <Database size={18} />
                Test Supabase
              </button>

              <button
                onClick={testOsmConnection}
                disabled={loading}
                className="w-full bg-[#372821] hover:bg-[#493A33] border border-[#E6DAC1]/20 py-3 rounded-xl transition-all font-bold tracking-wide active:scale-[0.98] disabled:opacity-60"
              >
                Test OpenStreetMap (Merida)
              </button>

              <button
                onClick={importOsmMeridaCafes}
                disabled={loading}
                className="w-full bg-green-700 hover:bg-green-800 border border-green-300/20 py-3 rounded-xl transition-all font-bold tracking-wide active:scale-[0.98] disabled:opacity-60"
              >
                Importar cafeterias OSM de Merida
              </button>

              <label className="w-full bg-blue-700 hover:bg-blue-800 border border-blue-300/20 py-3 rounded-xl transition-all font-bold tracking-wide active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer">
                <FileUp size={18} />
                Importar GeoJSON de Overture
                <input
                  type="file"
                  accept=".json,.geojson,application/json"
                  onChange={importOvertureFile}
                  disabled={loading}
                  className="hidden"
                />
              </label>

              <p className="text-xs text-[#E6DAC1]/50 mt-2">
                En Overture Explorer, encuadra una zona de Merida, apaga capas que no sean Places y usa Download Visible en GeoJSON.
              </p>
            </div>
          </div>

          <form onSubmit={saveManualCafe} className="bg-[#27201A] p-6 rounded-2xl border border-white/5 h-min">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <Plus size={20} />
              Agregar faltante
            </h2>

            <div className="flex flex-col gap-3">
              <input
                value={manualCafe.nombre}
                onChange={(event) => updateManualField('nombre', event.target.value)}
                placeholder="Nombre"
                className="bg-[#1D1A15] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#E6DAC1]/40"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={manualCafe.lat}
                  onChange={(event) => updateManualField('lat', event.target.value)}
                  placeholder="Lat"
                  className="bg-[#1D1A15] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#E6DAC1]/40"
                />
                <input
                  value={manualCafe.lng}
                  onChange={(event) => updateManualField('lng', event.target.value)}
                  placeholder="Lng"
                  className="bg-[#1D1A15] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#E6DAC1]/40"
                />
              </div>
              <input
                value={manualCafe.link}
                onChange={(event) => updateManualField('link', event.target.value)}
                placeholder="Sitio o fuente"
                className="bg-[#1D1A15] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#E6DAC1]/40"
              />
              <input
                value={manualCafe.image_url}
                onChange={(event) => updateManualField('image_url', event.target.value)}
                placeholder="URL de imagen propia/opcional"
                className="bg-[#1D1A15] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#E6DAC1]/40"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#372821] hover:bg-[#493A33] border border-[#E6DAC1]/20 py-3 rounded-xl transition-all font-bold tracking-wide active:scale-[0.98] disabled:opacity-60"
              >
                Guardar cafeteria manual
              </button>
            </div>
          </form>
        </div>

        <div className="bg-[#0f0d0b] p-6 rounded-2xl border border-white/5 flex flex-col min-h-[420px]">
          <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <Terminal size={20} className="text-green-400" />
            Consola | Resultados
          </h2>
          <div className="flex-1 bg-black rounded-xl p-4 overflow-y-auto whitespace-pre-wrap font-mono text-sm text-green-400 border border-green-500/20 shadow-inner">
            {loading ? <span className="animate-pulse">{result}</span> : result}
          </div>
        </div>
      </section>
    </main>
  );
}

export default AdminDashboardPage;
