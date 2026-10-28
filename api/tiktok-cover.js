import { Buffer } from 'node:buffer';
import { isTikTokUrl, isTikTokImageUrl, resolveTikTokMetadata } from '../server/tiktok.js';

export default async function tiktokCover(request, response) {
  const url = request.query?.url;
  if (typeof url !== 'string' || url.length > 3000 || !isTikTokUrl(url)) return response.status(400).end();
  try {
    const metadata = await resolveTikTokMetadata(url);
    if (!metadata?.cover || !isTikTokImageUrl(metadata.cover)) return response.status(404).end();
    const image = await fetch(metadata.cover, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const contentType = image.headers.get('content-type') || '';
    if (!image.ok || !/^image\/(jpeg|png|webp|avif)(?:;|$)/i.test(contentType) || Number(image.headers.get('content-length')) > 5 * 1024 * 1024) {
      await image.body?.cancel();
      return response.status(502).end();
    }
    const body = Buffer.from(await image.arrayBuffer());
    if (body.length > 5 * 1024 * 1024) return response.status(502).end();
    response.setHeader('Content-Type', contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400');
    return response.status(200).send(body);
  } catch { return response.status(502).end(); }
}
