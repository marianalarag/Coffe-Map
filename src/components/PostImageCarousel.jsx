import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PostPhoto from './PostPhoto';
import ImageLightbox from './ImageLightbox';

export default function PostImageCarousel({ images, cafeName }) {
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState(null);
  const hasMultipleImages = images.length > 1;

  const updateActiveIndex = () => {
    const track = trackRef.current;
    if (!track?.clientWidth) return;
    setActiveIndex(Math.max(0, Math.min(images.length - 1, Math.round(track.scrollLeft / track.clientWidth))));
  };

  const showImage = (index) => {
    const nextIndex = Math.max(0, Math.min(images.length - 1, index));
    trackRef.current?.scrollTo({ left: nextIndex * trackRef.current.clientWidth, behavior: 'smooth' });
    setActiveIndex(nextIndex);
  };

  return (
    <section className="activity-image-carousel" aria-roledescription="carrusel" aria-label={`Fotos de ${cafeName || 'la publicación'}`}>
      <div className="activity-image-track" ref={trackRef} onScroll={updateActiveIndex}>
        {images.map((image, index) => (
          <div className="activity-image-slide" role="group" aria-roledescription="diapositiva" aria-label={`${index + 1} de ${images.length}`} key={image.id}>
            <button type="button" className="activity-image-open" onClick={() => setViewerIndex(index)} aria-label={`Abrir foto ${index + 1} en pantalla completa`}><PostPhoto image={image} alt={`${cafeName || 'Publicación'}, foto ${index + 1} de ${images.length}`} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" /></button>
          </div>
        ))}
      </div>

      {hasMultipleImages && (
        <>
          <span className="activity-image-counter" aria-live="polite">{activeIndex + 1}/{images.length}</span>
          {activeIndex > 0 && <button type="button" className="activity-carousel-button is-previous" onClick={() => showImage(activeIndex - 1)} aria-label="Ver foto anterior"><ChevronLeft size={18} /></button>}
          {activeIndex < images.length - 1 && <button type="button" className="activity-carousel-button is-next" onClick={() => showImage(activeIndex + 1)} aria-label="Ver foto siguiente"><ChevronRight size={18} /></button>}
          <div className="activity-carousel-dots" aria-hidden="true">
            {images.map((image, index) => <span className={index === activeIndex ? 'is-active' : ''} key={image.id} />)}
          </div>
        </>
      )}
      {viewerIndex !== null && <ImageLightbox images={images.map((image, index) => ({ src: image.preview_url || image.public_url, alt: `${cafeName || 'Publicación'}, foto ${index + 1}` }))} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} label="Imagen de la publicación en pantalla completa" />}
    </section>
  );
}

