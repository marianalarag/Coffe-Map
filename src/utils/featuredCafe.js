const bakeryPattern = /panader|bakery|pasteler|reposter|bake|bread|croissant|boulanger/i;
export const getCafeCategory = (cafe) => cafe?.category === 'panaderia' || bakeryPattern.test(cafe?.nombre || '') ? 'panaderia' : 'cafeteria';
const hash = (value) => { let result = 2166136261; for (const char of value) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); } return result >>> 0; };
const distance = (a, b) => {
  if (![a.lat, a.lng, b.lat, b.lng].every((value) => value != null && Number.isFinite(Number(value)))) return Infinity;
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(a.lat - b.lat), dLng = radians(a.lng - b.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

export function pickFeaturedCafe({ cafes, interactions = [], userId = 'guest', history = [], visit = 0, now = Date.now() }) {
  if (!cafes.length) return null;
  const byId = new Map(cafes.map((cafe) => [cafe.id, cafe]));
  const visited = new Set(interactions.filter((item) => item.is_visited).map((item) => item.cafe_id));
  const favorites = new Set(interactions.filter((item) => item.is_favorite).map((item) => item.cafe_id));
  const anchors = interactions.filter((item) => item.is_favorite || Number(item.rating) >= 4).map((item) => ({ cafe: byId.get(item.cafe_id), weight: item.is_favorite ? 2 : 1 })).filter((item) => item.cafe);
  const unvisited = cafes.filter((cafe) => !visited.has(cafe.id));
  const newToUser = unvisited.filter((cafe) => !favorites.has(cafe.id));
  let candidates = newToUser.length ? newToUser : unvisited.length ? unvisited : cafes;
  // Never repeat the previous hero when another cafe is available, even if all were visited.
  const lastId = history.at(-1);
  const alternatives = candidates.filter((cafe) => cafe.id !== lastId);
  if (alternatives.length) candidates = alternatives;
  else if (cafes.length > 1) candidates = cafes.filter((cafe) => cafe.id !== lastId);
  const unseen = candidates.filter((cafe) => !history.includes(cafe.id));
  if (unseen.length) candidates = unseen;
  const fresh = candidates.filter((cafe) => {
    const age = now - new Date(cafe.created_at || '').getTime();
    return age >= 0 && age < 14 * 24 * 60 * 60 * 1000 && !history.includes(cafe.id);
  });
  // Newly accepted cafes enter the rotation immediately instead of competing with old rankings.
  if (fresh.length) candidates = fresh;
  const ranked = candidates.map((cafe) => ({ cafe, score: anchors.reduce((best, anchor) => Math.max(best, anchor.weight / (1 + distance(anchor.cafe, cafe) / 3.5) + (getCafeCategory(anchor.cafe) === getCafeCategory(cafe) ? .5 : 0)), 0) + Number(cafe.rating || 0) * .2 + (cafe.imageUrl ? .3 : 0) })).sort((a, b) => b.score - a.score || a.cafe.id.localeCompare(b.cafe.id));
  const shortlist = ranked.slice(0, 8);
  const index = (hash(`${userId}:${shortlist.map((item) => item.cafe.id).join(':')}`) + visit) % shortlist.length;
  return shortlist[index]?.cafe || cafes[0];
}
