export const parseTikTokPost = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.tiktok.com', 'tiktok.com', 'm.tiktok.com'].includes(url.hostname) || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/@([^/]+)\/(video|photo)\/(\d{15,25})\/?$/);
    if (!match) return null;
    return { id: match[3], creator: match[1], type: match[2], url: `https://www.tiktok.com/@${match[1]}/${match[2]}/${match[3]}` };
  } catch { return null; }
};

export const getTikTokCoverUrl = (url) => `/api/tiktok-cover?url=${encodeURIComponent(parseTikTokPost(url)?.url || url)}`;
export const getTikTokPlayerUrl = (url) => {
  const post = parseTikTokPost(url);
  return post ? `https://www.tiktok.com/player/v1/${post.id}?autoplay=0&muted=1&controls=0&description=0&music_info=0` : null;
};
