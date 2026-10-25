import {withEvidencePlan} from './helpers/chat-model.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const compiled = await build({ entryPoints: ['src/lib/chat/server.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { answerQuestion, DEFAULT_CHAT_MODEL, DEFAULT_CHAT_SECONDARY_MODEL, DEFAULT_CHAT_TERTIARY_MODEL, DEFAULT_CHAT_FALLBACK_MODEL } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const DB = { prepare() { return { bind() { return this; }, async all() { return { results: [{ title: 'About', url: '/about/', body: 'Georgios is a machine learning engineer.' }] }; } }; } };
const success = () => Response.json({ choices: [{ message: { content: JSON.stringify({ allowed: true, answer: 'The site describes Georgios as a machine learning engineer.', sourceIds: [1] }) } }] });

test('retrieval accepts reviewed CV and slides but excludes archives, source files and unlisted downloads', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = withEvidencePlan(async (_url,init) => { calls++; const context=JSON.parse(JSON.parse(init.body).messages[1].content); assert.ok(context.catalog.every(s=>!s.url.includes('private')&&!s.url.includes('.zip')&&!s.url.startsWith('/src/'))); return (!context.sources.length||context.sources[0]?.kind==='owner-background')?Response.json({choices:[{message:{content:JSON.stringify({allowed:false,kind:'refusal',sourceIds:[],answer:'No supported evidence is available.'})}}]}):success(); });
  try {
    for (const url of ['/media/files/resume_en.pdf', '/el/media/files/resume_gr.pdf', '/media/slides/from_workflows_to_agents_workshop.pptx', '/media/files/private.pdf', '/media/files/from_workflows_to_agents_workshop.zip', '/src/server.ts']) {
      const database = { prepare() { return { bind() { return this; }, async all() { return { results: [{ title: 'Public document', url, body: 'Site evidence.' }] }; } }; } };
      const before = calls;
      const result = await answerQuestion({ DB: database }, 'His work?', [], 'en');
      const approved = /resume_(?:en|gr)\.pdf$|workshop\.pptx$/.test(url);
      assert.equal(calls - before, 1);
      assert.equal(result.sources.length, approved ? 1 : 0);
      if (approved) assert.equal(result.sources[0].url, url);
    }
  } finally { globalThis.fetch = original; }
});
for (const [label, first] of [
  ['HTTP error', () => new Response('', { status: 429 })],
  ['timeout', () => { throw new DOMException('Timed out', 'TimeoutError'); }],
  ['malformed JSON', () => Response.json({ choices: [{ message: { content: 'not-json' } }] })],
  ['invalid citation', () => Response.json({ choices: [{ message: { content: JSON.stringify({ allowed: true, answer: 'Unverified', sourceIds: [99] }) } }] })],
  ['truncated output', () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] })],
]) test(`free model falls back once on ${label}`, async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = withEvidencePlan(async (url, init) => { new Request(url, init); const body = JSON.parse(init.body); calls.push(body); return calls.length === 1 ? first() : success(); });
  try {
    const result = await answerQuestion({ DB, OPENROUTER_API_KEY: 'test' }, 'What does Georgios work on?', [], 'en');
    assert.equal(result.sources.length, 1);
    assert.equal(result.model, DEFAULT_CHAT_SECONDARY_MODEL);
    assert.deepEqual(calls.map(c => c.model), [DEFAULT_CHAT_MODEL, DEFAULT_CHAT_SECONDARY_MODEL]);
    assert.equal(calls[0].response_format, undefined);
    assert.deepEqual(calls[1].response_format, { type: 'json_object' });
    assert.deepEqual(calls[0].provider, calls[1].provider); assert.deepEqual(calls[0].messages, calls[1].messages);
    assert.ok(calls.every(c => c.max_tokens === 4096 && c.provider.zdr === undefined && c.provider.data_collection === undefined));
  } finally { globalThis.fetch = original; }
});
test('a valid refusal never triggers the paid fallback', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = withEvidencePlan(async () => { calls++; return Response.json({ choices: [{ message: { content: JSON.stringify({ allowed: false, kind: 'refusal', answer: 'I can help with Georgios and this site.', sourceIds: [] }) } }] }); });
  try { const result = await answerQuestion({ DB }, 'What does Georgios work on?', [], 'en'); assert.equal(calls, 1); assert.equal(result.sources.length, 0); }
  finally { globalThis.fetch = original; }
});
test('all model failures stop after four attempts', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = withEvidencePlan(async () => { calls++; return new Response('', { status: 503 }); });
  try { await assert.rejects(answerQuestion({ DB }, 'What does Georgios work on?', [], 'en'), /chat_models_unavailable/); assert.equal(calls, 4); }
  finally { globalThis.fetch = original; }
});
test('LangSmith retains timeout and HTTP failure exceptions when a later model succeeds',async()=>{
 const bundled=await build({entryPoints:['src/lib/chat/tracing.ts'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});
 const {createChatTrace}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
 const question='What does Georgios work on?',tracing={LANGSMITH_TRACING:'true',LANGSMITH_API_KEY:'fixture-tracing-key',LANGSMITH_CAPTURE_CONTENT:'false'};
 const trace=createChatTrace(tracing,{threadId:crypto.randomUUID(),requestId:crypto.randomUUID(),question,language:'en',persona:'baseline',hostname:'localhost'});
 const native=globalThis.fetch;let attempts=0,runs;
 globalThis.fetch=withEvidencePlan(async()=>{attempts++;if(attempts===1)return new Response('',{status:429});if(attempts===2)throw new DOMException('private provider details','TimeoutError');return success()});
 try{
  const result=await answerQuestion({DB,...tracing,CHAT_TRACE:trace},question,[],'en');
  trace.result(result);await trace.flush({async batchIngestRuns(data){runs=data.runCreates}});
  const failures=runs.filter(run=>run.run_type==='llm'&&run.error);
  assert.equal(failures.length,2);
  assert.match(failures[0].error,/Error: http_error/);assert.equal(failures[0].extra.metadata.http_status,429);
  assert.match(failures[1].error,/TimeoutError: timeout/);assert.match(failures[1].error,/\n    at /);
  assert.ok(!JSON.stringify(runs).includes('private provider details'));
  assert.equal(runs[0].error,undefined);assert.equal(result.model,DEFAULT_CHAT_TERTIARY_MODEL);
 }finally{globalThis.fetch=native}
});

test('paid fallback is used only after all three free routes fail', async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = withEvidencePlan(async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return calls.length < 4 ? new Response('', { status: 404 }) : success();
  });
  try {
    const result = await answerQuestion({ DB, OPENROUTER_API_KEY: 'test' }, 'His work?', [], 'en');
    assert.equal(result.sources.length, 1);
    assert.equal(result.model, DEFAULT_CHAT_FALLBACK_MODEL);
    assert.deepEqual(calls.map(c => c.model), [DEFAULT_CHAT_MODEL, DEFAULT_CHAT_SECONDARY_MODEL, DEFAULT_CHAT_TERTIARY_MODEL, DEFAULT_CHAT_FALLBACK_MODEL]);
    assert.ok(calls.every(c => JSON.stringify(c.messages) === JSON.stringify(calls[0].messages)));
    assert.ok(calls.every(c => c.provider.zdr === undefined && c.provider.data_collection === undefined));
  } finally { globalThis.fetch = original; }
});

test('a valid refusal from the second free model never reaches the paid model', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = withEvidencePlan(async () => ++calls === 1 ? new Response('', { status: 404 }) : Response.json({ choices: [{ message: { content: JSON.stringify({ allowed: false, kind: 'refusal', sourceIds: [], answer: 'I can help with Georgios and this site.' }) } }] }));
  try {
    const result = await answerQuestion({ DB }, 'His work?', [], 'en');
    assert.equal(calls, 2); assert.equal(result.sources.length, 0);
  } finally { globalThis.fetch = original; }
});

test('third free route succeeds without calling paid fallback and reports the selected model', async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = withEvidencePlan(async (_url, init) => {
    calls.push(JSON.parse(init.body).model);
    if (calls.length < 3) return new Response('', { status: 429 });
    return Response.json({ model: 'example/selected-model:free', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ allowed: true, sourceIds: [1], answer: 'Georgios is an engineer.' }) } }] });
  });
  try {
    const result = await answerQuestion({ DB }, 'His work?', [], 'en');
    assert.deepEqual(calls, [DEFAULT_CHAT_MODEL, DEFAULT_CHAT_SECONDARY_MODEL, DEFAULT_CHAT_TERTIARY_MODEL]);
    assert.equal(result.model, 'example/selected-model:free');
  } finally { globalThis.fetch = original; }
});

test('timeout while reading an HTTP 200 response is logged as timeout, then falls back', async () => {
  const originalFetch = globalThis.fetch, originalWarn = console.warn, warnings = [];
  let calls = 0;
  console.warn = (_label, details) => warnings.push(details);
  globalThis.fetch = withEvidencePlan(async () => {
    if (++calls > 1) return success();
    const response = new Response('{}', { status: 200 });
    response.json = async () => { throw new DOMException('Timed out', 'TimeoutError'); };
    return response;
  });
  try {
    await answerQuestion({ DB }, 'His work?', [], 'en');
    assert.equal(warnings[0].kind, 'timeout');
    assert.equal(warnings[0].status, 200);
    assert.equal(warnings[0].timeoutMs, 30000);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
});

test('a short attached deck includes its agenda instead of only the shortest matching slides', async () => {
  const original = globalThis.fetch;
  const url = '/media/slides/from_workflows_to_agents_workshop.pptx';
  const slides = ['Workshop introduction', 'Agenda: workflows, structured outputs, evaluation', 'Demo', 'Questions?'].map((body, index) => ({ title: `Workshop — Slide ${index + 1}`, url, body }));
  const database = { prepare(query) { return { bind() { return this; }, async all() { return { results: query.includes('MATCH') ? slides.slice(2) : slides }; } }; } };
  globalThis.fetch = withEvidencePlan(async (_url, init) => {
    const context = JSON.parse(JSON.parse(init.body).messages[1].content);
    assert.deepEqual(context.selectedSourceUrls, [url]);
    assert.equal(context.sources.length, 4);
    assert.ok(context.sources.some(source => source.body.includes('Agenda:')));
    return success();
  });
  try {
    const result = await answerQuestion({ DB: database }, 'What is covered in this workshop?', [], 'en', undefined, 'baseline', [url]);
    assert.equal(result.sources[0].url, url);
  } finally { globalThis.fetch = original; }
});
