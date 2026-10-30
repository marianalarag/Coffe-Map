import { useEffect, useState } from 'react';

// Resize in stages so a full-resolution upload doesn't alias at avatar size.
// The square is the same centered crop used by object-fit: cover.
export default function ProfileAvatar({ src, size = 256, ...props }) {
  const [thumbnail, setThumbnail] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = async () => {
      try {
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const target = Math.min(side, size);
        let canvas = document.createElement('canvas');
        canvas.width = side; canvas.height = side;
        canvas.getContext('2d').drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, side, side);
        while (canvas.width > target) {
          const next = document.createElement('canvas');
          next.width = Math.max(target, Math.floor(canvas.width / 2)); next.height = next.width;
          const context = next.getContext('2d');
          context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
          context.drawImage(canvas, 0, 0, next.width, next.height);
          canvas = next;
        }
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbnail({ source: src, url: objectUrl });
      } catch { /* Cross-origin images retain the original cover crop. */ }
    };
    image.src = src;
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, size]);
  return <img {...props} src={thumbnail?.source === src ? thumbnail.url : src} />;
}
