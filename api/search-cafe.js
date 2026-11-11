import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const MCP_URL = 'https://search.parallel.ai/mcp';
const createUserClient = (token) => createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
);

const hostIs = (url, domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`);
const safeResult = (result) => {
  try {
    const url = new URL(result.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || hostIs(url, 'openstreetmap.org')) return null;
    return {
      url: url.href,
      title: String(result.title || url.hostname).slice(0, 220),
      domain: url.hostname.replace(/^www\./i, ''),
      excerpt: (Array.isArray(result.excerpts) ? result.excerpts : []).map((excerpt) => String(excerpt)).join(' ').replace(/\s+/g, ' ').slice(0, 700),
      type: result.type || 'organic',
    };
  } catch { return null; }
};

const mcpPost = async (body, sessionId) => {
  const result = await fetch(MCP_URL, {
    method: 'POST', headers: {
      Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId, 'MCP-Protocol-Version': '2024-11-05' } : {}),
    },
    body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
  });
  if (!result.ok) throw new Error(result.status === 429 ? 'El buscador gratuito alcanzó su límite temporal. Espera un poco e intenta de nuevo.' : 'El buscador web no respondió. Intenta otra vez más tarde.');
  const body = await result.text();
  let data = null;
  if (body.trim()) {
    try { data = JSON.parse(body); }
    catch {
      const eventData = body.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5).trim();
      if (eventData) data = JSON.parse(eventData);
    }
  }
  return { data, sessionId: result.headers.get('Mcp-Session-Id') || sessionId };
};

const searchWeb = async ({ cafe, fields, batchId }) => {
  const initialized = await mcpPost({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'coffee-map-catalog', version: '1.0.0' },
  } });
  const sessionId = initialized.sessionId;
  if (!sessionId) throw new Error('El buscador no inició una sesión. Intenta de nuevo.');
  await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, sessionId);

  const place = [cafe.neighborhood, cafe.address, 'Mérida, Yucatán'].filter(Boolean).join(' ');
  const queries = [
    `${cafe.nombre} ${place} sitio oficial`,
    `${cafe.nombre} ${place} Instagram TikTok`,
    `${cafe.nombre} ${place} menú`,
  ];
  const call = await mcpPost({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'web_search', arguments: {
    objective: `Encuentra páginas públicas que puedan corresponder a ${cafe.nombre}, una cafetería ubicada en ${place}. La persona administradora verificará las coincidencias antes de guardar. Campos buscados: ${fields.join(', ')}.`,
    search_queries: queries,
    session_id: batchId,
  } } }, sessionId);
  if (call.data.error) throw new Error('La búsqueda gratuita no pudo completar esta cafetería.');
  const text = call.data.result?.content?.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('El buscador devolvió una respuesta vacía.');
  let output;
  try { output = JSON.parse(text); } catch { throw new Error('No pudimos leer los resultados del buscador.'); }
  const results = (output.results || []).map(safeResult).filter(Boolean).slice(0, 12);
  return { cafeId: cafe.id, nombre: cafe.nombre, results, sourcesCount: results.length };
};

export default async function searchCafe(request, response) {
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
    if (profileError || profile?.role !== 'administrador') return response.status(403).json({ error: 'Solo administración puede buscar en el catálogo.' });

    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
    const cafeId = String(body.cafeId || '');
    const fields = [...new Set((Array.isArray(body.fields) ? body.fields : []).filter((field) => ['website_url', 'instagram_url', 'tiktok_url', 'menu_page_url'].includes(field)))];
    const batchId = /^[0-9a-f-]{36}$/i.test(String(body.batchId || '')) ? body.batchId : '';
    if (!cafeId || cafeId.length > 160 || !fields.length || !batchId) return response.status(400).json({ error: 'Selecciona una cafetería y los campos que quieres buscar.' });
    const { data: cafe, error: cafeError } = await client.from('cafes')
      .select('id,nombre,address,neighborhood,website_url,instagram_url,tiktok_url,menu_page_url,deleted_at')
      .eq('id', cafeId).is('deleted_at', null).single();
    if (cafeError || !cafe) return response.status(404).json({ error: 'No encontramos esa cafetería en el catálogo.' });
    const missingFields = fields.filter((field) => !cafe[field]);
    if (!missingFields.length) return response.status(200).json({ cafeId, nombre: cafe.nombre, results: [], sourcesCount: 0 });

    return response.status(200).json(await searchWeb({ cafe, fields: missingFields, batchId }));
  } catch (error) {
    if (error.name === 'TimeoutError') return response.status(504).json({ error: 'La búsqueda tardó demasiado. Intenta otra vez con esta cafetería.' });
    console.error('Cafe free web search failed:', error.code || error.name);
    return response.status(502).json({ error: error.message || 'No pudimos completar la búsqueda web.' });
  }
}

export const config = { maxDuration: 60 };
