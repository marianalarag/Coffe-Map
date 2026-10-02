const COORDINATE_PATTERN = '(-?\\d+(?:\\.\\d+)?)';

const toCoordinatePair = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
};

const decodeMapLink = (value) => {
  try {
    return decodeURIComponent(String(value || '').replaceAll('+', ' '));
  } catch {
    return String(value || '');
  }
};

export const extractGoogleMapsCoordinates = (value) => {
  const link = decodeMapLink(value);
  if (!link) return null;

  const patterns = [
    new RegExp(`@${COORDINATE_PATTERN},\\s*${COORDINATE_PATTERN}`),
    new RegExp(`!3d${COORDINATE_PATTERN}!4d${COORDINATE_PATTERN}`),
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
  const coordinatesFromMapLink = extractGoogleMapsCoordinates(
    cafe?.link || cafe?.source_url || cafe?.sourceUrl,
  );
  if (coordinatesFromMapLink) return coordinatesFromMapLink;

  return toCoordinatePair(cafe?.lat, cafe?.lng);
};
