import test from 'node:test';
import assert from 'node:assert/strict';
import { permanentlyDeleteCafe } from '../src/utils/deleteCafes.js';

const clientFor = (response, calls = []) => ({ from(table) {
  calls.push(['from', table]);
  return { delete() { calls.push(['delete']); return this; }, eq(field, value) { calls.push(['eq', field, value]); return this; }, select(fields) { calls.push(['select', fields]); return this; }, async single() { return response; } };
} });

test('permanent removal deletes only the chosen cafe and requires server confirmation', async () => {
  const calls = [];
  assert.equal(await permanentlyDeleteCafe(clientFor({ data: { id: 'chosen' }, error: null }, calls), 'chosen'), 'chosen');
  assert.deepEqual(calls, [['from', 'cafes'], ['delete'], ['eq', 'id', 'chosen'], ['select', 'id']]);
});

test('permission errors and unconfirmed deletions never report success', async () => {
  const denied = new Error('Permission denied');
  await assert.rejects(permanentlyDeleteCafe(clientFor({ data: null, error: denied }), 'chosen'), /Permission denied/);
  await assert.rejects(permanentlyDeleteCafe(clientFor({ data: null, error: null }), 'chosen'), /confirmar/);
  await assert.rejects(permanentlyDeleteCafe(clientFor({ data: { id: 'other' }, error: null }), 'chosen'), /confirmar/);
  await assert.rejects(permanentlyDeleteCafe(clientFor({}), ''), /Falta/);
});
