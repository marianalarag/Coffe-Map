const STREET_PATTERN = /^(c\.?|calle|av\.?|avenida|carretera|perif[eé]rico|km\b|prolongaci[oó]n|\d)/i;
const CITY_PATTERN = /^(m[eé]rida|yucat[aá]n|yuc\.?|m[eé]xico|97\d{3}(?:\s+m[eé]rida)?|m[eé]rida\s+97\d{3})$/i;
const NEIGHBORHOOD_PATTERN = /\b(col\.?|colonia|fracc\.?|fraccionamiento|barrio|residencial|centro|santiago|montebello|altabrisa|cholul|temoz[oó]n|campestre|garc[ií]a gin[eé]res|itzim[ná]a)\b/i;
const CITY_ONLY_PATTERN = /^m[eé]rida(?:,?\s+yucat[aá]n)?$/i;

const cleanNeighborhood = (value) => String(value || '')
  .replace(/^(colonia|col\.?|fraccionamiento|fracc\.?)\s*/i, '')
  .trim();

export const getCafeNeighborhood = (cafe) => {
  const savedNeighborhood = cleanNeighborhood(cafe?.neighborhood);
  if (savedNeighborhood && !CITY_ONLY_PATTERN.test(savedNeighborhood)) return savedNeighborhood;
  const parts = String(cafe?.address || '').split(',').map((part) => part.trim()).filter(Boolean);
  const explicit = parts.find((part) => NEIGHBORHOOD_PATTERN.test(part));
  if (explicit) return cleanNeighborhood(explicit);
  const locality = parts.find((part) => !STREET_PATTERN.test(part) && !CITY_PATTERN.test(part));
  return cleanNeighborhood(locality) || 'Colonia por confirmar';
};

// Map filters stay broad and recognizable. They should not reproduce every
// small subdivision returned by OpenStreetMap or Overture.
export const getCafeZone = (cafe) => {
  const neighborhood = getCafeNeighborhood(cafe);
  const value = `${neighborhood} ${cafe?.address || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/paseo\s+de\s+montejo|paseo\s+montejo|montejo/.test(value)) return 'Paseo de Montejo';
  if (/garcia\s+gineres/.test(value)) return 'García Ginerés';
  if (/colonia\s+mexico|col\.?\s+mexico|\bmexico\b/.test(value)) return 'Colonia México';
  if (/itzimna/.test(value)) return 'Itzimná';
  if (/temozon/.test(value)) return 'Temozón';
  if (/cholul/.test(value)) return 'Cholul';
  if (/altabrisa|montebello|san\s+antonio\s+cucul/.test(value)) return 'Altabrisa';
  if (/centro|santiago|san\s+juan|mejorada|ermita|san\s+sebastian/.test(value)) return 'Centro';
  if (/chuburna|campestre/.test(value)) return 'Chuburná';
  if (/francisco\s+de\s+montejo|caucel|dzitya|xcumpich/.test(value)) return 'Poniente';

  // Recover Centro only when the provider omitted the neighborhood. Avoid
  // guessing a cardinal zone for every other record.
  const lat = Number(cafe?.lat);
  const lng = Number(cafe?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= 20.96 && lat <= 20.995 && lng >= -89.65 && lng <= -89.59) {
    return 'Centro';
  }

  return 'Otras zonas';
};

export const getCafeFullAddress = (cafe) => cafe?.address?.trim() || 'Dirección no disponible';
