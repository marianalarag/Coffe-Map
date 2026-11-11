import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCafeEditorPatch, createCafeDraft, editableCafeSchedule, hasCafeDraftChanges, normalizeCafeEditorUrl, saveCafeEditorPatch, serializeCafeSchedule } from '../src/utils/cafeEditor.js';

const original = () => createCafeDraft({ nombre: 'Café de prueba', category: 'cafeteria', address: 'Centro', instagram_url: 'https://instagram.com/cafe', opening_hours: 'Mo-Fr 08:00-18:00', menuImages: ['https://example.com/menu.jpg'] });

test('an unchanged draft sends no update and editing one field preserves unrelated data', () => {
  const base = original();
  assert.equal(hasCafeDraftChanges(base, { ...base }), false);
  assert.deepEqual(buildCafeEditorPatch(base, base), {});
  const draft = { ...base, nombre: ' Nuevo nombre ', rating: 5, role: 'administrador', status: 'closed' };
  assert.equal(hasCafeDraftChanges(base, draft), true);
  assert.deepEqual(buildCafeEditorPatch(base, draft, 'now'), { nombre: 'Nuevo nombre', updated_at: 'now' });
});

test('empty optional fields remove the stored value and an empty cafe name is rejected', () => {
  const base = original();
  assert.deepEqual(buildCafeEditorPatch(base, { ...base, instagram_url: '' }, 'now'), { instagram_url: null, updated_at: 'now' });
  assert.throws(() => buildCafeEditorPatch(base, { ...base, nombre: '  ' }), /obligatorio/);
});

test('social URLs accept handles and reject executable schemes, credentials and lookalike hosts', () => {
  assert.equal(normalizeCafeEditorUrl('@cafe.local', 'Instagram', 'instagram.com'), 'https://instagram.com/cafe.local');
  assert.equal(normalizeCafeEditorUrl('example.com/menu.pdf', 'menú'), 'https://example.com/menu.pdf');
  assert.equal(normalizeCafeEditorUrl('@cafecito', 'TikTok', 'tiktok.com'), 'https://www.tiktok.com/@cafecito');
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'https://tiktok.com.evil.com/video/1', 'https://user:pass@tiktok.com/']) {
    assert.throws(() => normalizeCafeEditorUrl(value, 'TikTok', 'tiktok.com'), /válido/);
  }
});

test('hours preserve split shifts, overnight closing, 24-hour schedules and explicit closed days', () => {
  const hours = editableCafeSchedule('Mo 08:00-12:00,16:00-23:00; Fr 20:00-02:00; Su off');
  assert.deepEqual(hours.Mo, ['08:00-12:00', '16:00-23:00']);
  assert.match(serializeCafeSchedule(hours), /Fr 20:00-02:00/);
  assert.match(serializeCafeSchedule(hours), /Su off/);
  assert.deepEqual(editableCafeSchedule('24/7').Mo, ['00:00-24:00']);
  const base = original();
  const patch = buildCafeEditorPatch(base, { ...base, opening_hours: serializeCafeSchedule(editableCafeSchedule(null)) }, 'now');
  assert.match(patch.opening_hours, /Mo off/);
  assert.equal(patch.opening_hours_source, 'admin');
  assert.equal(patch.opening_hours_verified_at, 'now');
  assert.throws(() => serializeCafeSchedule({ Mo: ['26:00-18:00'] }), /Revisa/);
});

test('changing cover clears old attribution and menu removal and ordering are persisted together', () => {
  const base = original();
  base.image_url = 'https://example.com/old.jpg';
  const patch = buildCafeEditorPatch(base, { ...base, image_url: '', menuImages: [] }, 'now');
  assert.equal(patch.image_url, null);
  assert.equal(patch.image_attribution, null);
  assert.equal(patch.image_source_url, null);
  assert.equal(patch.image_license, null);
  assert.equal(patch.menu_url, '[]');
  assert.equal(buildCafeEditorPatch(base, { ...base, menuImages: ['https://example.com/b.jpg', ...base.menuImages] }).menu_url, '["https://example.com/b.jpg","https://example.com/menu.jpg"]');
});

test('a denied or unconfirmed write is never reported as saved', async () => {
  const calls = [];
  const client = (reply) => ({ from(table) {
    calls.push(table);
    return {
      update(patch) { calls.push(patch); return this; },
      eq(key, value) { calls.push([key, value]); return this; },
      is(key, value) { calls.push([key, value]); return this; },
      select() { return this; }, single: async () => reply,
    };
  } });
  await assert.rejects(saveCafeEditorPatch(client({ data: null, error: { message: 'permission denied' } }), 'cafe:1', { nombre: 'Nuevo' }), { message: 'permission denied' });
  await assert.rejects(saveCafeEditorPatch(client({ data: null, error: null }), 'cafe:1', {}), /confirmar/);
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === 'deleted_at' && call[1] === null));
  assert.equal((await saveCafeEditorPatch(client({ data: { id: 'cafe:1', nombre: 'Nuevo' } }), 'cafe:1', { nombre: 'Nuevo' })).nombre, 'Nuevo');
});
