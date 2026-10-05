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

const ZONE_ADDRESS_PARTS = (cafe) => String(cafe?.address || '')
  .split(',')
  .map((part) => part.trim())
  .filter((part) => part && !CITY_PATTERN.test(part));

// Map filters use recognizable areas instead of every subdivision returned by
// OpenStreetMap or Overture. Only neighborhood/address segments are searched;
// this deliberately excludes the country name "México" from the full address.
export const getCafeZone = (cafe) => {
  const neighborhood = getCafeNeighborhood(cafe);
  const normalizedNeighborhood = neighborhood
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const value = `${neighborhood} ${ZONE_ADDRESS_PARTS(cafe).join(' ')}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/paseo\s+de\s+montejo|paseo\s+montejo|\bmontejo\b/.test(value)) return 'Paseo de Montejo';
  if (/garcia\s+gineres/.test(value)) return 'García Ginerés';
  if (normalizedNeighborhood === 'mexico' || /colonia\s+mexico|col\.?\s+mexico/.test(value)) return 'Colonia México';
  if (/itzimna/.test(value)) return 'Itzimná';
  if (/temozon\s+norte|temozon/.test(value)) return 'Temozón';
  if (/san\s+pedro\s+cholul/.test(value)) return 'San Pedro Cholul';
  if (/cholul/.test(value)) return 'Cholul';
  if (/santa\s+gertrudis\s+cop[oó]/.test(value)) return 'Santa Gertrudis Copó';
  if (/montebello/.test(value)) return 'Montebello';
  if (/montes\s+de\s+ame/.test(value)) return 'Montes de Amé';
  if (/san\s+ramon\s+norte/.test(value)) return 'San Ramón Norte';
  if (/san\s+ramon\s+sur/.test(value)) return 'San Ramón Sur';
  if (/altabrisa|san\s+antonio\s+cucul/.test(value)) return 'Altabrisa';
  if (/centro|santiago|san\s+juan|mejorada|ermita|san\s+sebastian/.test(value)) return 'Centro';
  if (/campestre/.test(value)) return 'Campestre';
  if (/chuburna/.test(value)) return 'Chuburná';
  if (/las\s+americas/.test(value)) return 'Las Américas';
  if (/francisco\s+de\s+montejo/.test(value)) return 'Francisco de Montejo';
  if (/dzitya/.test(value)) return 'Dzityá';
  if (/xcumpich/.test(value)) return 'Xcumpich';
  if (/caucel|ciudad\s+caucel/.test(value)) return 'Caucel';
  if (/yucatan\s+country/.test(value)) return 'Yucatán Country';
  if (/mulsay/.test(value)) return 'Mulsay';
  if (/los\s+pinos|brisas/.test(value)) return 'Los Pinos / Brisas';
  if (/poligono\s+108/.test(value)) return 'Polígono 108';
  if (/poniente/.test(value)) return 'Poniente';

  // A provider will often return only "Mérida" for the neighborhood. In that
  // case, use small, recognizable map areas instead of assigning every cafe
  // in the city to Centro. These envelopes intentionally overlap a little;
  // the explicit address/neighborhood rules above always win first.
  const lat = Number(cafe?.lat);
  const lng = Number(cafe?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= 20.988 && lat <= 21.025 && lng >= -89.642 && lng <= -89.590) {
    return 'Colonia México';
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= 20.952 && lat <= 20.985 && lng >= -89.638 && lng <= -89.606) {
    return 'Centro';
  }

  return 'Otras zonas';
};

export const getCafeFullAddress = (cafe) => cafe?.address?.trim() || 'Dirección no disponible';
