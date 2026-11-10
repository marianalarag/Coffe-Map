import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const createUserClient = (token) => createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
);

const cleanUrl = (value, hostPattern) => {
  if (!value) return null;
  const raw = String(value).trim().split(/[;,]/)[0].trim().replace(/^www\./i, '');
  if (!raw || raw.length > 500) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^@/, '')}`;
  try {
    const url = new URL(candidate);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !hostPattern.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
};

const extractLinks = (tags = {}) => {
  const first = (...keys) => keys.map((key) => tags[key]).find(Boolean);
  const instagram = first('contact:instagram', 'instagram');
  const tiktok = first('contact:tiktok', 'tiktok');
  const instagramUrl = cleanUrl(instagram && (/^https?:\/\//i.test(instagram) ? instagram : `instagram.com/${String(instagram).replace(/^@/, '')}`), /(^|\.)instagram\.com$/i);
  const tiktokUrl = cleanUrl(tiktok && (/^https?:\/\//i.test(tiktok) ? tiktok : `tiktok.com/@${String(tiktok).replace(/^@/, '')}`), /(^|\.)(tiktok\.com|vm\.tiktok\.com)$/i);
  return {
    website_url: cleanUrl(first('contact:website', 'website', 'url'), /.+\..+/),
    instagram_url: instagramUrl,
    tiktok_url: tiktokUrl,
  };
};

export default async function enrichCafes(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método no permitido.' });
  }
  const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return response.status(401).json({ error: 'Inicia sesión para buscar información.' });
  try {
    const client = createUserClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return response.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
    const { data: profile, error: profileError } = await client.from('profiles').select('role').eq('id', user.id).single();
    if (profileError || profile?.role !== 'administrador') return response.status(403).json({ error: 'Solo administración puede buscar información del catálogo.' });

    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
    const ids = [...new Set((Array.isArray(body.cafeIds) ? body.cafeIds : []).map(String))];
    if (!ids.length || ids.length > 120) return response.status(400).json({ error: 'Selecciona entre 1 y 120 cafeterías.' });
    const { data: cafes, error } = await client.from('cafes')
      .select('id,nombre,source_id,website_url,instagram_url,tiktok_url,deleted_at')
      .in('id', ids).eq('source', 'osm').is('deleted_at', null);
    if (error) throw error;
    if (!cafes?.length) return response.status(200).json({ results: [], unmatched: ids.length });

    const groups = new Map();
    for (const cafe of cafes) {
      const match = String(cafe.source_id || '').match(/^(node|way)\/(\d+)$/);
      if (!match) continue;
      if (!groups.has(match[1])) groups.set(match[1], []);
      groups.get(match[1]).push({ cafe, osmId: match[2] });
    }

    const elements = new Map();
    for (const [type, entries] of groups) {
      const plural = `${type}s`;
      const osmIds = entries.map((entry) => entry.osmId);
      for (let index = 0; index < osmIds.length; index += 60) {
        const query = `${plural}=${osmIds.slice(index, index + 60).join(',')}`;
        const result = await fetch(`https://api.openstreetmap.org/api/0.6/${plural}.json?${query}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'CoffeeMapMerida/1.0 (catalog enrichment)' },
          signal: AbortSignal.timeout(15000),
        });
        if (!result.ok) throw new Error('OpenStreetMap no respondió. Espera un momento e intenta de nuevo.');
        const payload = await result.json();
        payload.elements?.forEach((element) => elements.set(`${element.type}/${element.id}`, element));
      }
    }

    const results = cafes.flatMap((cafe) => {
      const element = elements.get(cafe.source_id);
      if (!element) return [];
      const fields = extractLinks(element.tags);
      const suggestions = Object.fromEntries(Object.entries(fields).filter(([field, value]) => value && !cafe[field]));
      if (!Object.keys(suggestions).length) return [];
      return [{ id: cafe.id, nombre: cafe.nombre, fields: suggestions, sourceUrl: `https://www.openstreetmap.org/${cafe.source_id}` }];
    });
    return response.status(200).json({ results, scanned: cafes.length, unmatched: ids.length - cafes.length, attribution: '© OpenStreetMap contributors' });
  } catch (error) {
    console.error('Cafe catalog enrichment failed:', error.code || error.name);
    return response.status(502).json({ error: error.message || 'No pudimos consultar las fichas públicas. Intenta otra vez.' });
  }
}

export const config = { maxDuration: 60 };
