import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const compiled = await build({ entryPoints: ['src/lib/chat/sources.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { sourceMatches, mentionAt, isIndexedSource } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
test('@ recognizes queries at the caret and leaves email addresses alone', () => {
  assert.deepEqual(mentionAt('Question @workshop', 18), { start: 9, end: 18, query: 'workshop' });
  assert.deepEqual(mentionAt('@', 1), { start: 0, end: 1, query: '' });
  assert.equal(mentionAt('me@example.com', 14), null);
  assert.equal(mentionAt('@workshop\nquestion', 18), null);
});
test('picker caps all results at five and matches Greek without accents', () => {
  const pages = Array.from({ length: 12 }, (_, i) => ({ title: `Formula article ${i}`, url: `/formula/article-${i}/` }));
  const files = ['/media/files/resume_en.pdf', '/el/media/files/resume_gr.pdf', '/media/files/ism2021_preprint.pdf', '/media/files/ism2022_preprint.pdf', '/media/files/icmr2022_preprint.pdf', '/media/slides/from_workflows_to_agents_workshop.pptx'].map(url => ({ title: 'Document — Page 1', url }));
  const result = sourceMatches([...pages, ...files], '', 'en');
  assert.equal(result.length, 5);
  assert.ok(result.some(s => s.kind === 'page'));
  assert.ok(result.some(s => s.kind === 'file'));
  assert.equal(sourceMatches(pages, 'formula', 'en').length, 5);
  assert.equal(sourceMatches([...pages, ...files], 'workshop', 'en')[0].url, '/media/slides/from_workflows_to_agents_workshop.pptx');
  assert.equal(sourceMatches([{ title: 'Οδηγοί και αγώνες', url: '/el/formula/racecraft/' }], 'οδηγοι', 'el').length, 1);
  assert.equal(sourceMatches([{ title: 'About', url: '/about/' }, { title: 'Σχετικά', url: '/el/about/' }], '', 'el')[0].url, '/el/about/');
  for (const url of ['/api/chat/', '//evil.test', '/media/files/private.pdf', '/media/files/from_workflows_to_agents_workshop.zip', '/formula/../../.env']) assert.equal(isIndexedSource(url), false);
});

test('query matching prioritizes titles and filenames while retaining ranked content-only matches', () => {
  const rows = [
    { title: 'About', url: '/about/', contentMatch: true },
    { title: 'Formula overview', url: '/formula/' },
    { title: 'Race strategy', url: '/formula/racecraft/' },
    { title: 'Publications', url: '/publications/' },
  ];
  assert.deepEqual(sourceMatches(rows, 'formula', 'en').map(s => s.url), ['/formula/', '/formula/racecraft/', '/about/']);
  assert.equal(sourceMatches([{title:'Paper',url:'/media/files/ism2021_preprint.pdf'}], 'ism2021', 'en')[0].url, '/media/files/ism2021_preprint.pdf');
  assert.deepEqual(sourceMatches(rows, 'unmatched', 'en').map(s=>s.url), ['/about/']); // only the database-marked content hit qualifies
  assert.deepEqual(sourceMatches(rows.filter(r=>!r.contentMatch), 'unmatched', 'en'), []);
});

test('assistant article is found by filtering the capped picker in both languages',()=>{
  const rows=[{title:'Home',url:'/'},{title:'About',url:'/about/'},{title:'Projects',url:'/projects/'},{title:'Publications',url:'/publications/'},{title:'Formula',url:'/formula/'},
    {title:'The AI assistant behind this site',url:'/projects/site-assistant/'},
    {title:'Ο AI βοηθός πίσω από αυτό το site',url:'/el/projects/site-assistant/'}];
  assert.equal(sourceMatches(rows,'','en').length,5);
  assert.equal(sourceMatches(rows,'','el').length,5);
  assert.equal(sourceMatches(rows,'assistant','en')[0].url,'/projects/site-assistant/');
  assert.equal(sourceMatches(rows,'βοηθος','el')[0].url,'/el/projects/site-assistant/');
});
