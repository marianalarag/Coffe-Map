const COORDINATE_PATTERN = '(-?\\d+(?:\\.\\d+)?)';

const toCoordinatePair = (latitude, longitude) => {
  if (latitude == null || longitude == null || String(latitude).trim() === '' || String(longitude).trim() === '') return null;
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

const isGoogleMapsHost = (hostname) => (
  hostname === 'maps.app.goo.gl'
  || hostname === 'goo.gl'
  || hostname === 'maps.google.com'
  || hostname === 'google.com'
  || hostname === 'www.google.com'
  || hostname.endsWith('.google.com')
);

export const isGoogleMapsLink = (value) => {
  try {
    const cleanValue = String(value || '').trim();
    const candidate = /^https?:\/\//i.test(cleanValue) ? cleanValue : `https://${cleanValue}`;
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) && isGoogleMapsHost(url.hostname)
      && (url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl' || url.hostname === 'maps.google.com' || url.pathname.includes('/maps'));
  } catch {
    return false;
  }
};

export const normalizeGoogleMapsLink = (value) => {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return '';
  const candidate = /^https?:\/\//i.test(cleanValue) ? cleanValue : `https://${cleanValue}`;
  return isGoogleMapsLink(candidate) ? candidate : cleanValue;
};

export const extractGoogleMapsCoordinates = (value) => {
  const link = decodeMapLink(value);
  if (!link) return null;

  const patterns = [
    new RegExp(`!3d${COORDINATE_PATTERN}!4d${COORDINATE_PATTERN}`),
    new RegExp(`3d${COORDINATE_PATTERN}[!&,]4d${COORDINATE_PATTERN}`),
    new RegExp(`!2d${COORDINATE_PATTERN}!3d${COORDINATE_PATTERN}`),
    new RegExp(`@${COORDINATE_PATTERN},\\s*${COORDINATE_PATTERN}`),
    new RegExp(`(?:[?&](?:q|query|ll|destination|daddr)=)${COORDINATE_PATTERN}[,+\\s]+${COORDINATE_PATTERN}`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = link.match(pattern);
    const longitudeFirst = pattern.source.startsWith('!2d');
    const coordinates = match && toCoordinatePair(match[longitudeFirst ? 2 : 1], match[longitudeFirst ? 1 : 2]);
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
    new RegExp(`!2d${COORDINATE_PATTERN}!3d${COORDINATE_PATTERN}`),
    new RegExp(`(?:[?&](?:q|query|ll|destination|daddr)=)${COORDINATE_PATTERN}[,+\\s]+${COORDINATE_PATTERN}`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = link.match(pattern);
    const longitudeFirst = pattern.source.startsWith('!2d');
    const coordinates = match && toCoordinatePair(match[longitudeFirst ? 2 : 1], match[longitudeFirst ? 1 : 2]);
    if (coordinates) return coordinates;
  }
  return null;
};

export const extractGoogleMapsSearchQuery = (value) => {
  const link = decodeMapLink(value);
  if (!link) return null;

  if (!isGoogleMapsLink(link)) return null;

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
  if (storedCoordinates && cafe?.source === 'manual') return storedCoordinates;

  const coordinatesFromMapLink = [cafe?.link, cafe?.source_url, cafe?.sourceUrl]
    .filter(isGoogleMapsLink)
    .map(extractExplicitGoogleMapsCoordinates)
    .find(Boolean);
  if (coordinatesFromMapLink) return coordinatesFromMapLink;

  return storedCoordinates;
};

export const geocodeCafeLocation = async (cafe) => {
  const link = [cafe?.link, cafe?.source_url, cafe?.sourceUrl].find(isGoogleMapsLink);
  const params = new URLSearchParams();
  if (link) params.set('url', normalizeGoogleMapsLink(link));
  if (cafe?.address) params.set('address', cafe.address);
  if (cafe?.nombre) params.set('nombre', cafe.nombre);
  if (!link && !cafe?.address) return null;
  try {
    const response = await fetch(`/api/maps-location?${params}`, { signal: AbortSignal.timeout(22000) });
    if (!response.ok) return null;
    const payload = await response.json();
    return toCoordinatePair(payload?.lat, payload?.lng);
  } catch { return null; }
};
