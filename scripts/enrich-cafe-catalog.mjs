import { readFile, writeFile } from 'node:fs/promises';
import { repairCafeText } from '../src/utils/cafeDeduplication.js';

const catalogPath = new URL('../src/data/openCafeScan.json', import.meta.url);
const migrationPath = new URL('../supabase/migrations/20260912010000_clean_names_and_neighborhoods.sql', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const escapeSql = (value) => String(value).replaceAll("'", "''");

const getNeighborhood = (address = {}) => (
  address.neighbourhood
  || address.quarter
  || address.suburb
  || address.residential
  || address.city_district
  || address.village
  || address.town
  || address.city
  || null
);

const updates = [];
for (const [index, cafe] of catalog.cafes.entries()) {
  cafe.nombre = repairCafeText(cafe.nombre);
  if (cafe.address) cafe.address = repairCafeText(cafe.address);
  if (cafe.neighborhood) cafe.neighborhood = repairCafeText(cafe.neighborhood);

  if (!cafe.neighborhood || /confirmar/i.test(cafe.neighborhood)) {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', cafe.lat);
    url.searchParams.set('lon', cafe.lng);
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CoffeeMapMerida/1.0 (catalog neighborhood cleanup)' },
    });
    if (response.ok) {
      const result = await response.json();
      cafe.neighborhood = getNeighborhood(result.address) || cafe.neighborhood || null;
      cafe.address ||= result.display_name || null;
    }
    process.stdout.write(`\rGeocodificadas ${index + 1}/${catalog.cafes.length}`);
    await sleep(1100);
  }

  updates.push(cafe);
}

const sql = [
  '-- Generated from verified reverse geocoding coordinates on 2026-09-12.',
  ...updates.map((cafe) => `update public.cafes set nombre = '${escapeSql(cafe.nombre)}', address = ${cafe.address ? `'${escapeSql(cafe.address)}'` : 'address'}, neighborhood = ${cafe.neighborhood ? `'${escapeSql(cafe.neighborhood)}'` : 'neighborhood'} where id = '${escapeSql(cafe.id)}';`),
  '',
].join('\n');

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
await writeFile(migrationPath, sql, 'utf8');
console.log(`\nListas ${updates.length} actualizaciones.`);
