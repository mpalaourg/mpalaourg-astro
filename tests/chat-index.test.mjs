import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import katex from 'katex';
import documents from '../src/lib/chat/documents.json' with { type: 'json' };
import { allowedPage, htmlPage, presentationSections, documentSections, cleanDocumentText, chunkSection, verifiedPdfSections, pdfReviewSha256, tableEvidence } from '../scripts/lib/chat-index.mjs';

test('editorial index includes nested Formula pages while excluding chat, APIs and code', () => {
  for (const locale of ['', 'el/']) {
    for (const page of ['index.html', 'formula/index.html', 'formula/racecraft/index.html', 'formula/2025-season/index.html', 'formula/champions/drivers/1950/index.html', 'formula/champions/constructors/2020/index.html']) assert.ok(allowedPage.test(locale + page));
  }
  for (const path of ['chat/index.html', 'api/chat/index.html', 'src/index.html', 'media/slides/index.html']) assert.ok(!allowedPage.test(path));
  assert.deepEqual(htmlPage('<title>Racecraft</title><main>Tyre strategy <script>private()</script><nav>Menu</nav><p hidden>Hidden</p><span aria-hidden="true">Decoration</span><p>Undercut</p></main>'), { title: 'Racecraft', body: 'Tyre strategy Undercut' });
  assert.match(htmlPage('<title>Project</title><main><a href="https://github.com/person/repo">Repository</a></main>').body,/Repository \(https:\/\/github.com\/person\/repo\)/);
});

test('document allowlist covers every public PDF/PPTX and never admits ZIPs or source files', async () => {
  const actual = [];
  for (const dir of ['media/files', 'media/slides', 'el/media/files', 'el/media/slides']) {
    for (const file of await readdir(`public/${dir}`)) if (/\.(pdf|pptx)$/i.test(file)) actual.push(`/${dir}/${file}`);
  }
  assert.deepEqual(documents.map(d => d.url).sort(), actual.sort());
  assert.ok(documents.every(d => /^\/(?:el\/)?media\/(?:files|slides)\/[a-z0-9_-]+\.(?:pdf|pptx)$/.test(d.url)));
  for (const source of documents.filter(d => d.url.endsWith('.pdf'))) {
    assert.ok((await documentSections(`public${source.url}`)).length, source.url);
  }
});

test('presentations follow manifest order, decode text, and exclude notes and embedded files', () => {
  const slide = body => `<p:sld><p:cSld><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:cSld></p:sld>`;
  const bytes = zipSync(Object.fromEntries(Object.entries({
    'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide2.xml"/></Relationships>',
    'ppt/slides/slide1.xml': slide('First file'),
    'ppt/slides/slide2.xml': slide('Workflows &amp; Agents'),
    'ppt/notesSlides/notesSlide2.xml': slide('DO NOT INDEX NOTES'),
    'ppt/embeddings/script.py': 'DO NOT INDEX CODE',
  }).map(([path, body]) => [path, strToU8(body)])));
  assert.deepEqual(presentationSections(bytes), [{ label: 'Slide 1', body: 'Workflows & Agents' }, { label: 'Slide 2', body: 'First file' }]);
});

test('CV and workshop files yield substantive page/slide text', async () => {
  for (const path of ['public/media/files/resume_en.pdf', 'public/el/media/files/resume_gr.pdf', 'public/media/slides/from_workflows_to_agents_workshop.pptx']) {
    const sections = await documentSections(path);
    const body = sections.map(s => s.body).join(' ');
    assert.ok(body.length > 1000, path);
    assert.match(body, /Kaizen|Workflows/i);
    if (path.endsWith('.pptx')) assert.match(body, /deterministic|evaluation|structured/i);
  }
});

test('all three research PDFs contain methods and evaluation, including the ICMR paper', async () => {
  for(const name of ['ism2021','icmr2022','ism2022']) {
    const sections=await documentSections(`public/media/files/${name}_preprint.pdf`);
    const body=sections.map(s=>s.body).join('\n');
    assert.ok(sections.length>=5);assert.ok(body.length>20000);
    assert.match(body,/SumMe/);assert.match(body,/TVSum/);
    if(name==='icmr2022'){
      assert.match(body,/CA-SUM/);assert.match(body,/uniqueness/);assert.match(body,/diversity/);
      assert.match(body,/\$\$[^]*?\\frac/,'detected equations should retain LaTeX');
      assert.match(body,/\|\s*60\s*\|\s*51\.1\s*\|\s*61\.4\s*\|/,'table labels and values should stay associated');
    }
    if(name==='ism2022'){
      assert.equal((body.match(/^Table I;/gm)||[]).length,96,'all 480 cells must retain their hierarchy');
      assert.match(body,/Overall \(average\); TVSum; One-by-One; RC[^\n]*IA=0\.303; NA=0\.301; GA=-0\.102; GoA=-0\.179; NGA=-0\.091/);
      assert.doesNotMatch(body,/could not be aligned reliably/);
    }
  }
});


test('PDF line wraps join split words while technical compounds and complete chunk words survive', () => {
  assert.equal(cleanDocumentText('super-\nvised self-\nattention diversi-\nty state-\nof-the-art'), 'supervised self-attention diversity state-of-the-art');
  const words=Array.from({length:600},(_,i)=>`technicalword${i}`);const chunks=chunkSection('Paper','/media/files/ism2021_preprint.pdf',words.join(' '));
  assert.ok(chunks.every(c=>c.body.length<=1800));
  const extracted=new Set(chunks.flatMap(c=>c.body.split(/\s+/)));for(const word of words)assert.ok(extracted.has(word));
});

test('preprocessed PDF text must match its source hash and preserve every page', () => {
  const bytes = new TextEncoder().encode('public PDF fixture');
  const artifact = { schema: 1, reviewPolicy: 2, reviewSha256: pdfReviewSha256, extractor: 'docling', url: '/media/files/paper.pdf', sourceSha256: createHash('sha256').update(bytes).digest('hex'), pageCount: 2, sections: [{ label: 'Page 1', body: 'Abstract' }, { label: 'Page 2', body: 'Method $x^2$' }] };
  assert.deepEqual(verifiedPdfSections(artifact, bytes, 'public/media/files/paper.pdf'), artifact.sections);
  assert.throws(() => verifiedPdfSections(artifact, new Uint8Array([1]), 'public/media/files/paper.pdf'), /Stale/);
  assert.throws(() => verifiedPdfSections(artifact, bytes, 'public/media/files/other.pdf'), /invalid/);
  assert.throws(() => verifiedPdfSections({ ...artifact, reviewSha256: 'outdated' }, bytes, 'public/media/files/paper.pdf'), /Stale/);
  assert.throws(() => verifiedPdfSections({ ...artifact, sections: artifact.sections.slice(0, 1) }, bytes, 'public/media/files/paper.pdf'), /Incomplete/);
  assert.throws(() => verifiedPdfSections({ ...artifact, sections: [artifact.sections[1], artifact.sections[0]] }, bytes, 'public/media/files/paper.pdf'), /Incomplete/);
  const blank = { ...artifact, sections: [artifact.sections[0], { label: 'Page 2', body: '' }] };
  assert.throws(() => verifiedPdfSections(blank, bytes, 'public/media/files/paper.pdf'), /Incomplete/);
  assert.deepEqual(verifiedPdfSections({ ...blank, blankPages: [2] }, bytes, 'public/media/files/paper.pdf'), [artifact.sections[0]]);
});

test('reviewed numerical evidence preserves model rows, exponents, grids and equations', async () => {
  const thesis = await documentSections('public/el/media/files/thesis.pdf');
  const page = n => thesis.find(s => s.label === `Page ${n}`).body;
  assert.match(page(58), /\| linear \| 0\.046 \| 0\.060 \| - \|/);
  assert.match(page(58), /\| lasso \| 0\.046 \| 0\.058 \| alpha = 0\.001 \|/);
  assert.match(page(58), /\| xgboost \| 0\.027 \| 0\.040 \| n_estimators = 1000, learning rate = 0\.03/);
  assert.match(page(81), /\| model_0 \| 0\.018 \| 0\.031 \|/);
  assert.match(page(61), /n_estimators = \[400, 500, \.\.\., 1400, 1500\]/);
  assert.match(page(23), /\| S2 \| 2 \| 0\.5454 \| 0 \| 0\.4545 \|/);
  const jpeg = await documentSections('public/el/media/files/jpeg.pdf');
  assert.match(jpeg.find(s => s.label === 'Page 25').body, /5\.633097 ∗ 10\^6/);
  for (const entry of documents.filter(d => d.url.endsWith('.pdf'))) {
    const artifact = JSON.parse(await readFile(`scripts/data/chat-pdf/${entry.url.split('/').pop().replace('.pdf', '.json')}`, 'utf8'));
    assert.equal(artifact.reviewSha256, pdfReviewSha256);
    assert.deepEqual(artifact.warnings, []);
    for (const section of await documentSections('public' + entry.url)) {
      assert.doesNotMatch(section.body, /�|&amp;|Ð/);
      for (const formula of section.body.matchAll(/\$\$([\s\S]*?)\$\$/g)) {
        assert.doesNotThrow(() => katex.renderToString(formula[1], { throwOnError: true, strict: false }), `${entry.url} ${section.label}`);
      }
      tableEvidence(section.body); // Reject inconsistent row widths before import.
    }
  }
});

test('indexed table records retain their column labels, including after chunking', () => {
  const body = '| Model | MAE | RMSE |\n| --- | --- | --- |\n| model_0 | 0.018 | 0.031 |\n| model_1 | 0.022 | 0.034 |\n';
  assert.match(tableEvidence(body), /Model = model_0; MAE = 0\.018; RMSE = 0\.031/);
  assert.match(chunkSection('Test set', '/el/media/files/thesis.pdf', body)[0].body, /Model = model_1; MAE = 0\.022; RMSE = 0\.034/);
  const manyRows = '| Model | MAE | RMSE |\n| --- | --- | --- |\n' + Array.from({ length: 100 }, (_, i) => `| model_${i} | 0.018 | 0.031 |`).join('\n');
  for (const chunk of chunkSection('Test set', '/el/media/files/thesis.pdf', manyRows)) {
    assert.ok(chunk.body.length <= 1800);
    for (const row of chunk.body.split('\n\n')) assert.match(row, /^Table row: Model = model_\d+; MAE = 0\.018; RMSE = 0\.031\.$/);
  }
  assert.throws(() => tableEvidence(body.replace('model_1 | 0.022 | 0.034', 'model_1 | 0.022')), /Misaligned/);
});

test('pending editorial pages remain outside retrieval until explicitly approved', () => {
  const page = status => `<html><head><title>Chatbot project</title><meta name="chat-index" content="${status}"></head><body><main>Pending implementation walkthrough.</main></body></html>`;
  for (const status of ['pending', '', 'unrecognized']) assert.equal(htmlPage(page(status)), null);
  assert.deepEqual(htmlPage(page('approved')), {title:'Chatbot project',body:'Pending implementation walkthrough.'});
  assert.ok(htmlPage('<title>Existing page</title><main>Existing indexed content</main>'));
});
