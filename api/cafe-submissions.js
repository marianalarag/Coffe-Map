import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { parseMapsUrl, resolveCafeLocation, isInsideMerida } from '../server/cafeLocation.js';
import { areDuplicateCafes, normalizeCafeName } from '../src/utils/cafeDeduplication.js';

const createUserClient = (token) => createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
);

export const createCafeSubmissionsHandler = ({ getClient = createUserClient, resolveLocation = resolveCafeLocation } = {}) => async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (!['POST', 'PATCH'].includes(request.method)) {
    response.setHeader('Allow', 'POST, PATCH');
    return response.status(405).json({ error: 'Método no permitido.' });
  }
  const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return response.status(401).json({ error: 'Inicia sesión para enviar una cafetería.' });
  try {
    const client = getClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return response.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};

    if (request.method === 'PATCH') {
      const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'administrador') return response.status(403).json({ error: 'Solo la administración puede aprobar cafeterías.' });
      const { data: cafe } = await client.from('cafes').select('*').eq('id', String(body.id || '')).eq('status', 'needs_review').single();
      if (!cafe) return response.status(404).json({ error: 'La solicitud ya no está pendiente.' });
      const location = await resolveLocation(cafe);
      if (!location || !isInsideMerida(location)) {
        return response.status(422).json({ error: 'La solicitud está guardada. Google Maps aún no devuelve una ubicación exacta dentro de Mérida; revisa el enlace del lugar y vuelve a aceptar.' });
      }
      const { error } = await client.from('cafes').update({
        lat: location.lat, lng: location.lng, source_url: location.sourceUrl,
        status: 'active', last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', cafe.id).eq('status', 'needs_review');
      if (error) throw error;
      return response.status(200).json({ id: cafe.id, status: 'active', lat: location.lat, lng: location.lng });
    }

    const nombre = String(body.nombre || '').trim();
    const address = String(body.address || '').trim();
    const mapsUrl = body.link ? parseMapsUrl(String(body.link).trim()) : null;
    if (!nombre || nombre.length > 100 || address.length > 220 || (!address && !mapsUrl) || (body.link && !mapsUrl)) {
      return response.status(400).json({ error: 'Escribe el nombre y una dirección o enlace válido de Google Maps.' });
    }
    const link = mapsUrl?.href || null;
    // A temporary Maps failure must not discard the contribution or require
    // the visitor's current GPS location. Keep it in the moderation queue.
    const resolved = await resolveLocation({ nombre, address, link });
    const location = resolved && isInsideMerida(resolved) ? resolved : null;
    if (location) {
      const { data: existing } = await client.from('cafes').select('id,nombre,lat,lng,address').eq('status', 'active');
      const duplicate = (existing || []).find((cafe) => areDuplicateCafes(cafe, { nombre, address, ...location }));
      if (duplicate) return response.status(409).json({ error: `“${duplicate.nombre}” ya está en el mapa.`, cafeId: duplicate.id });
    }
    const suggestionId = randomUUID();
    const id = `community:${suggestionId}`;
    const { error } = await client.from('cafes').insert({
      id, nombre, address: address || null, link,
      lat: location?.lat ?? null, lng: location?.lng ?? null,
      source_url: location?.sourceUrl || null,
      source: 'community', source_id: `${normalizeCafeName(nombre).replaceAll(' ', '-')}:${suggestionId}`,
      status: 'needs_review', submitted_by: user.id,
    });
    if (error) throw error;
    return response.status(201).json({ id, status: 'needs_review', locationPending: !location });
  } catch (error) {
    console.error('Cafe submission failed:', error.code || error.name);
    return response.status(500).json({ error: 'No pudimos guardar la solicitud. Tus datos se conservan; intenta enviarla otra vez.' });
  }
};

export default createCafeSubmissionsHandler();
