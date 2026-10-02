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
    new RegExp(`@${COORDINATE_PATTERN},\\s*${COORDINATE_PATTERN}`),
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

export const getCafeCoordinates = (cafe) => {
  // Community submissions are geocoded from their address before saving.
  // Their stored coordinates must win over an old/current-location link.
  if (cafe?.source === 'community') {
    const storedCoordinates = toCoordinatePair(cafe?.lat, cafe?.lng);
    if (storedCoordinates) return storedCoordinates;
  }

  const coordinatesFromMapLink = extractGoogleMapsCoordinates(
    cafe?.link || cafe?.source_url || cafe?.sourceUrl,
  );
  if (coordinatesFromMapLink) return coordinatesFromMapLink;

  return toCoordinatePair(cafe?.lat, cafe?.lng);
};

export const geocodeCafeAddress = async (address) => {
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
