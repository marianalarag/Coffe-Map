export const formatRating = (value) => {
  const rating = Math.round(Number(value || 0) * 2) / 2;
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
};

// Public averages retain tenths; individual ratings still use half points.
export const formatAverageRating = (value) => {
  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? rating.toFixed(1).replace(/\.0$/, '') : '—';
};
