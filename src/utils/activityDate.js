export const activityDate = (post) => post.visited_on || post.created_at || '';
export const compareActivityDates = (a, b) => activityDate(b).slice(0, 10).localeCompare(activityDate(a).slice(0, 10))
  || String(b.created_at || '').localeCompare(String(a.created_at || '')) || String(b.id).localeCompare(String(a.id));
