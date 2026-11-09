import { getLatestRatedInteraction } from './personalRating.js';

// A cafe's saved preferences are unique; diary visits remain separate records.
export function summarizeCafeInteractions(interactions) {
  const grouped = new Map();
  for (const item of [...interactions].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))) {
    const summary = grouped.get(item.cafe_id);
    if (!summary) grouped.set(item.cafe_id, { ...item, is_visited: Boolean(item.is_visited), visitCount: item.is_visited ? 1 : 0 });
    else {
      summary.is_visited ||= Boolean(item.is_visited);
      if (item.is_visited) summary.visitCount += 1;
    }
  }
  for (const [id, summary] of grouped) {
    const rated = getLatestRatedInteraction(interactions, id);
    summary.rating = Number(rated?.rating) || 0;
    summary.ratedInteraction = rated;
  }
  return grouped;
}

export function filterCafeVisitStatus(cafe, status, summaries) {
  if (status === 'all') return true;
  const visited = Boolean(summaries.get(cafe.id)?.is_visited);
  return status === 'visited' ? visited : !visited;
}
