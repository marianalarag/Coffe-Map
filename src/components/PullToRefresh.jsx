import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PullToRefresh({ onRefresh, children }) {
  const rootRef = useRef(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    let start = null, distance = 0, busy = false, mounted = true;
    const scrollTop = () => {
      let element = root.parentElement;
      while (element) {
        if (/(auto|scroll)/.test(getComputedStyle(element).overflowY)) return element.scrollTop;
        element = element.parentElement;
      }
      return document.scrollingElement?.scrollTop || 0;
    };
    const touchStart = (event) => { if (!busy && event.touches.length === 1 && scrollTop() <= 0) start = { x: event.touches[0].clientX, y: event.touches[0].clientY }; };
    const touchMove = (event) => {
      if (!start || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y;
      if (Math.abs(dx) > Math.abs(dy) || dy < 0 || scrollTop() > 0) { start = null; distance = 0; setPull(0); return; }
      if (dy > 12) { if (event.cancelable) event.preventDefault(); distance = Math.min(85, dy * .5); setPull(distance); }
    };
    const touchEnd = async () => {
      start = null;
      const shouldRefresh = distance >= 55;
      distance = 0; setPull(0);
      if (!shouldRefresh || busy) return;
      busy = true; setRefreshing(true);
      try { await onRefresh(); } finally { busy = false; if (mounted) setRefreshing(false); }
    };
    const cancel = () => { start = null; distance = 0; setPull(0); };
    root.addEventListener('touchstart', touchStart, { passive: true });
    root.addEventListener('touchmove', touchMove, { passive: false });
    root.addEventListener('touchend', touchEnd);
    root.addEventListener('touchcancel', cancel);
    return () => { mounted = false; root.removeEventListener('touchstart', touchStart); root.removeEventListener('touchmove', touchMove); root.removeEventListener('touchend', touchEnd); root.removeEventListener('touchcancel', cancel); };
  }, [onRefresh]);
  return <div ref={rootRef} className="pull-refresh-region"><div className="pull-refresh-indicator" style={{ height: refreshing ? 42 : pull }} aria-live="polite">{(pull > 0 || refreshing) && <><RefreshCw size={18} className={refreshing ? 'is-refreshing' : ''} /><span>{refreshing ? 'Actualizando…' : pull >= 55 ? 'Suelta para actualizar' : 'Desliza para actualizar'}</span></>}</div>{children}</div>;
}
