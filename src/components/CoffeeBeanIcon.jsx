const SHEET_URL = '/ratings.png';
const SHEET_WIDTH = 247;
const SHEET_HEIGHT = 637;
const LIGHT_BEAN_URL = '/coffee-bean-light.png';
const DARK_BEAN_URL = '/coffee-bean-dark.png';
import { formatRating } from '../utils/formatRating';
const BEAN_ASSET_WIDTH = 41;
const BEAN_ASSET_HEIGHT = 33;
const RATING_ROW_HEIGHT = 56.7;
const RATING_SOURCE_LEFT = 5;
const RATING_SOURCE_TOP = 7;
const RATING_SOURCE_WIDTH = 195;
const RATING_SOURCE_HEIGHT = 25;

const clampRating = (value) => Math.max(0, Math.min(5, Math.round(Number(value || 0) * 2) / 2));

function CoffeeBeanIcon({ size = 18, className = '', filled = false, fill, title, style, tone = 'dark' }) {
  const isFilled = typeof fill === 'string' ? fill !== 'none' : filled;
  const useDarkBean = tone === 'light' ? isFilled : !isFilled;
  const beanHeight = size * (BEAN_ASSET_HEIGHT / BEAN_ASSET_WIDTH);
  const beanUrl = useDarkBean ? DARK_BEAN_URL : LIGHT_BEAN_URL;

  return (
    <span
      className={`coffee-bean-icon ${className}`}
      style={{
        width: size,
        height: beanHeight,
        backgroundImage: `url("${beanUrl}")`,
        backgroundSize: `${size}px ${beanHeight}px`,
        backgroundPosition: 'center',
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
      aria-label={`${label}: ${formatRating(rating)} de 5`}
    />
  );
}

export default CoffeeBeanIcon;
