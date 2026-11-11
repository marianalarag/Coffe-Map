import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import './imageLightbox.css';

export default function ImageLightbox({ images, index, onIndexChange, onClose, label = 'Fotos en pantalla completa' }) {
  const dialogRef = useRef(null);
  const gesture = useRef(null);
  const current = Math.max(0, Math.min(index, images.length - 1));
  const multiple = images.length > 1;
  useEffect(() => {
    const dialog = dialogRef.current;
    const focused = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); focused?.focus?.({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      onIndexChange(Math.max(0, Math.min(images.length - 1, current + delta)));
    };
    // At either end an arrow becomes disabled and browsers can move focus to
    // body. Keep keyboard navigation working in that state as well.
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, images.length, onIndexChange]);
  const move = (delta) => onIndexChange(Math.max(0, Math.min(images.length - 1, current + delta)));
  return createPortal(<dialog ref={dialogRef} className="coffee-lightbox" aria-label={label} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  onPointerDown={(event) => {
    gesture.current = event.isPrimary && !event.target.closest('button') ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
  }} onPointerCancel={() => { gesture.current = null; }} onPointerUp={(event) => {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId || !multiple) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1);
  }}>
    <header><span aria-live="polite">{current + 1} / {images.length}</span><button type="button" onClick={onClose} aria-label="Cerrar imagen" autoFocus><X size={24} /></button></header>
    {multiple && <button type="button" className="coffee-lightbox-arrow is-previous" disabled={current === 0} onClick={() => move(-1)} aria-label="Imagen anterior"><ChevronLeft size={28} /></button>}
    <img className="coffee-lightbox-photo" draggable={false} src={images[current]?.src} alt={images[current]?.alt || `Foto ${current + 1}`} />
    {multiple && <button type="button" className="coffee-lightbox-arrow is-next" disabled={current === images.length - 1} onClick={() => move(1)} aria-label="Siguiente imagen"><ChevronRight size={28} /></button>}
    {multiple && <p className="coffee-lightbox-hint">Desliza o usa las flechas para cambiar de imagen</p>}
  </dialog>, document.body);
}
