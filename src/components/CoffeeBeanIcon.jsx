const SHEET_URL = '/ratings.png';
const SHEET_WIDTH = 247;
const SHEET_HEIGHT = 637;
const BEAN_SOURCE_SIZE = 24;
const BEAN_SOURCE_X = 4;
const BEAN_SOURCE_Y = 6;
const RATING_ROW_HEIGHT = 56.7;
const RATING_SOURCE_TOP = 4;
const RATING_SOURCE_WIDTH = 205;
const RATING_SOURCE_HEIGHT = 31;

const clampRating = (value) => Math.max(0, Math.min(5, Math.round(Number(value || 0) * 2) / 2));

function CoffeeBeanIcon({ size = 18, className = '', filled = false, title, style }) {
  const scale = size / BEAN_SOURCE_SIZE;
  const backgroundPosition = filled
    ? `${-BEAN_SOURCE_X * scale}px ${-BEAN_SOURCE_Y * scale}px`
    : `${-(169 + BEAN_SOURCE_X) * scale}px ${-(57 + BEAN_SOURCE_Y) * scale}px`;

  return (
    <span
      className={`coffee-bean-icon ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url("${SHEET_URL}")`,
        backgroundSize: `${SHEET_WIDTH * scale}px ${SHEET_HEIGHT * scale}px`,
        backgroundPosition,
        ...style,
      }}
      role={title ? 'img' : undefined}
      aria-label={title}
      title={title}
    />
  );
}

export function CoffeeBeanRating({ value = 0, size = 24, className = '', label = 'Calificación' }) {
  const rating = clampRating(value);
  const row = rating > 0 ? Math.max(0, Math.min(9, Math.round((5 - rating) * 2))) : 9;
  const scale = size / RATING_SOURCE_HEIGHT;

  return (
    <span
      className={`coffee-bean-rating ${className}`}
      style={{
        width: RATING_SOURCE_WIDTH * scale,
        height: RATING_SOURCE_HEIGHT * scale,
        backgroundImage: `url("${SHEET_URL}")`,
        backgroundSize: `${SHEET_WIDTH * scale}px ${SHEET_HEIGHT * scale}px`,
        backgroundPosition: `0 ${-(RATING_SOURCE_TOP + (row * RATING_ROW_HEIGHT)) * scale}px`,
      }}
      role="img"
      aria-label={`${label}: ${rating.toFixed(1)} de 5`}
    />
  );
}

export default CoffeeBeanIcon;
