import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CafeGallery({ photos, cafeName, onOpen }) {
  const track = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const [active, setActive] = useState(0);
  const selected = Math.min(active, photos.length - 1);
  const show = (index) => {
    const next = Math.max(0, Math.min(photos.length - 1, index));
    const element = track.current?.children[next];
    if (element) track.current.scrollTo({ left: element.offsetLeft, behavior: 'smooth' });
    setActive(next);
  };
  const updateActive = () => {
    const element = track.current;
    let nearest = 0;
    let distance = Infinity;
    [...element.children].forEach((child, index) => {
      const delta = Math.abs(child.offsetLeft - element.scrollLeft);
      if (delta < distance) { distance = delta; nearest = index; }
    });
    setActive(nearest);
  };
  const endDrag = (event) => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    event.currentTarget.classList.remove('is-dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (moved) {
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      updateActive();
    }
  };
  if (!photos.length) return null;
  return <div className="coffee-gallery" role="region" aria-label={`Galería de ${cafeName}`} aria-roledescription="carrusel">
    <div className="coffee-gallery-controls"><span aria-live="polite">{selected + 1} / {photos.length}</span><button type="button" disabled={selected <= 0} onClick={() => show(selected - 1)} aria-label="Foto anterior"><ChevronLeft size={20} /></button><button type="button" disabled={selected >= photos.length - 1} onClick={() => show(selected + 1)} aria-label="Foto siguiente"><ChevronRight size={20} /></button></div>
    <div className="coffee-gallery-track" ref={track} onScroll={updateActive}
      onPointerDown={(event) => { if (event.pointerType !== 'mouse' || event.button !== 0) return; suppressClick.current = false; drag.current = { start: event.clientX, scroll: event.currentTarget.scrollLeft, moved: false }; }}
      onPointerMove={(event) => { const gesture = drag.current; if (!gesture) return; const delta = event.clientX - gesture.start; if (Math.abs(delta) > 6) { gesture.moved = true; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.classList.add('is-dragging'); } if (gesture.moved) { event.preventDefault(); event.currentTarget.scrollLeft = gesture.scroll - delta; } }}
      onPointerUp={endDrag} onPointerCancel={endDrag}
      onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }}
      onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); show(selected + (event.key === 'ArrowRight' ? 1 : -1)); } }}>
      {photos.map((photo, index) => <button type="button" className={index === selected ? 'is-selected' : ''} key={photo.id} aria-label={`Ampliar foto ${index + 1} de ${cafeName}`} onClick={() => onOpen(photo)}><img draggable={false} src={photo.public_url} alt={`${cafeName}, foto ${index + 1}`} loading="lazy" decoding="async" /></button>)}
    </div>
  </div>;
}
