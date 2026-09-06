import { useRef } from 'react';
import { Star } from 'lucide-react';

const clampRating = (value) => Math.min(5, Math.max(0.5, Math.round(Number(value || 0.5) * 2) / 2));

function HalfStarRating({ value = 0, onChange, readOnly = false, size = 24, label = 'Calificación' }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);

  const updateFromPointer = (clientX) => {
    if (readOnly || !trackRef.current || !onChange) return;
    const rect = trackRef.current.getBoundingClientRect();
    const next = clampRating(((clientX - rect.left) / rect.width) * 5);
    onChange(next);
  };

  const handlePointerDown = (event) => {
    if (readOnly) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromPointer(event.clientX);
  };

  const handlePointerMove = (event) => {
    if (draggingRef.current) updateFromPointer(event.clientX);
  };

  const stopDragging = () => {
    draggingRef.current = false;
  };

  const handleKeyDown = (event) => {
    if (readOnly || !onChange) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      onChange(clampRating((Number(value) || 0) + 0.5));
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      onChange(clampRating((Number(value) || 0.5) - 0.5));
    }
  };

  return (
    <div
      ref={trackRef}
      className={`half-star-rating ${readOnly ? 'is-readonly' : ''}`}
      role={readOnly ? 'img' : 'slider'}
      aria-label={`${label}: ${Number(value || 0).toFixed(1)} de 5`}
      aria-valuemin={readOnly ? undefined : 0.5}
      aria-valuemax={readOnly ? undefined : 5}
      aria-valuenow={readOnly ? undefined : Number(value || 0)}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onLostPointerCapture={stopDragging}
    >
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.min(1, Math.max(0, Number(value || 0) - index)) * 100;
        return (
          <span className="half-star" key={index} style={{ '--star-fill': `${fill}%`, '--star-size': `${size}px`, width: size, height: size }}>
            {fill >= 100 ? (
              <Star className="half-star-full" size={size} fill="currentColor" strokeWidth={0} />
            ) : fill <= 0 ? (
              <Star className="half-star-empty" size={size} />
            ) : (
              <>
                <Star className="half-star-empty" size={size} />
                <span className="half-star-fill"><Star size={size} fill="currentColor" strokeWidth={0} /></span>
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default HalfStarRating;
