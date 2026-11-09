import test from 'node:test';
import assert from 'node:assert/strict';
import { softDeleteCafes } from '../src/utils/deleteCafes.js';

function fakeClient(reply) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table };
      calls.push(call);
      return {
        update(patch) { call.patch = patch; return this; },
        in(column, ids) { call.column = column; call.ids = ids; return this; },
        async select(columns) {
          call.columns = columns;
          return reply ? reply(call, calls.length) : { data: call.ids.map((id) => ({ id })), error: null };
        },
      };
    },
  };
}

test('only selected unique IDs are soft-deleted, preserving the import tombstone', async () => {
  const client = fakeClient();
  const result = await softDeleteCafes(client, ['a', 'b', 'a']);
  assert.deepEqual(result.deletedIds, ['a', 'b']);
  assert.equal(result.error, '');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].table, 'cafes');
  assert.equal(client.calls[0].column, 'id');
  assert.deepEqual(client.calls[0].ids, ['a', 'b']);
  assert.equal(client.calls[0].patch.status, 'closed');
  assert.equal(client.calls[0].patch.deleted_at, result.deletedAt);
  assert.equal(client.calls[0].patch.updated_at, result.deletedAt);
});

test('an empty selection never sends an update', async () => {
  const client = fakeClient();
  assert.deepEqual((await softDeleteCafes(client, [])).deletedIds, []);
  assert.equal(client.calls.length, 0);
});

test('a large selection is processed in bounded batches', async () => {
  const client = fakeClient();
  const ids = Array.from({ length: 391 }, (_, index) => `cafe-${index}`);
  const result = await softDeleteCafes(client, ids);
  assert.deepEqual(result.deletedIds, ids);
  assert.deepEqual(client.calls.map((call) => call.ids.length), [100, 100, 100, 91]);
});

test('a failed batch preserves confirmed successes and leaves the rest for retry', async () => {
  const client = fakeClient((call, index) => index === 2
    ? { data: null, error: { message: 'Sin conexión' } }
    : { data: call.ids.map((id) => ({ id })), error: null });
  const ids = Array.from({ length: 230 }, (_, index) => `cafe-${index}`);
  const result = await softDeleteCafes(client, ids);
  assert.deepEqual(result.deletedIds, ids.slice(0, 100));
  assert.equal(result.error, 'Sin conexión');
  assert.equal(client.calls.length, 2);
  const retry = fakeClient();
  const remaining = ids.filter((id) => !result.deletedIds.includes(id));
  assert.deepEqual((await softDeleteCafes(retry, remaining)).deletedIds, ids.slice(100));
});

test('rows omitted by permissions are not reported as deleted', async () => {
  const client = fakeClient(() => ({ data: [{ id: 'a' }], error: null }));
  const result = await softDeleteCafes(client, ['a', 'b']);
  assert.deepEqual(result.deletedIds, ['a']);
  assert.match(result.error, /permisos/);
});

test('network exceptions are returned without claiming successful deletion', async () => {
  const client = fakeClient(() => { throw new Error('Red no disponible'); });
  const result = await softDeleteCafes(client, ['a']);
  assert.deepEqual(result.deletedIds, []);
  assert.equal(result.error, 'Red no disponible');
});
