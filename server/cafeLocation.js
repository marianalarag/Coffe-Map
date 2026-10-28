const NUMBER = '(-?\\d+(?:\\.\\d+)?)';
export const isInsideMerida = ({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng)
  && lat >= 20.86 && lat <= 21.08 && lng >= -89.75 && lng <= -89.52;

const coordinates = (lat, lng) => {
  if (lat == null || lng == null || lat === '' || lng === '') return null;
  const point = { lat: Number(lat), lng: Number(lng) };
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 ? point : null;
};

export const parseMapsUrl = (value) => {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const allowed = ['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'google.com', 'www.google.com'].includes(url.hostname);
    if (!allowed || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const short = ['maps.app.goo.gl', 'goo.gl'].includes(url.hostname);
    return short || url.hostname === 'maps.google.com' || /^\/maps(?:\/|$)/.test(url.pathname) ? url : null;
  } catch { return null; }
};

export const extractPlaceCoordinates = (value) => {
  let decoded = String(value || '');
  for (let pass = 0; pass < 3; pass += 1) {
    try { decoded = decodeURIComponent(decoded); } catch { break; }
  }
  const match = decoded.match(new RegExp(`!3d${NUMBER}!4d${NUMBER}`, 'i'));
  if (match) return coordinates(match[1], match[2]);
  // @lat,lng and ll= are camera centers, not a business's location.
  const query = decoded.match(new RegExp(`[?&](?:q|query|destination|daddr)=${NUMBER}[,+\\s]+${NUMBER}`, 'i'));
  return query ? coordinates(query[1], query[2]) : null;
};

export const parsePlacePayload = (text) => {
  try {
    const data = JSON.parse(text.replace(/^\)\]\}'\s*/, ''));
    const place = data?.[6];
    // Use the place's tuple, never a viewport or a visitor's photo location.
    return coordinates(place?.[9]?.[2], place?.[9]?.[3]);
  } catch { return null; }
};

const readMaps = async (initialUrl, signal) => {
  let url = initialUrl;
  for (let hop = 0; hop < 8; hop += 1) {
    url = parseMapsUrl(url.href);
    if (!url) return null;
    const point = extractPlaceCoordinates(url.href);
    if (point) return { ...point, sourceUrl: url.href, source: 'google_maps' };
    const response = await fetch(url, {
      redirect: 'manual', signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-MX,es;q=0.9' },
    });
    const redirect = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && redirect) {
      await response.body?.cancel();
      url = new URL(redirect, url);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); return null; }
    const text = await response.text();
    const payloadPoint = parsePlacePayload(text);
    if (payloadPoint) return { ...payloadPoint, sourceUrl: url.href, source: 'google_maps' };
    // iPhone share links often use ?q=...&ftid=... . Their HTML only has a
    // generic viewport; its preview request contains the selected place.
    const preview = text.match(/href=["']([^"']*\/maps\/preview\/place[^"']*)["']/i);
    if (preview) {
      const previewUrl = new URL(preview[1].replaceAll('&amp;', '&'), url);
      if (!parseMapsUrl(previewUrl.href)) return null;
      const placeResponse = await fetch(previewUrl, {
        redirect: 'error', signal,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-MX,es;q=0.9' },
      });
      if (!placeResponse.ok) { await placeResponse.body?.cancel(); return null; }
      const exactPoint = parsePlacePayload(await placeResponse.text());
      if (exactPoint) return { ...exactPoint, sourceUrl: url.href, source: 'google_maps' };
    }
    return null;
  }
  return null;
};

export const resolveCafeLocation = async ({ link, address, nombre }, { timeoutMs = 18000 } = {}) => {
  const search = [nombre, address, 'Mérida, Yucatán, México'].filter(Boolean).join(', ');
  const url = link ? parseMapsUrl(link) : address ? new URL(`https://www.google.com/maps?q=${encodeURIComponent(search)}`) : null;
  if (!url) return null;
  try { return await readMaps(url, AbortSignal.timeout(timeoutMs)); } catch { return null; }
};
