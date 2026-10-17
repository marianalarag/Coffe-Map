const SHEET_URL = '/ratings.png';
const SHEET_WIDTH = 247;
const SHEET_HEIGHT = 637;
const BEAN_SOURCE_WIDTH = 31;
const BEAN_SOURCE_HEIGHT = 25;
// The bottom pair in the sprite contains standalone, complete beans. Using
// those cells avoids accidentally showing a half-rating cell in light cards.
const BEAN_SOURCE_X = 5;
const BEAN_SOURCE_Y = 574;
const DARK_BEAN_SOURCE_X = 5;
const DARK_BEAN_SOURCE_Y = 606;
const RATING_ROW_HEIGHT = 56.7;
const RATING_SOURCE_LEFT = 5;
const RATING_SOURCE_TOP = 7;
const RATING_SOURCE_WIDTH = 195;
const RATING_SOURCE_HEIGHT = 25;

const clampRating = (value) => Math.max(0, Math.min(5, Math.round(Number(value || 0) * 2) / 2));

function CoffeeBeanIcon({ size = 18, className = '', filled = false, title, style, tone = 'dark' }) {
  const scale = size / BEAN_SOURCE_WIDTH;
  const useDarkBean = tone === 'light' ? filled : !filled;
  const sourceX = useDarkBean ? DARK_BEAN_SOURCE_X : BEAN_SOURCE_X;
  const sourceY = useDarkBean ? DARK_BEAN_SOURCE_Y : BEAN_SOURCE_Y;

  return (
    <span
      className={`coffee-bean-icon ${className}`}
      style={{
        width: size,
        height: BEAN_SOURCE_HEIGHT * scale,
        backgroundImage: `url("${SHEET_URL}")`,
        backgroundSize: `${SHEET_WIDTH * scale}px ${SHEET_HEIGHT * scale}px`,
        backgroundPosition: `${-sourceX * scale}px ${-sourceY * scale}px`,
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
        backgroundPosition: `${-RATING_SOURCE_LEFT * scale}px ${-(RATING_SOURCE_TOP + (row * RATING_ROW_HEIGHT)) * scale}px`,
      }}
      role="img"
      aria-label={`${label}: ${rating.toFixed(1)} de 5`}
    />
  );
}

export default CoffeeBeanIcon;
