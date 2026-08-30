const STREET_PATTERN = /^(c\.?|calle|av\.?|avenida|carretera|perif[eé]rico|km\b|prolongaci[oó]n|\d)/i;
const CITY_PATTERN = /^(m[eé]rida|yucat[aá]n|yuc\.?|m[eé]xico|97\d{3}(?:\s+m[eé]rida)?|m[eé]rida\s+97\d{3})$/i;
const NEIGHBORHOOD_PATTERN = /\b(col\.?|colonia|fracc\.?|fraccionamiento|barrio|residencial|centro|santiago|montebello|altabrisa|cholul|temoz[oó]n|campestre|garc[ií]a gin[eé]s|itizm[ná]a)\b/i;
const CITY_ONLY_PATTERN = /^m[eé]rida(?:,?\s*yucat[aá]n)?$/i;

const cleanNeighborhood = (value) => String(value || '')
  .replace(/^(col\.?|colonia|fracc\.?|fraccionamiento)\s*/i, '')
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

export const getCafeFullAddress = (cafe) => cafe?.address?.trim() || 'Dirección no disponible';
