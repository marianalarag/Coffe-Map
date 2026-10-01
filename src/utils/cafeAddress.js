const STREET_PATTERN = /^(c\.?|calle|av\.?|avenida|carretera|perif[eé]rico|km\b|prolongaci[oó]n|\d)/i;
const CITY_PATTERN = /^(m[eé]rida|yucat[aá]n|yuc\.?|m[eé]xico|97\d{3}(?:\s+m[eé]rida)?|m[eé]rida\s+97\d{3})$/i;
const NEIGHBORHOOD_PATTERN = /\b(col\.?|colonia|fracc\.?|fraccionamiento|barrio|residencial|centro|santiago|montebello|altabrisa|cholul|temoz[oó]n|campestre|garc[ií]a gin[eé]s|itizm[ná]a)\b/i;
const CITY_ONLY_PATTERN = /^m[eé]rida(?:,?\s*yucat[aá]n)?$/i;

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

// Keep the detailed neighborhood for profile cards, but group small
// subdivisions into recognizable areas for the map filter.
export const getCafeZone = (cafe) => {
  const neighborhood = getCafeNeighborhood(cafe);
  const value = neighborhood
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (value.includes('garcia gineres')) return 'García Ginerés';
  if (value.includes('colonia mexico') || value === 'mexico') return 'Colonia México';
  if (value.includes('itzimna')) return 'Itzimná';
  if (value.includes('centro') || /^(santiago|san juan|mejorada|ermita|san sebastian)$/.test(value)) return 'Centro';
  if (value.includes('cholul') || value.includes('temozon') || value.includes('conkal')) return 'Norte / Cholul';
  if (value.includes('altabrisa') || value.includes('montebello') || value.includes('vista alegre') || value.includes('camara de comercio') || value.includes('san antonio cucul') || value.includes('gonzalo guerrero') || value.includes('montereal')) return 'Noreste';
  if (value.includes('campestre') || value.includes('chuburna') || value.includes('francisco de montejo') || value.includes('xcumpich') || value.includes('dzitya') || value.includes('caucel') || value.includes('las americas')) return 'Poniente';
  if (value.includes('kanasin') || value.includes('los heroes') || value.includes('revolucion') || value.includes('ferrocarrilera')) return 'Oriente';
  if (value.includes('sur') || value.includes('san jose tecoh') || value.includes('xoclan')) return 'Sur';

  // Some records only say "Mérida". Use their coordinates so they do not
  // produce one-off filters of their own.
  const lat = Number(cafe?.lat);
  const lng = Number(cafe?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    if (lat >= 21.005 && lng >= -89.635) return 'Noreste';
    if (lat >= 21.005 && lng < -89.635) return 'Poniente';
    if (lat < 20.95) return 'Sur';
    if (lng >= -89.59) return 'Oriente';
  }

  return 'Centro';
};

export const getCafeFullAddress = (cafe) => cafe?.address?.trim() || 'Dirección no disponible';
