import { parseTikTokPost } from '../src/utils/tiktok.js';

const cache = new Map();
export const isTikTokUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password
      && ['www.tiktok.com', 'tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname);
  } catch { return false; }
};
export const isTikTokImageUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password
      && ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'muscdn.com', 'ibyteimg.com', 'byteoversea.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
};

export const extractTikTokMetadata = (html, post) => {
  try {
    const json = html.match(/<script\b[^>]*\bid=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    const item = JSON.parse(json).__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (!item || String(item.id) !== post.id || item.privateItem || item.takeDown) return null;
    const photo = item.imagePost?.images?.[0]?.imageURL?.urlList?.[0];
    const cover = photo || item.video?.originCover || item.video?.cover;
    return {
      url: post.url, title: String(item.desc || '').slice(0, 500),
      author: item.author?.uniqueId || post.creator,
      cover: isTikTokImageUrl(cover) ? cover : null,
    };
  } catch { return null; }
};

export const resolveTikTokMetadata = async (value) => {
  if (!isTikTokUrl(value)) return null;
  let url = new URL(value);
  const signal = AbortSignal.timeout(14000);
  // Resolve only TikTok's own redirects, including vm/vt share links.
  for (let hop = 0; hop < 6 && !parseTikTokPost(url.href); hop += 1) {
    if (!isTikTokUrl(url.href)) return null;
    const response = await fetch(url, { redirect: 'manual', signal });
    const redirect = response.headers.get('location');
    await response.body?.cancel();
    if (!redirect || response.status < 300 || response.status >= 400) return null;
    url = new URL(redirect, url);
  }
  const post = parseTikTokPost(url.href);
  if (!post) return null;
  const cached = cache.get(post.url);
  if (cached && cached.expires > Date.now()) return cached.value;
  const headers = { 'User-Agent': 'Mozilla/5.0' };
  let metadata = null;
  // TikTok's public SSR route supplies both video covers and photo carousels.
  // The /photo route often omits metadata, so read its matching /video route.
  const pageUrl = post.url.replace('/photo/', '/video/');
  const page = await fetch(pageUrl, { headers, redirect: 'error', signal });
  if (page.ok) metadata = extractTikTokMetadata(await page.text(), post);
  else await page.body?.cancel();
  if (!metadata?.cover) {
    const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(post.url)}`, { redirect: 'error', signal });
    if (response.ok) {
      const embed = await response.json();
      if (isTikTokImageUrl(embed.thumbnail_url)) metadata = { url: post.url, cover: embed.thumbnail_url, title: embed.title || '', author: embed.author_name || post.creator };
    } else await response.body?.cancel();
  }
  const result = metadata || { url: post.url, title: '', author: post.creator, cover: null };
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(post.url, { expires: Date.now() + (result.cover ? 15 * 60 * 1000 : 15 * 1000), value: result });
  return result;
};
