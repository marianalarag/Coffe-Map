const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Match brand names, not generic words such as "coffee" or "italian".
export const CAFE_CHAINS = [
  { id: 'starbucks', label: 'Starbucks', pattern: /\bstar\s*bucks\b/ },
  { id: 'italian-coffee', label: 'Italian Coffee', pattern: /\bitalian\s+coffee\b/ },
  { id: 'tim-hortons', label: 'Tim Hortons', pattern: /\btim\s*hou?rtons?\b/ },
  { id: 'dunkin', label: 'Dunkin', pattern: /\bdunkin\b/ },
  { id: 'krispy-kreme', label: 'Krispy Kreme', pattern: /\bkrispy\s+kreme\b/ },
  { id: 't-bar', label: 'T Bar', pattern: /\bt\s*bar\b/ },
  { id: 'mccafe', label: 'McCafé', pattern: /\bmc\s*cafe\b/ },
];

export function getCafeChain(cafe) {
  const name = normalize(cafe.brand || cafe.nombre);
  return CAFE_CHAINS.find((chain) => chain.pattern.test(name))?.id
    || CAFE_CHAINS.find((chain) => chain.pattern.test(normalize(cafe.nombre)))?.id
    || null;
}

export function isCafeVisibleWithChains(cafe, hiddenChains) {
  return !hiddenChains.includes(getCafeChain(cafe));
}
