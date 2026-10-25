import assert from 'node:assert/strict';
import{test}from'node:test';
import{build}from'esbuild';
import{htmlImages}from'../scripts/lib/chat-images.mjs';
const load=async path=>{const c=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(c.outputFiles[0].contents).toString('base64'))};
const{safeChatImage,imageRecords,withSourceImages}=await load('src/lib/chat/images.ts');
const{validateAnswer}=await load('src/lib/chat/policy.ts');
const{chatMarkup,chatPlainText,renderChatMarkdown}=await load('src/lib/chat/markdown.ts');
const url='/projects/from-workflows-to-agents/featured.webp';
const source={title:'Workshop',url:'/projects/from-workflows-to-agents/',body:'Published workshop overview.',images:[{url,alt:'Workshop overview'}]};
test('image URLs are canonical local static assets, never trackers or executable/API URLs',()=>{
 for(const value of [url,'https://mpalaourg.dev'+url,'http://mpalaourg.me'+url])assert.equal(safeChatImage(value),url);
 for(const value of ['https://evil.test/pixel.png','https://mpalaourg.dev.evil.test/a.jpg','https://cdn.mpalaourg.dev/a.jpg','//evil.test/a.png','data:image/svg+xml,x','blob:https://mpalaourg.dev/a','/api/chat/pixel.png','/media/a.svg?secret=x','/media/a.png#x','/media/%2e%2e/a.png','/projects/../media/a.png','https://user@mpalaourg.dev/media/a.png','/media/a.html','/media/a.png\\x'])assert.equal(safeChatImage(value),null,value);
});
test('image indexing excludes navigation, hidden, remote and dynamic widget images',()=>{
 const rows=htmlImages(`<nav><img src="/media/nav.png" alt="Nav"></nav><main><img src="${url}" alt="Workshop overview" width="800" height="450"><img src="${url}" alt="Duplicate"><div hidden><img src="/media/hidden.png" alt="Hidden"></div><div class="nasa-widget"><img src="/media/daily.png" alt="Daily"></div><img src="https://outside.test/pixel.png" alt="Remote"><img src="/media/decor.png" alt=""></main>`,safeChatImage);
 assert.deepEqual(rows,[{url,alt:'Workshop overview',width:800,height:450}]);
 assert.deepEqual(imageRecords([...rows,{url:'/api/a.png',alt:'No'}]),rows);
});
test('answers may show only images approved by their cited sources',()=>{
 const raw={allowed:true,kind:'answer',sourceIds:[1],answer:`Workshop overview.\n\n![Workshop overview](${url})`};
 assert.ok(validateAnswer(raw,[source]));assert.equal(validateAnswer(raw,[{...source,images:[]}]),null);
 for(const answer of ['![Tracking](https://outside.test/pixel.png)','![]('+url+')','![Invented](/projects/other/featured.webp)',`![A](${url}) ![B](${url}) ![C](${url})`])assert.equal(validateAnswer({...raw,answer},[source]),null);
 assert.ok(validateAnswer({...raw,answer:`![Workshop][picture]\n\n[picture]: ${url}`},[source]));
 assert.equal(validateAnswer({...raw,answer:'<img src="'+url+'">'},[source]),null);
});
test('rendered images remain inert content, respect the image cap and copy as alt plus URL',()=>{
 const markup=chatMarkup(`![Workshop](${url})`);assert.equal(markup[0].children[0].tag,'img');
 assert.equal(chatPlainText(`![Workshop](${url})`),`Workshop (${url})`);
 const many=chatMarkup(`![A](${url}) ![B](${url}) ![C](${url})`);assert.equal(many[0].children.filter(c=>typeof c!=='string'&&c.tag==='img').length,2);
 assert.equal(chatMarkup('![Remote](https://outside.test/pixel.png)')[0].children[0],'Remote');
 class E{
  constructor(tag,value=''){this.tag=tag;this.value=value;this.attrs={};this.children=[];this.classList={add:()=>{}}}
  setAttribute(k,v){this.attrs[k]=v}appendChild(c){this.children.push(c)}replaceChildren(...c){this.children=c}addEventListener(k,fn){this[k]=fn}remove(){this.removed=true}
  set innerHTML(_){assert.fail('Images must never use raw HTML')}
 }
 const native=globalThis.document;globalThis.document={createTextNode:t=>new E('#text',t),createDocumentFragment:()=>new E('#fragment'),createElement:t=>new E(t)};
 try{
  const root=new E('div');renderChatMarkdown(root,`![Workshop](${url})`);
  const frame=root.children[0].children[0].children[0],image=frame.children[0];
  assert.equal(frame.attrs.href,url);assert.equal(frame.attrs.target,'_blank');assert.equal(image.attrs.alt,'Workshop');assert.equal(image.attrs.loading,'lazy');assert.equal(image.attrs.referrerpolicy,'no-referrer');
  image.error();assert.equal(image.removed,true);assert.ok(frame.children[1]);
 }finally{globalThis.document=native}
});
test('only reviewed D1 image evidence enriches sources; unavailable tables keep answers working',async()=>{
 const DB={prepare(query){assert.match(query,/WHERE source_url IN \(\?\)/);return{bind(value){assert.equal(value,source.url);return this},async all(){return{results:[{source_url:source.url,images:JSON.stringify(source.images)}]}}}}};
 const rows=await withSourceImages(DB,[{...source,images:undefined}]);assert.deepEqual(rows[0].images,source.images);
 assert.deepEqual(await withSourceImages({prepare(){throw new Error('not migrated')}},[source]),[source]);
});
