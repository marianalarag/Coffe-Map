import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTikTokPost, getTikTokCoverUrl } from '../src/utils/tiktok.js';
import { extractTikTokMetadata, isTikTokImageUrl, resolveTikTokMetadata } from '../server/tiktok.js';
import tiktokCover from '../api/tiktok-cover.js';

const htmlFor = (item) => `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: item } } } })}</script>`;

test('extracts the post cover and first photo without mixing in another post', () => {
  const post = parseTikTokPost('https://www.tiktok.com/@cafe/video/7581881758937877768?tracking=1');
  assert.equal(post.url, 'https://www.tiktok.com/@cafe/video/7581881758937877768');
  const item = { id: post.id, desc: 'Cafe', video: { cover: 'https://p16.tiktokcdn.com/cover.jpg' } };
  assert.equal(extractTikTokMetadata(htmlFor(item), post).cover, item.video.cover);
  item.imagePost = { images: [{ imageURL: { urlList: ['https://p16.tiktokcdn.com/photo.jpg'] } }] };
  assert.equal(extractTikTokMetadata(htmlFor(item), post).cover, item.imagePost.images[0].imageURL.urlList[0]);
  assert.equal(extractTikTokMetadata(htmlFor({ ...item, id: 'another-post' }), post), null);
  assert.equal(extractTikTokMetadata(htmlFor({ ...item, privateItem: true }), post), null);
});

test('rejects unrelated hosts, credentials and invalid post IDs', () => {
  assert.equal(parseTikTokPost('https://tiktok.com.evil.test/@cafe/video/7581881758937877768'), null);
  assert.equal(parseTikTokPost('https://user@www.tiktok.com/@cafe/video/7581881758937877768'), null);
  assert.equal(isTikTokImageUrl('https://tiktokcdn.com.evil.test/cover.jpg'), false);
  assert.equal(isTikTokImageUrl('http://127.0.0.1/cover.jpg'), false);
  assert.equal(getTikTokCoverUrl('https://www.tiktok.com/@cafe/photo/7535254341049994504?tracking=1').includes('tracking'), false);
});

test('normalizes photo posts for public metadata and serves the resulting cover bytes', async (context) => {
  const id = '7535254341049994505';
  const calls = [];
  context.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    if (String(url).startsWith('https://p16.tiktokcdn.com/')) return new Response(new Uint8Array([255, 216, 255]), { headers: { 'content-type': 'image/jpeg' } });
    return new Response(htmlFor({ id, imagePost: { images: [{ imageURL: { urlList: ['https://p16.tiktokcdn.com/first-photo.jpg'] } }] } }));
  });
  const response = { code: 200, headers: {}, status(code) { this.code = code; return this; }, setHeader(key, value) { this.headers[key] = value; }, end() {}, send(body) { this.body = body; } };
  await tiktokCover({ query: { url: `https://www.tiktok.com/@cafe/photo/${id}` } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.headers['Content-Type'], 'image/jpeg');
  assert.equal(response.body.length, 3);
  assert.ok(calls[0].includes(`/video/${id}`));
  assert.ok(response.headers['Cache-Control'].includes('s-maxage='));
});

test('does not follow a short-link redirect outside TikTok', async (context) => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => { calls += 1; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }); });
  assert.equal(await resolveTikTokMetadata('https://vm.tiktok.com/fixture'), null);
  assert.equal(calls, 1);
});
