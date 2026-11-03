import { useEffect, useRef, useState } from 'react';

const previews = new Map();
const prepareAvatar = (src, pixels) => {
  const key = `${pixels}:${src}`;
  if (previews.has(key)) return previews.get(key);
  const prepared = new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const target = Math.min(side, pixels);
        // Prepare a smoothed, centered crop before displaying it. A very large
        // original sampled directly by the GPU can look grainy at avatar size.
        let canvas = document.createElement('canvas');
        canvas.width = canvas.height = Math.min(side, target * 2);
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
        while (canvas.width > target) {
          const next = document.createElement('canvas');
          next.width = next.height = Math.max(target, Math.floor(canvas.width / 2));
          const nextContext = next.getContext('2d');
          nextContext.imageSmoothingEnabled = true;
          nextContext.imageSmoothingQuality = 'high';
          nextContext.drawImage(canvas, 0, 0, next.width, next.height);
          canvas = next;
        }
        resolve(canvas.toDataURL('image/png'));
      } catch { resolve(src); }
    };
    image.onerror = () => { previews.delete(key); resolve(src); };
    image.src = src;
  });
  if (previews.size >= 16) previews.delete(previews.keys().next().value);
  previews.set(key, prepared);
  return prepared;
};

export default function ProfileAvatar({ src, size = 256, style, ...props }) {
  const imageRef = useRef(null);
  const [prepared, setPrepared] = useState(null);
  const resolved = prepared?.source === src ? prepared.url : undefined;
  useEffect(() => {
    const element = imageRef.current;
    let current = true, revision = 0;
    const update = () => {
      const width = element.getBoundingClientRect().width;
      if (!width || !src) return;
      const version = ++revision;
      const pixels = Math.min(2048, Math.max(1, Math.round(width * (window.devicePixelRatio || 1))));
      prepareAvatar(src, pixels).then((url) => { if (current && version === revision) setPrepared({ source: src, url }); });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => { current = false; observer.disconnect(); };
  }, [src]);
  return <img ref={imageRef} width={size} height={size} {...props} src={resolved} draggable={false} style={{ ...style, visibility: resolved ? 'visible' : 'hidden' }} />;
}
