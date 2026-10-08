const COORDINATE_PATTERN = '(-?\\d+(?:\\.\\d+)?)';

const toCoordinatePair = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
};

const decodeMapLink = (value) => {
  let decoded = String(value || '').replaceAll('+', ' ');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
};

export const extractGoogleMapsCoordinates = (value) => {
  const link = decodeMapLink(value);
  if (!link) return null;

  const patterns = [
    new RegExp(`!3d${COORDINATE_PATTERN}!4d${COORDINATE_PATTERN}`),
    new RegExp(`3d${COORDINATE_PATTERN}[!&,]4d${COORDINATE_PATTERN}`),
    new RegExp(`@${COORDINATE_PATTERN},\\s*${COORDINATE_PATTERN}`),
    new RegExp(`(?:[?&](?:q|query|ll|destination|daddr)=)${COORDINATE_PATTERN}[,+\\s]+${COORDINATE_PATTERN}`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = link.match(pattern);
    const coordinates = match && toCoordinatePair(match[1], match[2]);
    if (coordinates) return coordinates;
  }

  return null;
};

const extractExplicitGoogleMapsCoordinates = (value) => {
  const link = decodeMapLink(value);
  if (!link) return null;
  const patterns = [
    new RegExp(`!3d${COORDINATE_PATTERN}!4d${COORDINATE_PATTERN}`),
    new RegExp(`3d${COORDINATE_PATTERN}[!&,]4d${COORDINATE_PATTERN}`),
    new RegExp(`(?:[?&](?:q|query|ll|destination|daddr)=)${COORDINATE_PATTERN}[,+\\s]+${COORDINATE_PATTERN}`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = link.match(pattern);
    const coordinates = match && toCoordinatePair(match[1], match[2]);
    if (coordinates) return coordinates;
  }
  return null;
};

export const extractGoogleMapsSearchQuery = (value) => {
  const link = decodeMapLink(value);
  if (!link) return null;

  try {
    const url = new URL(link);
    const query = url.searchParams.get('query')
      || url.searchParams.get('q')
      || url.searchParams.get('destination')
      || url.searchParams.get('daddr');
    if (query && !extractGoogleMapsCoordinates(query)) return query.trim();
  } catch {
    // Some Maps links are not valid URL strings until their redirect runs.
  }

  const placeMatch = link.match(/\/maps\/(?:place|search)\/([^/@?]+)/i);
  return placeMatch?.[1]?.replaceAll('+', ' ').trim() || null;
};

export const getCafeCoordinates = (cafe) => {
  const storedCoordinates = toCoordinatePair(cafe?.lat, cafe?.lng);
  // Community and manually verified rows already contain the coordinates
  // approved for that cafe. Do not replace them with an @lat,lng viewport
  // that Google may include in a share URL.
  if (storedCoordinates && ['community', 'manual'].includes(cafe?.source)) return storedCoordinates;

  const coordinatesFromMapLink = [cafe?.link, cafe?.source_url, cafe?.sourceUrl]
    .map(extractGoogleMapsCoordinates)
    .find(Boolean);
  if (coordinatesFromMapLink) return coordinatesFromMapLink;

  return storedCoordinates;
};

const geocodeAddressOnce = async (address) => {
  const cleanAddress = String(address || '').trim();
  if (!cleanAddress) return null;

  const merida = ['M', String.fromCharCode(0xe9), 'rida, Yucat', String.fromCharCode(0xe1), 'n, M', String.fromCharCode(0xe9), 'xico'].join('');
  const params = new URLSearchParams({
    q: `${cleanAddress}, ${merida}`,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '1',
    countrycodes: 'mx',
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { Accept: 'application/json', 'Accept-Language': 'es' },
  });
  if (!response.ok) throw new Error('No se pudo ubicar la direccion.');

  const [result] = await response.json();
  const coordinates = toCoordinatePair(result?.lat, result?.lon);
  if (!coordinates) return null;

  return {
    ...coordinates,
    neighborhood: result.address?.suburb
      || result.address?.neighbourhood
      || result.address?.quarter
      || result.address?.city_district
      || null,
  };
};

export const geocodeCafeAddress = async (address) => {
  const cleanAddress = String(address || '').trim();
  if (!cleanAddress) return null;

  const expandedAddress = cleanAddress
    .replace(/\bC\.\s*/gi, 'Calle ')
    .replace(/\bAv\.\s*/gi, 'Avenida ')
    .replace(/\bCol\.\s*/gi, 'Colonia ');
  const variants = [...new Set([
    cleanAddress,
    expandedAddress,
    expandedAddress.replace(/\s+III\b/gi, ''),
  ])];

  for (const variant of variants) {
    try {
      const location = await geocodeAddressOnce(variant);
      if (location) return location;
    } catch {
      // Try the next normalized form.
    }
  }

  return null;
};

const resolveGoogleMapsLink = async (link) => {
  if (!link || typeof window === 'undefined') return null;
  try {
    const mapsUrl = new URL(link);
    const isShortLink = mapsUrl.hostname === 'maps.app.goo.gl' || mapsUrl.hostname === 'goo.gl';
    const isPlaceLink = mapsUrl.pathname.includes('/maps/place/');
    if (!isShortLink && !isPlaceLink) return null;
  } catch {
    return null;
  }
  try {
    const response = await fetch(`/api/maps-location?url=${encodeURIComponent(link)}`);
    if (!response.ok) return null;
    const payload = await response.json();
    return toCoordinatePair(payload?.lat, payload?.lng);
  } catch {
    return null;
  }
};

export const geocodeCafeLocation = async (cafe) => {
  const mapLinks = [cafe?.link, cafe?.source_url, cafe?.sourceUrl].filter(Boolean);
  const coordinatesFromMapLink = mapLinks.map(extractExplicitGoogleMapsCoordinates).find(Boolean);
  if (coordinatesFromMapLink) return coordinatesFromMapLink;

  for (const mapLink of mapLinks) {
    const resolvedCoordinates = await resolveGoogleMapsLink(mapLink);
    if (resolvedCoordinates) return resolvedCoordinates;
  }

  const mapQuery = mapLinks.map(extractGoogleMapsSearchQuery).find(Boolean);
  for (const searchText of [mapQuery, cafe?.address]) {
    if (!searchText) continue;
    try {
      const location = await geocodeCafeAddress(searchText);
      if (location) return location;
    } catch {
      // Try the next available source before falling back to stored data.
    }
  }

  // @lat,lng is only a last resort. It can represent the map viewport rather
  // than the business, so address/query resolution must win first.
  return mapLinks.map(extractGoogleMapsCoordinates).find(Boolean) || null;
};
