const COORDINATE_PATTERN = '(-?\\d+(?:\\.\\d+)?)';
const MERIDA_BOUNDS = { south: 20.86, west: -89.75, north: 21.08, east: -89.52 };

const toCoordinatePair = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const isMeridaCoordinate = ({ lat, lng }) => (
  lat >= MERIDA_BOUNDS.south
  && lat <= MERIDA_BOUNDS.north
  && lng >= MERIDA_BOUNDS.west
  && lng <= MERIDA_BOUNDS.east
);

const getCoordinatesFromHtml = (html) => {
  const patterns = [
    new RegExp(`center(?:=|:|%3D|%3A)${COORDINATE_PATTERN}(?:,|%2C)${COORDINATE_PATTERN}`, 'i'),
    new RegExp(`!3d${COORDINATE_PATTERN}!4d${COORDINATE_PATTERN}`, 'i'),
    new RegExp(`3d${COORDINATE_PATTERN}[!&,]4d${COORDINATE_PATTERN}`, 'i'),
    new RegExp(`@${COORDINATE_PATTERN},${COORDINATE_PATTERN}`),
    new RegExp(`(?:\\"lat\\"|lat)\\s*[:=]\\s*${COORDINATE_PATTERN}[^\\d]+(?:\\"lng\\"|lng|lon)\\s*[:=]\\s*${COORDINATE_PATTERN}`, 'i'),
  ];

  for (const pattern of patterns) {
    const globalPattern = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
    for (const match of html.matchAll(globalPattern)) {
      const coordinates = toCoordinatePair(match[1], match[2]);
      if (coordinates && isMeridaCoordinate(coordinates)) return coordinates;
    }
  }
  return null;
};

const getCoordinatesFromUrl = (value) => {
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
  const patterns = [
    new RegExp(`!3d${COORDINATE_PATTERN}!4d${COORDINATE_PATTERN}`, 'i'),
    new RegExp(`3d${COORDINATE_PATTERN}[!&,]${COORDINATE_PATTERN}`, 'i'),
    new RegExp(`!2d${COORDINATE_PATTERN}!3d${COORDINATE_PATTERN}`, 'i'),
    new RegExp(`@${COORDINATE_PATTERN},${COORDINATE_PATTERN}`, 'i'),
    new RegExp(`(?:[?&](?:q|query|ll|destination|daddr)=)${COORDINATE_PATTERN}[,+\\s]+${COORDINATE_PATTERN}`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    const isLongitudeFirst = pattern.source.startsWith('!2d');
    const coordinates = match && toCoordinatePair(
      isLongitudeFirst ? match[2] : match[1],
      isLongitudeFirst ? match[1] : match[2],
    );
    if (coordinates) return coordinates;
  }
  return null;
};

const isAllowedMapsHost = (hostname) => (
  hostname === 'maps.app.goo.gl'
  || hostname === 'goo.gl'
  || hostname === 'maps.google.com'
  || hostname === 'google.com'
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

  if (!isAllowedMapsHost(mapsUrl.hostname) || !['http:', 'https:'].includes(mapsUrl.protocol) || mapsUrl.username || mapsUrl.password || mapsUrl.port) {
    response.status(400).json({ error: 'Unsupported Maps host.' });
    return;
  }

  const isShortLink = mapsUrl.hostname === 'maps.app.goo.gl' || mapsUrl.hostname === 'goo.gl';
  const isMapsPath = mapsUrl.pathname === '/maps' || mapsUrl.pathname.startsWith('/maps/');
  const isMapsHost = mapsUrl.hostname === 'maps.google.com';
  const hasPlaceQuery = ['query', 'q', 'destination', 'daddr'].some((key) => mapsUrl.searchParams.has(key));
  if (!isShortLink && !isMapsHost && (!isMapsPath || (!hasPlaceQuery && !mapsUrl.pathname.includes('/place/')))) {
    response.status(400).json({ error: 'Maps URL does not identify a place.' });
    return;
  }

  try {
    // Read each redirect before loading the destination page. Google may block
    // that page even though its Location header already identifies the place.
    let currentUrl = mapsUrl;
    let coordinates = null;
    const signal = AbortSignal.timeout(12000);
    for (let hop = 0; hop < 8; hop += 1) {
      if (!isAllowedMapsHost(currentUrl.hostname) || !['http:', 'https:'].includes(currentUrl.protocol) || currentUrl.username || currentUrl.password || currentUrl.port) break;
      coordinates = getCoordinatesFromUrl(currentUrl.href);
      if (coordinates) break;
      const result = await fetch(currentUrl, {
        redirect: 'manual', signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Coffee-Map/1.0)' },
      });
      const redirect = result.headers.get('location');
      if (result.status >= 300 && result.status < 400 && redirect) {
        await result.body?.cancel();
        currentUrl = new URL(redirect, currentUrl);
        continue;
      }
      if (!result.ok) { await result.body?.cancel(); break; }
      const html = await result.text();
      coordinates = getCoordinatesFromHtml(html);
      break;
    }
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
