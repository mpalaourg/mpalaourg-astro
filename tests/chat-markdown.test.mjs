import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const compiled = await build({ entryPoints: ['src/lib/chat/markdown.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { chatMarkup, renderChatMarkdown, chatPlainText } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const tags = nodes => nodes.flatMap(node => typeof node === 'string' ? [] : [node.tag, ...tags(node.children)]);
const text = nodes => nodes.map(node => typeof node === 'string' ? node : text(node.children)).join('');

test('formats nested bold, italic, Unicode, escapes and inline technical terms', () => {
  const result = chatMarkup('**Δυνατό _και πλάγιο_** με `FastAPI` και \\*κυριολεκτικό\\*.');
  assert.deepEqual(tags(result), ['p', 'strong', 'em', 'code']);
  assert.equal(text(result), 'Δυνατό και πλάγιο με FastAPI και *κυριολεκτικό*.');
});
test('formats paragraphs, lists, ordered starts, nested lists, quotations and restrained headings', () => {
  const result = chatMarkup('## Workshop\n\nFirst paragraph.\n\n- **Models**\n  - Evaluation\n- Tools\n\n3. Three\n4. Four\n\n> Quoted material\n\nFinal paragraph.');
  assert.ok(tags(result).includes('h3')); assert.equal(tags(result).filter(tag => tag === 'ul').length, 2);
  assert.ok(tags(result).includes('blockquote')); assert.equal(result.find(node => node.tag === 'ol').start, 3);
});
test('HTML, links, images, entity tricks and code content cannot become active browser content', () => {
  const result = chatMarkup('<img src=x onerror=alert(1)>\n\n[click](javascript:alert%281%29) ![alt](https://evil.test/tracker) &lt;script&gt;\n\n```html\n<script>alert(1)</script>\n```');
  assert.ok(!tags(result).some(tag => ['img', 'a', 'script', 'iframe', 'style'].includes(tag)));
  assert.match(text(result), /<img src=x onerror=alert\(1\)>/);
  assert.match(text(result), /click alt <script>/);
  assert.ok(!JSON.stringify(result).includes('https://evil.test'));
  assert.deepEqual(tags(chatMarkup('[label][ref]\n\n[ref]: javascript:alert(1)')), ['p']);
});
test('partial streamed Markdown reparses into complete formatting without dropping the answer', () => {
  for (const partial of ['**', '**Work', '**Work** and _ev', '**Work** and _evaluation_']) assert.ok(text(chatMarkup(partial)).length > 0);
  assert.deepEqual(tags(chatMarkup('**Work** and _evaluation_')), ['p', 'strong', 'em']);
  assert.ok(text(chatMarkup('x'.repeat(10000))).length <= 3200);
});
test('DOM rendering uses fixed element names and text nodes, with no HTML injection sink', () => {
  class Element {
    constructor(tag, value = '') { this.tag = tag; this.value = value; this.children = []; this.attrs = {}; }
    appendChild(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { assert.ok((this.tag === 'ol' && key === 'start') || (this.tag === 'a' && ['href','data-chat-href','role','tabindex','title','rel'].includes(key))); this.attrs[key] = value; }
    set innerHTML(_) { assert.fail('Raw HTML must never be inserted'); }
  }
  const original = globalThis.document;
  globalThis.document = { createTextNode: value => new Element('#text', value), createDocumentFragment: () => new Element('#fragment'), createElement: tag => { assert.ok(['p','strong','em','code','pre','ul','ol','li','blockquote','h3','h4','hr','br','a'].includes(tag)); return new Element(tag); } };
  try {
    const target = new Element('div');
    renderChatMarkdown(target, '**Safe** <script>alert(1)</script> ![tracking](https://evil.test/pixel) [Docs](https://example.org/) [About](/about/)');
    assert.match(JSON.stringify(target), /"tag":"strong"/);
    const visible = node => node.value + node.children.map(visible).join('');
    assert.match(visible(target), /<script>alert\(1\)<\/script>/);
    assert.ok(!JSON.stringify(target).includes('https://evil.test'));
    assert.match(JSON.stringify(target), /"data-chat-href":"https:\/\/example.org\/"/);
    assert.ok(!JSON.stringify(target).includes('"href":"https://example.org/"'), 'outbound navigation must remain inert before acknowledgement');
    assert.match(JSON.stringify(target), /"href":"\/about\/"/);
  } finally { globalThis.document = original; }
});


test('plain-text copy removes formatting while preserving readable paragraphs and lists', () => {
  assert.equal(chatPlainText('## Heading\n\n**Bold** and *italic* with `FastAPI`.\n\n- **First**\n- _Second_\n\n> A quote'), 'Heading\n\nBold and italic with FastAPI.\n\n• First\n• Second\n\nA quote');
  assert.equal(chatPlainText('3. Three\n4. Four'), '3. Three\n4. Four');
  assert.equal(chatPlainText('\\*literal\\* and `**literal code**`'), '*literal* and **literal code**');
});
test('plain-text copy handles nested lists, links, and Greek while retaining destinations', () => {
  const result = chatPlainText('- **Πρώτο**\n  - _Δεύτερο_\n\n[Ετικέτα](https://example.test)');
  assert.match(result, /• Πρώτο/); assert.match(result, /  • Δεύτερο/); assert.match(result, /Ετικέτα/);
  assert.match(result,/Ετικέτα \(https:\/\/example.test\/\)/); assert.ok(!result.includes('**'));
});

test('Markdown, reference, angle and bare URLs become safe anchors outside literal code and math', () => {
  const nodes=chatMarkup('[**Project**](https://github.com/person/repo) and https://mpalaourg.dev/about/.\n\n[Paper][ref]\n\n[ref]: https://example.org/paper\n\n`https://literal.test`\n\n```\nhttps://literal.test\n```\n\n<https://example.org/angle>');
  const links=[];const walk=items=>items.forEach(n=>{if(typeof n!=='string'){if(n.tag==='a')links.push(n);walk(n.children)}});walk(nodes);
  assert.deepEqual(links.map(n=>n.href),['https://github.com/person/repo','https://mpalaourg.dev/about/','https://example.org/paper','https://example.org/angle']);
  assert.equal(links[0].children[0].tag,'strong');
  assert.equal(text(chatMarkup('See https://example.org/a_(b).')), 'See https://example.org/a_(b).');
  assert.equal(tags(chatMarkup('[https://example.org](https://example.org)')).filter(t=>t==='a').length,1);
  assert.equal(chatPlainText('Visit [Project](https://example.org).'), 'Visit Project (https://example.org/).');
  assert.equal(chatPlainText('https://example.org'), 'https://example.org');
});

test('triple and quadruple backtick fences preserve literal content and closing ticks', () => {
  const value='````text\n```python\nprint("<script>")\n```\n````';
  assert.deepEqual(tags(chatMarkup(value)),['pre','code']);
  assert.equal(text(chatMarkup(value)), '```python\nprint("<script>")\n```');
  assert.equal(chatPlainText(value), '```python\nprint("<script>")\n```');
});
test('inline and display math parse with dollar and backslash delimiters, outside code only',()=>{
  const nodes=chatMarkup('Inline $x^2$ and \\(y_i\\).\n\n$$\n\\frac{a}{b}\n$$\n\n\\[z=1\\]\n\n`$literal$`\n\n```text\n\\[not math\\]\n```');
  const mathNodes=[];const walk=nodes=>nodes.forEach(n=>{if(typeof n!=='string'){if(n.math)mathNodes.push(n.math);walk(n.children)}});walk(nodes);
  assert.deepEqual(mathNodes.map(n=>[n.value.trim(),n.display]),[['x^2',false],['y_i',false],['\\frac{a}{b}',true],['z=1',true]]);
  assert.equal(chatPlainText('**Math** $x^2$'),'Math x^2');
});
test('KaTeX disallows active links, HTML commands and unbounded macro expansion',async()=>{
  const {CHAT_MATH_OPTIONS}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
  const katex=await import('katex');
  for(const value of ['\\href{https://evil.test}{click}','\\includegraphics{https://evil.test/pixel}','\\htmlClass{evil}{x}']){
    try{const result=katex.renderToString(value,CHAT_MATH_OPTIONS);assert.ok(!/<(?:a|img|script)\b/i.test(result));}catch(error){assert.match(error.name,/ParseError/);}
  }
  assert.throws(()=>katex.renderToString('\\def\\loop{\\loop}\\loop',CHAT_MATH_OPTIONS));
  const valid=katex.renderToString('\\frac{1}{2}',CHAT_MATH_OPTIONS);assert.match(valid,/katex-mathml/);assert.match(valid,/<math/);
});

test('single-line display math works while currency remains literal',()=>{
  assert.equal(chatMarkup('$$x^2$$')[0].math.display,true);
  assert.equal(text(chatMarkup('Cost $5 and $10.')), 'Cost $5 and $10.');
  assert.ok(!tags(chatMarkup('Cost $5 and $10.')).includes('span'));
});
