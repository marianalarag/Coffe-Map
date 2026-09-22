const SOURCE_PRIORITY = {
  manual: 4,
  community: 3,
  osm: 2,
  overture: 1,
};

// Some open-data names arrived after UTF-8 bytes were decoded as Latin-1 more
// than once (for example, "CafÃƒÂ©"). Decode only strings carrying those
// mojibake markers and allow two passes for doubly corrupted values.
export const repairCafeText = (value) => {
  let repaired = String(value || '');
  const windows1252Bytes = new Map([
    ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85],
    ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a],
    ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92],
    ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
    ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c],
    ['ž', 0x9e], ['Ÿ', 0x9f],
  ]);
  for (let pass = 0; pass < 2 && /[ÃÂ]/.test(repaired); pass += 1) {
    const byteValues = [...repaired].map((character) => (
      windows1252Bytes.get(character) ?? character.charCodeAt(0)
    ));
    if (byteValues.some((byte) => byte > 255)) break;
    try {
      const bytes = Uint8Array.from(byteValues);
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (decoded === repaired) break;
      repaired = decoded;
    } catch {
      break;
    }
  }
  return repaired;
};

export const normalizeCafeName = (value) => repairCafeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const compactCafeName = (value) => normalizeCafeName(value).replaceAll(' ', '');
const compactCafeAddress = (value) => normalizeCafeName(value).replaceAll(' ', '');

const GENERIC_NAME_WORDS = new Set([
  'cafe', 'cafeteria', 'coffee', 'coffe', 'coffeeshop', 'company', 'factory',
  'the', 'de', 'merida', 'mx', 'yucatan',
]);

const meaningfulNameTokens = (value) => {
  const tokens = normalizeCafeName(value).split(' ').filter(Boolean);
  const specificTokens = tokens.filter((token) => !GENERIC_NAME_WORDS.has(token));
  return specificTokens.length > 0 ? specificTokens : tokens;
};

const tokenSimilarity = (a, b) => {
  const aTokens = new Set(meaningfulNameTokens(a));
  const bTokens = new Set(meaningfulNameTokens(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / union;
};

export const distanceBetweenCafes = (a, b) => {
  const aLat = Number(a?.lat);
  const aLng = Number(a?.lng);
  const bLat = Number(b?.lat);
  const bLng = Number(b?.lng);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const toRadians = (number) => number * Math.PI / 180;
  const latitudeDelta = toRadians(bLat - aLat);
  const longitudeDelta = toRadians(bLng - aLng);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat))
    * Math.sin(longitudeDelta / 2) ** 2;

  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const areDuplicateCafes = (a, b, maximumDistanceMeters = 120) => {
  if (!a || !b || a.id === b.id) return false;
  const aSourceId = a.sourceId || a.source_id;
  const bSourceId = b.sourceId || b.source_id;
  if (a.source && b.source && a.source === b.source && aSourceId && aSourceId === bSourceId) return true;

  const aName = compactCafeName(a.nombre);
  const bName = compactCafeName(b.nombre);
  const distance = distanceBetweenCafes(a, b);
  if (!aName || !bName || distance > maximumDistanceMeters) return false;
  if (aName === bName) return true;

  // Two providers can label the same branch differently. When their points
  // are effectively identical and their normalized address agrees, treat it
  // as the same place even if the names differ.
  const aAddress = compactCafeAddress(a.address);
  const bAddress = compactCafeAddress(b.address);
  if (distance <= 8 && aAddress && bAddress && aAddress === bAddress) return true;

  // Open-data providers often add generic words or minor spelling variants
  // (for example, "Italian Coffee" / "The Italian Coffe Company"). Nearby
  // pins with the same meaningful brand tokens represent the same branch.
  return distance <= maximumDistanceMeters
    && tokenSimilarity(a.nombre, b.nombre) >= 0.75;
};

const getCafeQualityScore = (cafe) => (
  (SOURCE_PRIORITY[cafe.source] || 0) * 100
  + (cafe.imageUrl || cafe.image_url ? 20 : 0)
  + (cafe.address ? 10 : 0)
  + (cafe.link ? 5 : 0)
  + Math.min(Number(cafe.reviews || 0), 20)
);

const mergeCafeMetadata = (primary, secondary) => ({
  ...secondary,
  ...primary,
  nombre: repairCafeText(primary.nombre || secondary.nombre),
  rating: primary.rating ?? secondary.rating ?? null,
  reviews: Math.max(Number(primary.reviews || 0), Number(secondary.reviews || 0)),
  link: primary.link || secondary.link || null,
  address: primary.address || secondary.address || null,
  image_url: primary.image_url || secondary.image_url || null,
  imageUrl: primary.imageUrl || secondary.imageUrl || null,
  image_source_url: primary.image_source_url || secondary.image_source_url || null,
  imageSourceUrl: primary.imageSourceUrl || secondary.imageSourceUrl || null,
  image_attribution: primary.image_attribution || secondary.image_attribution || null,
  imageAttribution: primary.imageAttribution || secondary.imageAttribution || null,
  image_license: primary.image_license || secondary.image_license || null,
  imageLicense: primary.imageLicense || secondary.imageLicense || null,
});

export const deduplicateCafes = (cafes) => {
  const uniqueCafes = [];

  cafes.forEach((candidate) => {
    const duplicateIndex = uniqueCafes.findIndex((current) => areDuplicateCafes(current, candidate));
    if (duplicateIndex < 0) {
      uniqueCafes.push(candidate);
      return;
    }

    const current = uniqueCafes[duplicateIndex];
    const candidateWins = getCafeQualityScore(candidate) > getCafeQualityScore(current);
    uniqueCafes[duplicateIndex] = candidateWins
      ? mergeCafeMetadata(candidate, current)
      : mergeCafeMetadata(current, candidate);
  });

  return uniqueCafes;
};
