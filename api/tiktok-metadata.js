import { isTikTokUrl, resolveTikTokMetadata } from '../server/tiktok.js';
import { getTikTokCoverUrl } from '../src/utils/tiktok.js';

export default async function tiktokMetadata(request, response) {
  const url = request.query?.url;
  if (typeof url !== 'string' || url.length > 3000 || !isTikTokUrl(url)) return response.status(400).json({ error: 'Enlace de TikTok inválido.' });
  try {
    const metadata = await resolveTikTokMetadata(url);
    if (!metadata) return response.status(404).json({ error: 'Publicación no disponible.' });
    response.setHeader('Cache-Control', 'public, s-maxage=900');
    return response.status(200).json({ url: metadata.url, title: metadata.title, author: metadata.author, thumbnail_url: metadata.cover ? getTikTokCoverUrl(metadata.url) : null });
  } catch { return response.status(502).json({ error: 'TikTok no respondió. El enlace se puede guardar igualmente.' }); }
}
