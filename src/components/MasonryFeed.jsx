import { useLayoutEffect, useRef } from 'react';

export default function MasonryFeed({ children, className = '' }) {
  const feedRef = useRef(null);
  useLayoutEffect(() => {
    const feed = feedRef.current;
    const items = [...feed.children];
    let frame;
    const layout = () => {
      const desktop = window.matchMedia('(min-width: 900px)').matches;
      if (!desktop) {
        feed.style.height = '';
        items.forEach((item) => { item.style.position = ''; item.style.width = ''; item.style.left = ''; item.style.top = ''; });
        return;
      }
      const gap = parseFloat(getComputedStyle(feed).gap) || 18;
      const width = (feed.clientWidth - gap) / 2;
      const bottoms = [0, 0];
      items.forEach((item) => {
        const column = bottoms[0] <= bottoms[1] ? 0 : 1;
        Object.assign(item.style, { position: 'absolute', width: `${width}px`, left: `${column * (width + gap)}px`, top: `${bottoms[column]}px` });
        bottoms[column] += item.getBoundingClientRect().height + gap;
      });
      feed.style.height = `${Math.max(0, ...bottoms) - (items.length ? gap : 0)}px`;
    };
    const scheduleLayout = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); };
    const observer = new ResizeObserver(scheduleLayout);
    observer.observe(feed);
    items.forEach((item) => observer.observe(item));
    window.addEventListener('resize', scheduleLayout);
    layout();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', scheduleLayout); };
  }, [children]);
  return <div ref={feedRef} className={`activity-feed is-masonry ${className}`}>{children}</div>;
}
