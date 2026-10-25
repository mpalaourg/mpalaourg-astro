import {withEvidencePlan} from './helpers/chat-model.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
async function module(path) {
  const result = await build({ entryPoints: [path], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}
const { eventData } = await module('src/lib/chat/stream.ts');
const { previewAnswer } = await module('src/lib/chat/policy.ts');
const { answerQuestion } = await module('src/lib/chat/server.ts');
const sources = [{ title: 'About', url: '/about/', body: 'Georgios is an engineer.' }];

test('SSE handles byte boundaries, Greek text, comments, multiline data and CRLF', async () => {
  const bytes = new TextEncoder().encode(': keepalive\r\ndata: Γιώργος\r\ndata: engineer\r\n\r\ndata: [DONE]\n\n');
  const stream = new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } });
  const events = []; for await (const event of eventData(stream)) events.push(event);
  assert.deepEqual(events, ['Γιώργος\nengineer', '[DONE]']);
});
test('partial answers require an allowed envelope and valid citations, and decode complete escapes', () => {
  const prefix = '{"allowed":true,"sourceIds":[1],"answer":"';
  assert.equal(previewAnswer(prefix + 'Line\\nGreek \\u0393\\u03', sources, 'en').answer, 'Line\nGreek Γ');
  for (const text of ['{"allowed":false,"sourceIds":[1],"answer":"No', '{"allowed":true,"sourceIds":[9],"answer":"No', '{"answer":"No', prefix + '<script>bad']) assert.equal(previewAnswer(text, sources, 'en'), null);
});
test('interrupted upstream stream clears previews and falls back without persisting invalid output', async () => {
  const original = globalThis.fetch, events = []; let calls = 0;
  const DB = { prepare() { return { bind() { return this; }, async all() { return { results: sources }; } }; } };
  globalThis.fetch = withEvidencePlan(async () => {
    calls++;
    if (calls === 1) return new Response('data: {"choices":[{"delta":{"content":"{\\"allowed\\":true,\\"sourceIds\\":[1],\\"answer\\":\\"Partial"}}]}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ allowed: true, sourceIds: [1], answer: 'Georgios is an engineer.' }) } }] });
  });
  try {
    const result = await answerQuestion({ DB }, 'His work?', [], 'en', event => events.push(event));
    assert.equal(calls, 2); assert.equal(result.answer, 'Georgios is an engineer.');
    assert.ok(events.some(e => e.type === 'answer' && e.answer === 'Partial'));
    assert.ok(events.some(e => e.type === 'answer' && e.answer === ''));
  } finally { globalThis.fetch = original; }
});

test('router streaming reports the actual selected model rather than the router alias', async () => {
  const original = globalThis.fetch;
  const DB = { prepare() { return { bind() { return this; }, async all() { return { results: sources }; } }; } };
  globalThis.fetch = withEvidencePlan(async () => {
    const content = JSON.stringify({ allowed: true, sourceIds: [1], answer: 'Georgios is an engineer.' });
    return new Response(`data: ${JSON.stringify({ model: 'example/selected-model:free', choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  });
  try {
    const result = await answerQuestion({ DB, CHAT_MODEL: 'openrouter/free' }, 'His work?', [], 'en', () => {});
    assert.equal(result.model, 'example/selected-model:free');
  } finally { globalThis.fetch = original; }
});
