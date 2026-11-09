import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

export default function CafeGallery({ photos, cafeName, onOpen }) {
  const track = useRef(null);
  const [active, setActive] = useState(0);
  const selected = Math.min(active, photos.length - 1);
  const show = (index) => {
    const next = Math.max(0, Math.min(photos.length - 1, index));
    setActive(next);
    const element = track.current?.children[next];
    if (element) track.current.scrollTo({ left: element.offsetLeft - track.current.offsetLeft, behavior: 'smooth' });
  };
  if (!photos.length) return null;
  return <div className="coffee-gallery" role="region" aria-label={`Galería de ${cafeName}`} aria-roledescription="carrusel">
    <div className="coffee-gallery-controls"><span aria-live="polite">{selected + 1} / {photos.length}</span><button type="button" disabled={selected <= 0} onClick={() => show(selected - 1)} aria-label="Foto anterior"><ChevronLeft size={20} /></button><button type="button" disabled={selected >= photos.length - 1} onClick={() => show(selected + 1)} aria-label="Foto siguiente"><ChevronRight size={20} /></button><button type="button" onClick={() => onOpen(photos[selected])} aria-label="Ampliar foto seleccionada"><Maximize2 size={18} /></button></div>
    <div className="coffee-gallery-track" ref={track} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); show(selected + (event.key === 'ArrowRight' ? 1 : -1)); } }}>
      {photos.map((photo, index) => <button type="button" className={index === selected ? 'is-selected' : ''} key={photo.id} aria-label={`Foto ${index + 1} de ${cafeName}${index === selected ? ', ampliar' : ', seleccionar'}`} aria-pressed={index === selected} onClick={() => index === selected ? onOpen(photo) : show(index)}><img src={photo.public_url} alt={`${cafeName}, foto ${index + 1}`} loading="lazy" decoding="async" /></button>)}
    </div>
  </div>;
}
