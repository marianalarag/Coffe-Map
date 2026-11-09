import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCafeInteractions, filterCafeVisitStatus } from '../src/utils/cafeInteractions.js';
import { getPersonalCafeRating } from '../src/utils/personalRating.js';
import { formatAverageRating, formatRating } from '../src/utils/formatRating.js';

const visits = [
  { id: 'rated', cafe_id: 'a', is_visited: true, is_favorite: true, rating: 3.5, visited_on: '2026-09-01', rated_at: '2026-09-02T10:00:00Z', updated_at: '2026-09-02' },
  { id: 'repeat', cafe_id: 'a', is_visited: true, is_favorite: true, rating: null, visited_on: '2026-11-06', updated_at: '2026-11-06' },
  { id: 'marked', cafe_id: 'b', is_visited: true, is_favorite: false, rating: null, updated_at: '2026-11-06' },
  { id: 'saved', cafe_id: 'c', is_visited: false, is_favorite: true, in_waitlist: true, rating: null, updated_at: '2026-11-06' },
];

test('favorites are unique cafe preferences, while visits retain their count', () => {
  const summaries = [...summarizeCafeInteractions(visits).values()];
  assert.deepEqual(summaries.filter((item) => item.is_favorite).map((item) => item.cafe_id).sort(), ['a', 'c']);
  assert.equal(summaries.find((item) => item.cafe_id === 'a').visitCount, 2);
  assert.equal(summaries.find((item) => item.cafe_id === 'a').rating, 3.5);
  assert.equal(visits.length, 4);
});

test('unfavoriting does not resurrect a favorite copied into an older visit', () => {
  const next = [...visits, { id: 'unfavorite', cafe_id: 'a', is_visited: true, is_favorite: false, updated_at: '2026-11-07' }];
  assert.equal(summarizeCafeInteractions(next).get('a').is_favorite, false);
});

test('marking visited without a rating never adds a cafe to recently rated', () => {
  const summaries = [...summarizeCafeInteractions(visits).values()];
  assert.deepEqual(summaries.filter((item) => item.ratedInteraction).map((item) => item.cafe_id), ['a']);
  assert.equal(getPersonalCafeRating(visits, 'b'), 0);
});

test('ratings use their own timestamp rather than favorite or visit edit timestamps', () => {
  const entries = [
    { cafe_id: 'a', rating: 5, rated_at: '2026-09-01', visited_on: '2026-11-01', updated_at: '2026-12-01' },
    { cafe_id: 'a', rating: 3, rated_at: '2026-10-01', visited_on: '2026-08-01', updated_at: '2026-10-01' },
  ];
  assert.equal(getPersonalCafeRating(entries, 'a'), 3);
});

test('visit filters use all visit records and do not treat saved favorites as visits', () => {
  const summaries = summarizeCafeInteractions([...visits, { cafe_id: 'a', is_visited: false, updated_at: '2026-12-01' }]);
  assert.equal(filterCafeVisitStatus({ id: 'a' }, 'visited', summaries), true);
  assert.equal(filterCafeVisitStatus({ id: 'c' }, 'visited', summaries), false);
  assert.equal(filterCafeVisitStatus({ id: 'c' }, 'unvisited', summaries), true);
  assert.equal(filterCafeVisitStatus({ id: 'unknown' }, 'all', summaries), true);
});

test('public averages retain tenths while personal scores retain half points', () => {
  assert.equal(formatAverageRating(3.8), '3.8');
  assert.equal(formatAverageRating(4), '4');
  assert.equal(formatAverageRating(null), '—');
  assert.equal(formatRating(3.5), '3.5');
});
