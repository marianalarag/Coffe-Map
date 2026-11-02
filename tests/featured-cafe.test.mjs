import assert from 'node:assert/strict';
import test from 'node:test';
import { pickFeaturedCafe } from '../src/utils/featuredCafe.js';

const cafes = Array.from({ length: 6 }, (_, index) => ({ id: `c${index}`, nombre: `Café ${index}`, lat: 21 + index * .001, lng: -89.6, imageUrl: 'image.jpg', category: 'cafeteria', created_at: '2025-01-01' }));
test('home rotates across entries without repeating the previous cafe, including when all were visited', () => {
  for (const interactions of [[], cafes.map((cafe) => ({ cafe_id: cafe.id, is_visited: true }))]) {
    const history = [];
    for (let visit = 0; visit < 15; visit += 1) {
      const next = pickFeaturedCafe({ cafes, interactions, userId: 'mariana', history, visit });
      assert.notEqual(next.id, history.at(-1)); history.push(next.id);
    }
    assert.equal(new Set(history.slice(0, 6)).size, 6);
  }
});
test('a new unseen cafe enters the selection immediately and is not repeated on the next entry', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const fresh = { ...cafes[0], id: 'new', created_at: '2026-11-01T12:00:00Z' };
  assert.equal(pickFeaturedCafe({ cafes: [...cafes, fresh], userId: 'mariana', now }).id, 'new');
  assert.notEqual(pickFeaturedCafe({ cafes: [...cafes, fresh], userId: 'mariana', now, history: ['new'], visit: 1 }).id, 'new');
});
test('personalized selections vary by account, and prefer an unvisited cafe when available', () => {
  const picks = ['a','b','c','d','e'].map((userId) => pickFeaturedCafe({ cafes, userId }).id);
  assert.ok(new Set(picks).size > 1);
  const interactions = cafes.slice(0, 5).map((cafe) => ({ cafe_id: cafe.id, is_visited: true }));
  assert.equal(pickFeaturedCafe({ cafes, interactions }).id, 'c5');
});
test('empty and single-cafe catalogs remain usable', () => {
  assert.equal(pickFeaturedCafe({ cafes: [] }), null);
  assert.equal(pickFeaturedCafe({ cafes: [cafes[0]], history: ['c0'] }).id, 'c0');
});
