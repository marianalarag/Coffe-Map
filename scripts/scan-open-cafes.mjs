import 'dotenv/config';
const MERIDA = { south: 20.86, west: -89.75, north: 21.08, east: -89.52 };
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const boxes = (rows = 4, cols = 4) => {
  const latStep = (MERIDA.north - MERIDA.south) / rows;
  const lngStep = (MERIDA.east - MERIDA.west) / cols;
  return Array.from({ length: rows * cols }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      south: MERIDA.south + latStep * row,
      west: MERIDA.west + lngStep * col,
      north: row === rows - 1 ? MERIDA.north : MERIDA.south + latStep * (row + 1),
      east: col === cols - 1 ? MERIDA.east : MERIDA.west + lngStep * (col + 1),
    };
  });
};

const queryFor = (box) => {
  const bbox = `${box.south},${box.west},${box.north},${box.east}`;
  return `[out:json][timeout:30];(
    nwr["amenity"="cafe"](${bbox});
    nwr["shop"="coffee"](${bbox});
    nwr["craft"="coffee_roaster"](${bbox});
    nwr["cuisine"~"^(coffee_shop|coffee)$",i](${bbox});
    nwr["amenity"~"^(restaurant|fast_food)$"]["name"~"(cafe|café|cafeteria|cafetería|coffee)",i](${bbox});
    nwr["shop"="bakery"]["name"~"(cafe|café|cafeteria|cafetería|coffee)",i](${bbox});
  );out center tags qt;`;
};

const fetchJson = async (url, options = {}, timeoutMs = 45000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const fetchBox = async (box, offset) => {
  const errors = [];
  for (let attempt = 0; attempt < ENDPOINTS.length; attempt += 1) {
    const endpoint = ENDPOINTS[(offset + attempt) % ENDPOINTS.length];
    try {
      const payload = await fetchJson(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'CoffeeMapMerida/1.0',
        },
        body: new URLSearchParams({ data: queryFor(box) }),
      }, 60000);
      if (!Array.isArray(payload.elements) || payload.elements.length === 0) {
        throw new Error('respuesta vacía');
      }
      return payload;
    } catch (error) {
      const detail = String(error.message || 'error desconocido')
        .split(/\r?\n/)
        .filter(Boolean)
        .at(-1);
      errors.push(`${endpoint}: ${detail}`);
    }
  }
  throw new Error(errors.join(' | '));
};

const textOnly = (value) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .trim();

const reusableLicense = (license) => /^(CC0|CC BY(?:-SA)?|Public domain|PD)/i.test(license || '');
const imageCache = new Map();

const wikidataImage = async (id) => {
  if (!/^Q\d+$/.test(id || '')) return null;
  const params = new URLSearchParams({ action: 'wbgetclaims', entity: id, property: 'P18', format: 'json', origin: '*' });
  const payload = await fetchJson(`https://www.wikidata.org/w/api.php?${params}`, {}, 20000).catch(() => null);
  const filename = payload?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return filename ? `File:${filename}` : null;
};

const commonsImage = async (tags = {}) => {
  const reference = String(tags.wikimedia_commons || tags.image || '');
  let title = /^File:/i.test(reference) ? reference : null;
  if (!title && tags.wikidata) title = await wikidataImage(tags.wikidata);
  if (!title) return {};
  if (imageCache.has(title)) return imageCache.get(title);

  const request = (async () => {
    const params = new URLSearchParams({
      action: 'query', format: 'json', origin: '*', prop: 'imageinfo', titles: title,
      iiprop: 'url|extmetadata', iiurlwidth: '1200', iiextmetadatalanguage: 'es',
    });
    const payload = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`, {}, 20000);
    const page = Object.values(payload.query?.pages || {})[0];
    const info = page?.imageinfo?.[0];
    const metadata = info?.extmetadata || {};
    const license = textOnly(metadata.LicenseShortName?.value);
    if (!info || !reusableLicense(license)) return {};
    return {
      image_url: info.thumburl || info.url,
      image_source_url: info.descriptionurl || null,
      image_attribution: textOnly(metadata.Artist?.value || metadata.Credit?.value || 'Wikimedia Commons'),
      image_license: license,
    };
  })().catch(() => ({}));
  imageCache.set(title, request);
  return request;
};

const confidence = (tags = {}) => (
  tags.amenity === 'cafe'
  || tags.shop === 'coffee'
  || tags.craft === 'coffee_roaster'
  || /^(coffee_shop|coffee)$/i.test(tags.cuisine || '')
    ? 'active'
    : 'needs_review'
);

const address = (tags = {}) => {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  return [street, tags['addr:suburb'] || tags['addr:neighbourhood'], tags['addr:city']].filter(Boolean).join(', ') || null;
};
const neighborhood = (tags = {}) => tags['addr:suburb'] || tags['addr:neighbourhood'] || null;

const enrichExistingOsm = async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Faltan las variables públicas de Supabase.');

  const rows = await fetchJson(
    `${supabaseUrl}/rest/v1/cafes?select=id,source_id&source=eq.osm&limit=1000`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
    20000,
  );

  const byType = new Map();
  rows.forEach((row) => {
    const [type, id] = String(row.source_id || '').split('/');
    if (!/^(node|way)$/.test(type) || !/^\d+$/.test(id || '')) return;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(id);
  });

  const elements = new Map();
  for (const [type, ids] of byType) {
    const plural = `${type}s`;
    const payload = await fetchJson(
      `https://api.openstreetmap.org/api/0.6/${plural}.json?${plural}=${ids.join(',')}`,
      { headers: { Accept: 'application/json', 'User-Agent': 'CoffeeMapMerida/1.0' } },
      30000,
    );
    payload.elements?.forEach((element) => elements.set(`${element.type}/${element.id}`, element));
  }

  const cafes = [];
  for (const row of rows) {
    const element = elements.get(row.source_id);
    if (!element) continue;
    const tags = element.tags || {};
    cafes.push({
      id: row.id,
      address: address(tags),
      neighborhood: neighborhood(tags),
      ...(await commonsImage(tags)),
      last_verified_at: new Date().toISOString(),
    });
  }

  return { cafes, failed: [], zones: byType.size };
};

const scan = async () => {
  const grid = process.argv.includes('--whole') ? boxes(1, 1) : boxes(4, 4);
  const elements = [];
  const failed = [];
  const concurrency = 4;
  for (let start = 0; start < grid.length; start += concurrency) {
    const batch = grid.slice(start, start + concurrency);
    const results = await Promise.all(batch.map(async (box, batchIndex) => {
      const index = start + batchIndex;
      try {
        return { elements: (await fetchBox(box, index)).elements || [] };
      } catch (error) {
        return { error: { zone: index + 1, error: error.message } };
      }
    }));
    results.forEach((result) => {
      if (result.error) failed.push(result.error);
      else elements.push(...result.elements);
    });
    if (start + concurrency < grid.length) {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }

  const byId = new Map();
  elements.forEach((element) => {
    const tags = element.tags || {};
    const lat = Number(element.lat ?? element.center?.lat);
    const lng = Number(element.lon ?? element.center?.lon);
    const nombre = tags.name || tags.brand;
    if (!nombre || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const sourceId = `${element.type}/${element.id}`;
    byId.set(`osm:${element.type}:${element.id}`, {
      id: `osm:${element.type}:${element.id}`,
      nombre,
      lat,
      lng,
      rating: null,
      reviews: 0,
      link: `https://www.openstreetmap.org/${sourceId}`,
      image_url: null,
      image_source_url: null,
      image_attribution: null,
      image_license: null,
      address: address(tags),
      neighborhood: neighborhood(tags),
      source: 'osm',
      source_id: sourceId,
      source_url: `https://www.openstreetmap.org/${sourceId}`,
      status: confidence(tags),
      last_verified_at: new Date().toISOString(),
      tags,
    });
  });

  const cafes = [];
  for (const cafe of byId.values()) {
    const { tags, ...row } = cafe;
    cafes.push({ ...row, ...(await commonsImage(tags)) });
  }
  return { cafes, failed, zones: grid.length };
};

const result = process.argv.includes('--existing') ? await enrichExistingOsm() : await scan();
if (process.argv.includes('--enrichment')) {
  result.cafes = result.cafes
    .filter((cafe) => cafe.address || cafe.image_url)
    .map((cafe) => ({
      id: cafe.id,
      address: cafe.address,
      neighborhood: cafe.neighborhood || null,
      image_url: cafe.image_url || null,
      image_source_url: cafe.image_source_url || null,
      image_attribution: cafe.image_attribution || null,
      image_license: cafe.image_license || null,
      last_verified_at: cafe.last_verified_at,
    }));
}
const partArg = process.argv.find((value) => value.startsWith('--part='));
if (partArg) {
  const [part, total] = partArg.slice('--part='.length).split('/').map(Number);
  if (!Number.isInteger(part) || !Number.isInteger(total) || total < 1 || part < 0 || part >= total) {
    throw new Error('Formato inválido. Usa --part=0/3.');
  }
  result.cafes = result.cafes.filter((_, index) => index % total === part);
  result.part = { part, total };
}
console.log(`SCAN_RESULT=${JSON.stringify(result)}`);
