import { readFile, writeFile } from 'node:fs/promises';

const catalogPath = new URL('../src/data/openCafeScan.json', import.meta.url);
const migrationPath = new URL('../supabase/migrations/20260912031000_import_cafe_opening_hours.sql', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const ids = { node: [], way: [], relation: [] };
catalog.cafes.forEach((cafe) => {
  const match = cafe.id.match(/^osm:(node|way|relation):(\d+)$/);
  if (match) ids[match[1]].push(match[2]);
});
const elements = [];
for (const [type, values] of Object.entries(ids)) {
  for (let index = 0; index < values.length; index += 50) {
    const batch = values.slice(index, index + 50);
    const response = await fetch(`https://api.openstreetmap.org/api/0.6/${type}s.json?${type}s=${batch.join(',')}`, {
      headers: { 'User-Agent': 'CoffeeMapMerida/1.0 (opening hours import)' },
    });
    if (!response.ok) throw new Error(`OpenStreetMap ${type}: HTTP ${response.status}`);
    const payload = await response.json();
    elements.push(...(payload.elements || []));
  }
}

const hoursById = new Map(elements.map((element) => [`osm:${element.type}:${element.id}`, element.tags?.opening_hours || null]));
let found = 0;
catalog.cafes.forEach((cafe) => {
  const hours = hoursById.get(cafe.id);
  if (!hours) return;
  cafe.opening_hours = hours;
  cafe.opening_hours_source = 'osm';
  found += 1;
});

const escapeSql = (value) => String(value).replaceAll("'", "''");
const statements = catalog.cafes.filter((cafe) => cafe.opening_hours).map((cafe) => (
  `update public.cafes set opening_hours = '${escapeSql(cafe.opening_hours)}', opening_hours_source = 'osm' where id = '${escapeSql(cafe.id)}' and opening_hours_source is distinct from 'admin';`
));
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
await writeFile(migrationPath, `-- Imported from OpenStreetMap on 2026-09-12.\n${statements.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ cafes: catalog.cafes.length, osmElements: elements.length, schedulesFound: found }));
