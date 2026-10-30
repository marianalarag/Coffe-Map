import { useEffect, useState } from 'react';

export default function PostPhoto({ image, ...props }) {
  const [remoteReady, setRemoteReady] = useState(false);
  useEffect(() => {
    if (!image.preview_url) return;
    let cancelled = false;
    const photo = new Image();
    photo.onload = () => { if (!cancelled) setRemoteReady(true); };
    photo.src = image.public_url;
    return () => { cancelled = true; URL.revokeObjectURL(image.preview_url); };
  }, [image.public_url, image.preview_url]);
  return <img {...props} src={image.preview_url && !remoteReady ? image.preview_url : image.public_url} onError={() => setRemoteReady(true)} />;
}
