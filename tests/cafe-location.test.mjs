import test from 'node:test';
import assert from 'node:assert/strict';
import mapsLocation from '../api/maps-location.js';
import { extractGoogleMapsCoordinates, getCafeCoordinates, isGoogleMapsLink } from '../src/utils/cafeLocation.js';

test('reads place coordinates in both Maps data formats', () => {
  assert.deepEqual(extractGoogleMapsCoordinates('https://www.google.com/maps/place/Cafe/data=!3d20.98!4d-89.61'), { lat: 20.98, lng: -89.61 });
  assert.deepEqual(extractGoogleMapsCoordinates('https://www.google.com/maps/place/Cafe/data=!2d-89.61!3d20.98'), { lat: 20.98, lng: -89.61 });
  assert.equal(getCafeCoordinates({ lat: null, lng: null }), null);
  assert.equal(getCafeCoordinates({ lat: '', lng: '' }), null);
  assert.equal(isGoogleMapsLink('https://google.com/maps/place/Cafe'), true);
  assert.equal(isGoogleMapsLink('ftp://google.com/maps/place/Cafe'), false);
});

const callHandler = async (url) => {
  const response = {
    code: 200, payload: null,
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; },
    setHeader() {},
  };
  await mapsLocation({ query: { url } }, response);
  return response;
};

test('resolves a short Maps link without requesting its blocked destination', async (context) => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    if (calls > 1) throw new Error('Destination must not be requested');
    return new Response(null, { status: 302, headers: { location: 'https://www.google.com/maps/place/Cafe/data=!3d20.98!4d-89.61' } });
  });
  const result = await callHandler('https://maps.app.goo.gl/example');
  assert.equal(result.code, 200);
  assert.deepEqual(result.payload, { lat: 20.98, lng: -89.61 });
  assert.equal(calls, 1);
});

test('does not follow short-link redirects outside the allowed Maps hosts', async (context) => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  });
  const result = await callHandler('https://maps.app.goo.gl/example');
  assert.equal(result.code, 404);
  assert.equal(calls, 1);
});

test('handles unavailable Maps pages and invalid input without coordinates', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429 }));
  assert.equal((await callHandler('https://maps.app.goo.gl/example')).code, 404);
  assert.equal((await callHandler('https://example.com/maps')).code, 400);
  assert.equal((await callHandler('ftp://maps.google.com/maps')).code, 400);
});
