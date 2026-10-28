import test from 'node:test';
import assert from 'node:assert/strict';
import { createCafeSubmissionsHandler } from '../api/cafe-submissions.js';

const makeClient = ({ role = 'usuario', cafe = { id: 'community:test', nombre: 'Cafe', link: 'https://maps.app.goo.gl/place' } } = {}) => {
  const writes = [];
  const client = {
    writes,
    auth: { getUser: async () => ({ data: { user: { id: 'caller' } } }) },
    from(table) {
      const query = {
        select() { return this; }, eq() { return this; },
        single: async () => ({ data: table === 'profiles' ? { role } : cafe }),
        insert(row) { writes.push({ table, row }); return Promise.resolve({ error: null }); },
        update(row) { writes.push({ table, row }); return this; },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      return query;
    },
  };
  return client;
};
const invoke = async (handler, { method = 'POST', body = {}, token = 'valid' } = {}) => {
  const response = { code: 200, payload: null, setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
  await handler({ method, body, headers: token ? { authorization: `Bearer ${token}` } : {} }, response);
  return response;
};
const submission = { nombre: 'VITA Memories', address: 'Calle 57 #207 por 42 y 44, Francisco de Montejo', link: 'https://maps.app.goo.gl/place' };

test('accepts address and Maps link when Maps is temporarily unavailable', async () => {
  const client = makeClient();
  const handler = createCafeSubmissionsHandler({ getClient: () => client, resolveLocation: async () => null });
  const result = await invoke(handler, { body: submission });
  assert.equal(result.code, 201);
  assert.equal(result.payload.locationPending, true);
  assert.equal(client.writes[0].row.lat, null);
  assert.equal(client.writes[0].row.lng, null);
  assert.equal(client.writes[0].row.status, 'needs_review');
  assert.equal(client.writes[0].row.address, submission.address);
  assert.equal(client.writes[0].row.link, submission.link);
});

test('takes coordinates and identity from the server, ignoring supplied GPS or publication status', async () => {
  const client = makeClient();
  const handler = createCafeSubmissionsHandler({ getClient: () => client, resolveLocation: async () => ({ lat: 21.0236463, lng: -89.6429422, sourceUrl: submission.link }) });
  const result = await invoke(handler, { body: { ...submission, lat: 0, lng: 0, submitted_by: 'someone-else', status: 'active' } });
  assert.equal(result.code, 201);
  assert.equal(client.writes[0].row.lat, 21.0236463);
  assert.equal(client.writes[0].row.submitted_by, 'caller');
  assert.equal(client.writes[0].row.status, 'needs_review');
});

test('requires login and administrator approval', async () => {
  const client = makeClient();
  const handler = createCafeSubmissionsHandler({ getClient: () => client });
  assert.equal((await invoke(handler, { token: null })).code, 401);
  assert.equal((await invoke(handler, { method: 'PATCH', body: { id: 'community:test' } })).code, 403);
  assert.equal(client.writes.length, 0);
});

test('approval retries Google on the server and publishes its exact coordinates', async () => {
  const client = makeClient({ role: 'administrador' });
  const handler = createCafeSubmissionsHandler({ getClient: () => client, resolveLocation: async () => ({ lat: 21.0236463, lng: -89.6429422, sourceUrl: submission.link }) });
  const result = await invoke(handler, { method: 'PATCH', body: { id: 'community:test' } });
  assert.equal(result.code, 200);
  assert.equal(client.writes[0].row.status, 'active');
  assert.equal(client.writes[0].row.lat, 21.0236463);
  assert.equal(client.writes[0].row.lng, -89.6429422);
});

test('approval preserves a pending request when exact coordinates are unavailable', async () => {
  const client = makeClient({ role: 'administrador' });
  const handler = createCafeSubmissionsHandler({ getClient: () => client, resolveLocation: async () => null });
  assert.equal((await invoke(handler, { method: 'PATCH', body: { id: 'community:test' } })).code, 422);
  assert.equal(client.writes.length, 0);
});
