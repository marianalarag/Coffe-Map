const COORDINATE_PATTERN = '(-?\\d+(?:\\.\\d+)?)';

const toCoordinatePair = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const getCoordinatesFromHtml = (html) => {
  const patterns = [
    new RegExp(`center[=:%2C]+${COORDINATE_PATTERN}[,%]2?C?${COORDINATE_PATTERN}`, 'i'),
    new RegExp(`@${COORDINATE_PATTERN},${COORDINATE_PATTERN}`),
    new RegExp(`(?:\\"lat\\"|lat)\\s*[:=]\\s*${COORDINATE_PATTERN}[^\\d]+(?:\\"lng\\"|lng|lon)\\s*[:=]\\s*${COORDINATE_PATTERN}`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const coordinates = match && toCoordinatePair(match[1], match[2]);
    if (coordinates) return coordinates;
  }
  return null;
};

const isAllowedMapsHost = (hostname) => (
  hostname === 'maps.app.goo.gl'
  || hostname === 'goo.gl'
  || hostname === 'maps.google.com'
  || hostname === 'www.google.com'
  || hostname.endsWith('.google.com')
);

export default async function mapsLocation(request, response) {
  const rawUrl = Array.isArray(request.query?.url) ? request.query.url[0] : request.query?.url;
  if (!rawUrl) {
    response.status(400).json({ error: 'Missing Maps URL.' });
    return;
  }

  let mapsUrl;
  try {
    mapsUrl = new URL(rawUrl);
  } catch {
    response.status(400).json({ error: 'Invalid Maps URL.' });
    return;
  }

  if (!isAllowedMapsHost(mapsUrl.hostname)) {
    response.status(400).json({ error: 'Unsupported Maps host.' });
    return;
  }

  const isShortLink = mapsUrl.hostname === 'maps.app.goo.gl' || mapsUrl.hostname === 'goo.gl';
  const isPlaceLink = mapsUrl.pathname.includes('/maps/place/');
  if (!isShortLink && !isPlaceLink) {
    response.status(400).json({ error: 'Maps URL does not identify a place.' });
    return;
  }

  try {
    const result = await fetch(mapsUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Coffee-Map/1.0' },
    });
    if (!result.ok) {
      response.status(502).json({ error: 'Maps did not return a location.' });
      return;
    }
    const coordinates = getCoordinatesFromHtml(await result.text());
    if (!coordinates) {
      response.status(404).json({ error: 'Location not found in Maps response.' });
      return;
    }
    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    response.status(200).json(coordinates);
  } catch {
    response.status(502).json({ error: 'Could not resolve Maps URL.' });
  }
}
