import test from 'node:test';
import assert from 'node:assert/strict';
import { processCafeRequestBatch } from '../src/utils/cafeRequestBatch.js';

const request = (id, status = 'needs_review') => ({ id, nombre: `Café ${id}`, status });
test('batch moderation handles each pending request once and preserves failures for retry', async () => {
  const calls = [];
  const progress = [];
  const result = await processCafeRequestBatch([request('a'), request('b'), request('a'), request('c', 'active'), request('d')], 'active', async (cafe, status) => {
    calls.push([cafe.id, status]);
    if (cafe.id === 'b') throw new Error('Ubicación sin confirmar');
    return { id: cafe.id, status };
  }, (value) => progress.push(value));
  assert.deepEqual(calls, [['a', 'active'], ['b', 'active'], ['d', 'active']]);
  assert.deepEqual(result.processedIds, ['a', 'd']);
  assert.deepEqual(result.failed, [{ id: 'b', nombre: 'Café b', error: 'Ubicación sin confirmar' }]);
  assert.deepEqual(progress, [{ completed: 3, total: 3 }]);
});
test('batch rejection is bounded and does not claim an unconfirmed result', async () => {
  let active = 0;
  let peak = 0;
  const result = await processCafeRequestBatch(Array.from({ length: 8 }, (_, i) => request(`${i}`)), 'closed', async (cafe, status) => {
    assert.equal(status, 'closed');
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return cafe.id === '5' ? false : true;
  });
  assert.equal(peak, 3);
  assert.equal(result.processedIds.length, 7);
  assert.equal(result.failed[0].id, '5');
  await assert.rejects(processCafeRequestBatch([request('a')], 'deleted', () => {}), /inválida/);
});
