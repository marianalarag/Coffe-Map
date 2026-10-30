export const getPersonalCafeRating = (interactions, cafeId) => {
  const rated = interactions.filter((visit) => visit.cafe_id === cafeId && Number(visit.rating) > 0)
    .sort((a, b) => String(b.visited_on || b.updated_at || '').slice(0, 10).localeCompare(String(a.visited_on || a.updated_at || '').slice(0, 10))
      || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return Number(rated[0]?.rating) || 0;
};
