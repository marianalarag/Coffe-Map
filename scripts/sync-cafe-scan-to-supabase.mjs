import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { areDuplicateCafes } from '../src/utils/cafeDeduplication.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Configura VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para sincronizar.');
}

const request = async (path, options = {}) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${body}`);
  return body ? JSON.parse(body) : null;
};

const loadExistingCafes = async () => {
  const cafes = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await request(`cafes?select=id,nombre,lat,lng,source,source_id&offset=${offset}&limit=1000`);
    const results = page || [];
    cafes.push(...results);
    if (results.length < 1000) return cafes;
  }
};

const scan = JSON.parse(await readFile(new URL('../src/data/openCafeScan.json', import.meta.url), 'utf8'));
const existing = await loadExistingCafes();
const comparison = [...existing];
const accepted = [];
const skipped = [];
const matchedExisting = [];

for (const candidate of scan.cafes) {
  const sameRecord = comparison.some((current) => current.id === candidate.id);
  if (sameRecord) {
    matchedExisting.push(candidate);
    continue;
  }
  const duplicate = !sameRecord && comparison.some((current) => areDuplicateCafes(current, candidate));
  if (duplicate) {
    skipped.push(candidate);
    continue;
  }
  accepted.push(candidate);
  if (!sameRecord) comparison.push(candidate);
}

const cafeColumns = [
  'id', 'nombre', 'lat', 'lng', 'rating', 'reviews', 'link',
  'image_url', 'image_source_url', 'image_attribution', 'image_license',
  'address', 'neighborhood', 'source', 'source_id', 'source_url',
  'status', 'last_verified_at',
];
const toCafeRow = (cafe) => Object.fromEntries(cafeColumns.map((column) => [column, cafe[column] ?? null]));

for (let index = 0; index < accepted.length; index += 100) {
  await request('cafes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(accepted.slice(index, index + 100).map(toCafeRow)),
  });
}

console.log(JSON.stringify({
  scanned: scan.cafes.length,
  existing: existing.length,
  created: accepted.length,
  matchedExisting: matchedExisting.length,
  skippedAsDuplicate: skipped.length,
  inserted: accepted.length,
}, null, 2));
