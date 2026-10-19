export const formatRating = (value) => {
  const rating = Math.round(Number(value || 0) * 2) / 2;
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
};
