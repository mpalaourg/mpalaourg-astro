import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const compiled = await build({entryPoints:['src/lib/chat/links.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {safeChatLink,externalChatDestination,bareChatLinks,chatCitationHref,officePresentationFile}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('first-party URLs stay direct and external destinations are named by their actual hostname',()=>{
  for(const href of ['/about/','#section','https://mpalaourg.dev/about/','http://mpalaourg.me/','https://www.mpalaourg.dev/','https://notes.mpalaourg.me/']) assert.equal(externalChatDestination(href),null,href);
  for(const [href,host]of [['https://github.com/me','github.com'],['https://mpalaourg.dev.evil.test/','mpalaourg.dev.evil.test'],['https://evilmpalaourg.me/','evilmpalaourg.me']]) assert.equal(externalChatDestination(href),host);
});
test('active protocols, credentials, control characters and disguised slashes never become links',()=>{
  for(const href of ['javascript:alert(1)','data:text/html,evil','file:///etc/passwd','//evil.test','https://mpalaourg.dev@evil.test/','https://evil.test/\npath','https:\\evil.test','mailto:me@example.org']) assert.equal(safeChatLink(href),null,href);
  assert.equal(safeChatLink('https://example.org/α?x=1&y=2'),'https://example.org/%CE%B1?x=1&y=2');
});
test('bare URL boundaries preserve balanced parentheses, surrounding punctuation and all prose',()=>{
  const value='See (https://example.org/a_(b)), then https://example.org/next. Done.';
  const parts=bareChatLinks(value);assert.equal(parts.map(p=>p.text).join(''),value);
  assert.deepEqual(parts.filter(p=>p.href).map(p=>p.href),['https://example.org/a_(b)','https://example.org/next']);
});

test('citation navigation opens indexed PDF pages without changing canonical source URLs',()=>{
  const source={title:'Diploma thesis (Greek) — Page 7',url:'/media/files/thesis.pdf'};
  assert.equal(chatCitationHref(source),'/media/files/thesis.pdf#page=7');
  assert.equal(source.url,'/media/files/thesis.pdf');
  assert.equal(chatCitationHref({title:'Overview',url:'/projects/site-assistant/'}),'/projects/site-assistant/');
  for(const title of ['Paper','Paper — Page 0','Paper — Page -1','Paper — Page 7<script>','Paper — Page 999999999999999999999'])
    assert.equal(chatCitationHref({title,url:'/media/files/paper.pdf'}),'/media/files/paper.pdf');
  assert.equal(chatCitationHref({title:'Slides — Slide 7',url:'/media/slides/talk.pptx'}),'/media/slides/talk.pptx');
  for(const url of ['//evil.test/file.pdf','https://evil.test/file.pdf','/file.pdf#page=7','/a/../file.pdf?url=evil'])
    assert.equal(chatCitationHref({title:'Paper — Page 7',url}),null);
});

test('allowlisted presentation citations use the public Office viewer and indexed slide',()=>{
  const source={title:'Research presentation — Slide 7',url:'/media/slides/ism2021_slides.pptx'};
  const viewer=new URL(chatCitationHref(source));
  assert.equal(viewer.origin,'https://view.officeapps.live.com');
  assert.equal(viewer.pathname,'/op/embed.aspx');
  assert.equal(viewer.searchParams.get('src'),'https://mpalaourg.dev/media/slides/ism2021_slides.pptx');
  assert.equal(viewer.searchParams.get('wdSlideIndex'),'7');
  assert.equal(externalChatDestination(viewer.href),'view.officeapps.live.com');
  assert.equal(source.url,'/media/slides/ism2021_slides.pptx');
  for(const title of ['Presentation','Presentation — Slide 0','Presentation — Slide 999999999999999999999'])
    assert.equal(new URL(chatCitationHref({...source,title})).searchParams.has('wdSlideIndex'),false);
  assert.equal(new URL(chatCitationHref({title:'Διαφάνειες — Slide 3',url:'/el/media/slides/thesis.pptx'})).searchParams.get('wdSlideIndex'),'3');
  assert.equal(chatCitationHref({title:'Unknown — Slide 7',url:'/media/slides/not-indexed.pptx'}),'/media/slides/not-indexed.pptx');
});

test('presentation download recovery accepts only known first-party files in the exact Office viewer',()=>{
  assert.equal(officePresentationFile(chatCitationHref({title:'Slides — Slide 7',url:'/media/slides/ism2021_slides.pptx'})),'/media/slides/ism2021_slides.pptx');
  for(const href of [
    'https://view.officeapps.live.com.evil.test/op/embed.aspx?src=https://mpalaourg.dev/media/slides/ism2021_slides.pptx',
    'https://view.officeapps.live.com/op/embed.aspx?src=https://evil.test/file.pptx',
    'https://view.officeapps.live.com/op/embed.aspx?src=https://mpalaourg.dev/not-indexed.pptx',
    'https://view.officeapps.live.com/op/embed.aspx?src=https://mpalaourg.dev/media/slides/ism2021_slides.pptx?evil=1',
    'https://view.officeapps.live.com/op/embed.aspx?src=x&src=y',
    '/about/',
  ]) assert.equal(officePresentationFile(href),null);
});
