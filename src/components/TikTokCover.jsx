import { useState } from 'react';
import { Music2 } from 'lucide-react';
import { getTikTokCoverUrl, getTikTokPlayerUrl } from '../utils/tiktok';

export default function TikTokCover({ tiktok, cafeName }) {
  const [failedImage, setFailedImage] = useState(null);
  const [failedProxy, setFailedProxy] = useState(false);
  const proxy = getTikTokCoverUrl(tiktok.url);
  const image = tiktok.thumbnail_url && failedImage !== tiktok.thumbnail_url ? tiktok.thumbnail_url : proxy;
  if (!failedProxy) return <img src={image} alt={tiktok.title || `TikTok de ${cafeName}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => {
    if (image === proxy) setFailedProxy(true);
    else setFailedImage(image);
  }} />;
  const player = getTikTokPlayerUrl(tiktok.url);
  return player ? <iframe src={player} title={`Vista previa de TikTok de ${cafeName}`} loading="lazy" allow="encrypted-media; fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" /> : <div className="cafe-tiktok-placeholder"><Music2 size={32} /><span>Ver publicación en TikTok</span></div>;
}
