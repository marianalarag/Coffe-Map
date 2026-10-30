import test from 'node:test';
import assert from 'node:assert/strict';
import {compareActivityDates} from '../src/utils/activityDate.js';
import {getPersonalCafeRating} from '../src/utils/personalRating.js';

test('activity uses the assigned date; later editing does not move an old visit to the top',()=>{
  const rows=[{id:'old',visited_on:'2026-01-01',created_at:'2026-10-30T10:00:00Z',updated_at:'2026-12-01T00:00:00Z'},
    {id:'new',visited_on:'2026-10-29',created_at:'2026-10-29T10:00:00Z'},
    {id:'post',created_at:'2026-10-30T09:00:00Z'}];
  assert.deepEqual(rows.sort(compareActivityDates).map(row=>row.id),['post','new','old']);
});
test('a profile card uses the most recent personal rating, ignoring an unrated later visit and cafe averages',()=>{
  const visits=[{id:'a',cafe_id:'cafe',rating:5,visited_on:'2026-10-28'},
    {id:'b',cafe_id:'cafe',rating:3.5,visited_on:'2026-10-29'},
    {id:'c',cafe_id:'cafe',rating:null,visited_on:'2026-10-30'},
    {id:'d',cafe_id:'other',rating:4.5,visited_on:'2026-10-30'}];
  assert.equal(getPersonalCafeRating(visits,'cafe'),3.5);
  assert.equal(getPersonalCafeRating(visits,'unrated'),0);
});
