import { parseMapsUrl, resolveCafeLocation } from '../server/cafeLocation.js';

export default async function mapsLocation(request, response) {
  const url = Array.isArray(request.query?.url) ? request.query.url[0] : request.query?.url;
  const address = String(request.query?.address || '').trim().slice(0, 220);
  const nombre = String(request.query?.nombre || '').trim().slice(0, 100);
  if ((!url && !address) || (url && !parseMapsUrl(url))) {
    return response.status(400).json({ error: 'Agrega una dirección o un enlace válido de Google Maps.' });
  }
  const location = await resolveCafeLocation({ link: url, address, nombre });
  if (!location) return response.status(404).json({ error: 'La ubicación del lugar todavía no está disponible.' });
  response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return response.status(200).json(location);
}
