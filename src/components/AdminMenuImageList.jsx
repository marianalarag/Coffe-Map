import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

export default function AdminMenuImageList({ images, cafeName, saving, onMove, onDelete }) {
  return <div className="admin-cafe-menu-images-grid">{images.map((url, index) => <div key={url}>
    <img src={url} alt={`Menú ${index + 1} de ${cafeName}`} loading="lazy" />
    <span className="admin-menu-page-number">{index + 1}</span>
    <button className="admin-menu-delete" type="button" onClick={() => onDelete(url)} disabled={saving} aria-label={`Eliminar imagen ${index + 1} del menú`} title="Eliminar imagen"><Trash2 size={12} /></button>
    <div className="admin-menu-order-controls">
      <button type="button" onClick={() => onMove(index, index - 1)} disabled={saving || index === 0} aria-label={`Mover imagen ${index + 1} antes`} title="Mover antes"><ChevronLeft size={15} /></button>
      <button type="button" onClick={() => onMove(index, index + 1)} disabled={saving || index === images.length - 1} aria-label={`Mover imagen ${index + 1} después`} title="Mover después"><ChevronRight size={15} /></button>
    </div>
  </div>)}</div>;
}
