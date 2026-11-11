import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Trash2 } from 'lucide-react';
import './adminMenuImages.css';

export default function AdminMenuImageList({ images, cafeName, saving, onMove, onDelete }) {
  const grid = useRef(null);
  const gesture = useRef(null);
  const [drag, setDrag] = useState(null);
  const cancel = () => { gesture.current = null; setDrag(null); };
  const begin = (event, index) => {
    if (saving || !event.isPrimary || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { from: index, to: index, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };
  const move = (event) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId || saving) return;
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6 && !current.moved) return;
    current.moved = true;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-menu-page]');
    current.to = target && grid.current?.contains(target) ? Number(target.dataset.menuPage) : null;
    setDrag({ from: current.from, to: current.to });
  };
  const finish = (event) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    cancel();
    if (!saving && current.moved && current.to !== null && current.to !== current.from) onMove(current.from, current.to);
  };
  return <div ref={grid} className="admin-cafe-menu-images-grid menu-sort-grid" aria-label="Páginas del menú" aria-busy={saving}>{images.map((url, index) => <div key={url} data-menu-page={index} className={`menu-sort-card${drag?.from === index ? ' is-dragging' : ''}${drag?.to === index && drag.from !== index ? ' is-drop-target' : ''}`}>
    <div className="menu-sort-preview"><img src={url} alt={`Menú ${index + 1} de ${cafeName}`} loading="lazy" draggable={false} />
    <span className="admin-menu-page-number">{index + 1}</span>
    <button className="admin-menu-delete" type="button" onClick={() => onDelete(url)} disabled={saving || Boolean(drag)} aria-label={`Eliminar imagen ${index + 1} del menú`} title="Eliminar imagen"><Trash2 size={16} /></button></div>
    <div className="menu-sort-caption"><strong>Página {index + 1}</strong><button type="button" className="menu-sort-handle" disabled={saving || images.length < 2} onPointerDown={(event) => begin(event, index)} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={(event) => { if (event.key === 'Escape') cancel(); }} aria-label={`Arrastrar página ${index + 1} para reordenar`} title="Arrastra para cambiar el orden"><GripVertical size={20} /></button></div>
    <div className="admin-menu-order-controls">
      <button type="button" onClick={() => onMove(index, index - 1)} disabled={saving || index === 0} aria-label={`Mover imagen ${index + 1} antes`} title="Mover antes"><ChevronLeft size={15} /></button>
      <button type="button" onClick={() => onMove(index, index + 1)} disabled={saving || index === images.length - 1} aria-label={`Mover imagen ${index + 1} después`} title="Mover después"><ChevronRight size={15} /></button>
    </div>
  </div>)}</div>;
}
