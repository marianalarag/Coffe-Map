import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error('Faltan las variables públicas de Supabase.');

const fetchJson = async (url, options = {}, timeoutMs = 20000) => {
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

const publicRows = await fetchJson(
  `${supabaseUrl}/rest/v1/cafes?select=id,lat,lng,address,neighborhood&or=(address.is.null,neighborhood.is.null)&order=nombre&limit=500`,
  { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
);

const rowsArg = process.argv.find((value) => value.startsWith('--rows-base64='));
const readRowsFromStdin = async () => {
  const { createInterface } = await import('node:readline');
  const input = createInterface({ input: process.stdin, terminal: false });
  return new Promise((resolve, reject) => {
    input.once('line', (line) => {
      try { resolve(JSON.parse(line)); } catch (error) { reject(error); }
      input.close();
    });
  });
};
const rows = process.argv.includes('--rows-stdin')
  ? await readRowsFromStdin()
  : rowsArg
    ? JSON.parse(Buffer.from(rowsArg.slice('--rows-base64='.length), 'base64url').toString('utf8'))
    : publicRows;

const getAddressDetails = (result) => {
  const address = result.address || {};
  const street = [address.road || address.pedestrian, address.house_number].filter(Boolean).join(' ');
  const locality = address.neighbourhood || address.suburb || address.quarter || address.city_district || address.village || address.hamlet
    || (address.postcode === '97000' ? 'Centro' : null);
  const city = address.city || address.town || address.municipality;
  return {
    address: [...new Set([street, locality, city, address.state, address.postcode].filter(Boolean))].join(', ') || null,
    neighborhood: locality || null,
  };
};

const inferNeighborhoodFromAddress = (value) => {
  const parts = String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
  return parts.find((part) => /\b(col\.?|colonia|fracc\.?|fraccionamiento|barrio|residencial|centro|santiago|temoz[oó]n)\b/i.test(part)) || null;
};

const updates = [];
for (const [index, row] of rows.entries()) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(row.lat),
    lon: String(row.lng),
    zoom: '18',
    addressdetails: '1',
  });
  const result = await fetchJson(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CoffeeMapMerida/1.0 (address enrichment)',
    },
  }).catch(() => null);
  const details = result ? getAddressDetails(result) : null;
  if (details?.address || details?.neighborhood) updates.push({
    id: row.id,
    address: row.address || details.address,
    neighborhood: row.neighborhood || inferNeighborhoodFromAddress(row.address || details.address) || details.neighborhood || 'Mérida',
  });
  if (index < rows.length - 1) await new Promise((resolve) => setTimeout(resolve, 1100));
}

console.log(`ADDRESS_RESULT=${JSON.stringify({ updates, requested: rows.length })}`);
