export const getLatestRatedInteraction = (interactions, cafeId) => {
  const rated = interactions.filter((visit) => visit.cafe_id === cafeId && Number(visit.rating) > 0)
    .sort((a, b) => (a.rated_at && b.rated_at ? String(b.rated_at).localeCompare(String(a.rated_at)) : 0)
      || String(b.visited_on || b.updated_at || '').slice(0, 10).localeCompare(String(a.visited_on || a.updated_at || '').slice(0, 10))
      || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return rated[0] || null;
};

export const getPersonalCafeRating = (interactions, cafeId) => Number(getLatestRatedInteraction(interactions, cafeId)?.rating) || 0;
