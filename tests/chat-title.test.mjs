import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const compiled = await build({ entryPoints: ['src/lib/chat/title.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { generateChatTitle } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('dedicated title model generates a short Greek title without answering the question', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'custom/title-model'); assert.equal(body.max_tokens, 512);
    assert.match(body.messages[0].content, /natural contemporary Greek/);
    assert.deepEqual(JSON.parse(body.messages[1].content), { message: 'Με τι ασχολείται ο Γιώργος;', pages: [] });
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '«Η δουλειά του Γιώργου»' } }] });
  };
  try { assert.equal(await generateChatTitle({ CHAT_TITLE_MODEL: 'custom/title-model' }, 'Με τι ασχολείται ο Γιώργος;', 'el'), 'Η δουλειά του Γιώργου'); }
  finally { globalThis.fetch = original; }
});

test('invalid, copied, truncated, or unavailable title output returns no generated title without retrying', async () => {
  const original = globalThis.fetch;
  for (const output of ['', '<script>bad</script>', 'First line\nSecond line', 'x'.repeat(65), 'One two three four five six seven eight nine']) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ choices: [{ message: { content: output } }] }); };
    try { assert.equal(await generateChatTitle({}, 'His work?', 'en'), null); assert.equal(calls, 1); }
    finally { globalThis.fetch = original; }
  }
  globalThis.fetch = async () => new Response('', { status: 429 });
  try { assert.equal(await generateChatTitle({}, 'His work?', 'en'), null); }
  finally { globalThis.fetch = original; }
});

test('workshop title uses the specific project context rather than a generic site label', async () => {
  const original = globalThis.fetch;
  const question = 'Tell me about the workflows to agents workshop';
  const pages = [{ title: 'From Workflows to Agents: Building LLM Systems in Practice', body: 'A hands-on workshop at TechSaloniki X.' }];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body), context = JSON.parse(body.messages[1].content);
    assert.equal(context.message, question);
    assert.equal(context.pages[0].title, pages[0].title);
    assert.equal(context.pages[0].excerpt, pages[0].body);
    assert.match(body.messages[0].content, /Workflows to Agents Workshop/);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Workflows to Agents Workshop' } }] });
  };
  try { assert.equal(await generateChatTitle({}, question, 'en', pages), 'Workflows to Agents Workshop'); }
  finally { globalThis.fetch = original; }
});
