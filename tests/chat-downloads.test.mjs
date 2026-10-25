import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { unzipSync, strFromU8 } from 'fflate';
const compiled = await build({ entryPoints: ['src/lib/chat/downloads.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { replyFiles, replyZip } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const refs = [{ url: '/media/files/resume_en.pdf' }, { url: '/media/files/ism2021_preprint.pdf' }];
test('downloads include unique cited public documents only, never pages, code, archives, or remote URLs', () => {
  const files = replyFiles([...refs, refs[0], { url: '/about/' }, { url: 'https://evil.test/file.pdf' }, { url: '/media/files/private.pdf' }, { url: '/media/files/from_workflows_to_agents_workshop.zip' }]);
  assert.deepEqual(files.map(file=>file.filename), ['resume_en.pdf', 'ism2021_preprint.pdf']);
  assert.deepEqual(replyFiles([{url:'/formula/'}]), []);
});
test('ZIP requires multiple documents and contains the expected file bytes with safe filenames', async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => { calls.push(url); assert.equal(options.redirect,'error'); assert.equal(options.credentials,'omit'); return new Response(`%PDF-${url}`); };
  try {
    await assert.rejects(replyZip([refs[0]]), /Multiple/);
    const zip = unzipSync(await replyZip(refs));
    assert.deepEqual(Object.keys(zip), ['resume_en.pdf', 'ism2021_preprint.pdf']);
    assert.match(strFromU8(zip['resume_en.pdf']), /^%PDF-/);
    assert.deepEqual(calls, refs.map(ref=>ref.url));
  } finally { globalThis.fetch = original; }
});
test('ZIP rejects error pages and oversized responses rather than downloading arbitrary content', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async()=>new Response('<html>not a PDF</html>');
    await assert.rejects(replyZip(refs), /Invalid document/);
    globalThis.fetch = async()=>new Response('small', { headers: { 'content-length': String(26 * 1024 * 1024) } });
    await assert.rejects(replyZip(refs), /Download unavailable/);
    globalThis.fetch = async()=>new Response('', {status:404});
    await assert.rejects(replyZip(refs), /Download unavailable/);
  } finally { globalThis.fetch = original; }
});
