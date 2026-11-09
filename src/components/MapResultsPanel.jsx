import { useEffect, useRef, useState } from 'react';
import { GripHorizontal, X } from 'lucide-react';
import { clampPanelPosition } from '../utils/mapPanelPosition';

const STORAGE_KEY = 'coffee-map:results-position';
const readPosition = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) return saved;
  } catch { /* Use the default when storage is unavailable. */ }
  return { x: 16, y: 130 };
};
const savePosition = (position) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(position)); } catch { /* Dragging still works. */ }
};

export default function MapResultsPanel({ count, onClose, actions, context, children }) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState(readPosition);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const clamp = (next) => {
    const panel = panelRef.current;
    return clampPanelPosition(next, panel.getBoundingClientRect(), panel.parentElement.getBoundingClientRect());
  };

  useEffect(() => {
    const panel = panelRef.current;
    const observer = new ResizeObserver(() => {
      if (!window.matchMedia('(min-width: 768px)').matches || !panel.offsetWidth) return;
      setPosition((current) => clampPanelPosition(current, panel.getBoundingClientRect(), panel.parentElement.getBoundingClientRect()));
    });
    observer.observe(panel);
    observer.observe(panel.parentElement);
    return () => observer.disconnect();
  }, []);

  const pointerDown = (event) => {
    if (event.target.closest('button') || event.button !== 0) return;
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, position, desktop, offset: 0, next: position };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const pointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.desktop) {
      drag.next = clamp({ x: drag.position.x + event.clientX - drag.x, y: drag.position.y + event.clientY - drag.y });
      setPosition(drag.next);
    } else {
      drag.offset = Math.max(0, event.clientY - drag.y);
      setOffset(drag.offset);
    }
  };
  const pointerEnd = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.desktop) savePosition(drag.next);
    else if (event.type !== 'pointercancel' && drag.offset > 80) onClose();
    dragRef.current = null;
    setOffset(0);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const moveWithKeyboard = (event) => {
    if (event.target !== event.currentTarget || !window.matchMedia('(min-width: 768px)').matches) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 50 : 16;
    const next = clamp({ x: position.x + direction[0] * step, y: position.y + direction[1] * step });
    setPosition(next);
    savePosition(next);
  };

  return <aside ref={panelRef} className={`map-results-panel ${dragging ? 'is-dragging' : ''}`} style={{ '--panel-x': `${position.x}px`, '--panel-y': `${position.y}px`, '--panel-swipe': `${offset}px` }} aria-label="Lista de cafeterías">
    <div className="map-results-header" tabIndex={0} aria-label="Mover lista: arrastra el encabezado o usa las flechas del teclado" onKeyDown={moveWithKeyboard} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
      <div><strong>{count} cafeterías</strong><span>En Mérida</span><span className="map-drag-hint"><GripHorizontal size={14} /> Arrastra para mover</span></div>
      <button type="button" onClick={onClose} aria-label="Ocultar lista"><X size={18} /></button>
    </div>
    <div className="map-results-actions">{actions}</div>
    {context}
    <div className="map-results-list">{children}</div>
  </aside>;
}
