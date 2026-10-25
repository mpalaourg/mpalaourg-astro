import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const compiled = await build({ entryPoints: ['src/pages/api/chat/consent.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { ALL } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
async function request(choice, { origin = 'https://site.test', method = 'POST' } = {}) {
  const writes = [];
  const url = new URL('https://site.test/api/chat/consent');
  const response = await ALL({ url, cookies: { set: (name, value, options) => writes.push({ name, value, options }) }, request: new Request(url, {
    method, headers: { origin, 'Content-Type': 'application/json', 'X-Chat-Language': 'el' }, body: method === 'POST' ? JSON.stringify({ choice }) : undefined,
  }) });
  return { response, writes, data: await response.json() };
}
test('explicit acceptance sets only the versioned choice cookie', async () => {
  const { response, writes } = await request('accepted');
  assert.equal(response.status, 200); assert.equal(writes.length, 1);
  assert.equal(writes[0].name, 'site_cookie_choice'); assert.equal(writes[0].value, 'chat-v2-accepted');
  assert.equal(writes[0].options.secure, true); assert.equal(writes[0].options.sameSite, 'strict');
});
test('declining remembers the choice and expires both chat-session cookie names', async () => {
  const { response, writes } = await request('declined');
  assert.equal(response.status, 200); assert.equal(writes[0].value, 'chat-v2-declined');
  assert.deepEqual(writes.slice(1).map(w => [w.name, w.options.maxAge]), [['__Host-site_chat', 0], ['site_chat', 0]]);
});
test('consent endpoint rejects cross-site, invalid and non-POST requests without setting cookies', async () => {
  for (const [choice, options, expected] of [['accepted', { origin: 'https://evil.test' }, 403], ['accepted', { method: 'GET' }, 405], ['dismissed', {}, 400]]) {
    const result = await request(choice, options); assert.equal(result.response.status, expected); assert.equal(result.writes.length, 0);
    assert.match(result.data.error, /[Α-Ωα-ω]/);
  }
});
