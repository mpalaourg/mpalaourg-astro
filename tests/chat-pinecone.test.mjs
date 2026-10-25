import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {embeddingPassages,pineconeCorpus,pineconeSchema} from '../scripts/lib/pinecone-corpus.mjs';
const load=async file=>{const code=await build({entryPoints:[file],bundle:true,platform:'node',format:'esm',write:false});return import(`data:text/javascript;base64,${Buffer.from(code.outputFiles[0].contents).toString('base64')}`)};
const {reciprocalRankFusion,reserveRerank,pineconeOrigin,pineconeQuery,retrievalSettings}=await load('src/lib/chat/pinecone.ts');
const {retrieveChatSources}=await load('src/lib/chat/retrieval.ts');
const nativeFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=nativeFetch});
const env={PINECONE_API_KEY:'fixture-key-never-log',PINECONE_INDEX_HOST:'site-example.svc.us-east-1.pinecone.io',PINECONE_ENABLED:'true',PINECONE_RERANK_ENABLED:'true'};
const reviewed=[{title:'About',url:'/about/',body:'Reviewed machine learning biography.'},{title:'Publications',url:'/publications/',body:'Reviewed research publications.'}];
const parents=reviewed.map(row=>createHash('sha256').update(JSON.stringify(row)).digest('hex'));
const hit=(i,part=0,score=1)=>({_id:`${parents[i]}-${String(part).padStart(4,'0')}`,_score:score});
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('migrations/0004_chat.sql','utf8'));sql.exec(readFileSync('migrations/0005_chat_pinecone.sql','utf8'));
 sql.prepare('INSERT INTO chat_index_meta VALUES(1,?,?)').run('c'.repeat(64),'2026-10-23');
 for(const [i,row]of reviewed.entries()){
  sql.prepare('INSERT INTO chat_knowledge VALUES(?,?,?)').run(row.title,row.url,row.body);
  sql.prepare('INSERT INTO chat_pinecone_chunks VALUES(?,?)').run(parents[i],i+1);
 }
 const queries=[];
 const DB={prepare(query){queries.push(query);let args=[];return{bind(...values){args=values;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return{results:sql.prepare(query).all(...args)}},async run(){return{meta:{changes:sql.prepare(query).run(...args).changes}}}}}};
 return {sql,DB,queries};
}
test('RRF counts each parent once per branch and query bounds preserve Greek Unicode',()=>{
 assert.deepEqual(reciprocalRankFusion([[hit(0),hit(1),hit(0,1)],[hit(1),hit(0)]]),[parents[0],parents[1]].sort());
 const query=pineconeQuery('Ποιες είναι οι δημοσιεύσεις του Γιώργου;',['Περισσότερες πληροφορίες '.repeat(50)]);
 assert.ok(Buffer.byteLength(query)<=440);assert.doesNotMatch(query,/�/);assert.match(query,/Ποιες/);
 assert.equal(pineconeOrigin('https://site-example.svc.us-east-1.pinecone.io'),`https://${env.PINECONE_INDEX_HOST}`);
 for(const host of ['evil.test','site.svc.region.pinecone.io.evil.test','https://user:secret@site.svc.region.pinecone.io','https://site.svc.region.pinecone.io/a'])assert.throws(()=>pineconeOrigin(host));
});
test('embedding passages cover all content without clipping multilingual words, formulas or Unicode',()=>{
 const text='Αυτό είναι ένα ελληνικό κείμενο με $x^2$ και τεχνικούς όρους. '.repeat(120)+'🏎️';
 const passages=embeddingPassages(text);
 assert.ok(passages.length>1);assert.ok(passages.every(p=>Buffer.byteLength(p)<=440&&!p.includes('�')));
 for(const word of text.trim().split(/\s+/))assert.ok(passages.some(p=>p.includes(word)),word);
 const corpus=pineconeCorpus(reviewed,'c'.repeat(64));assert.equal(corpus.namespace,'site-'+ 'c'.repeat(24));
 assert.deepEqual(corpus.indexSchema,pineconeSchema);assert.ok(corpus.records.every(row=>row.source_url.startsWith('/')));
 assert.deepEqual(corpus.parents.map(row=>row.id),parents);
});
test('500 rerank reservations cannot overrun the free budget and do not reset when history is deleted',async()=>{
 const {sql,DB}=setup();try{
  const now=new Date('2026-10-31T23:59:59Z');
  const outcomes=await Promise.all(Array.from({length:540},()=>reserveRerank(DB,now)));
  assert.equal(outcomes.filter(Boolean).length,500);
  sql.exec('DELETE FROM chat_threads; DELETE FROM chat_usage; DELETE FROM chat_pinecone_chunks;');
  assert.equal(await reserveRerank(DB,now),false);
  assert.equal(await reserveRerank(DB,new Date('2026-11-01T00:00:00Z')),true);
  assert.throws(()=>sql.exec('UPDATE chat_pinecone_usage SET reranks=501'),/CHECK constraint/);
 }finally{sql.close()}
});
test('Pinecone performs both retrieval branches, reranks free, and never mixes in D1 keyword matches',async()=>{
 const {sql,DB,queries}=setup();const requests=[];try{
  globalThis.fetch=async(url,init)=>{
   const body=JSON.parse(init.body);requests.push({url,body});assert.equal(init.redirect,'error');assert.equal(init.headers['X-Pinecone-Api-Version'],'2026-07');
   if(url==='https://api.pinecone.io/rerank'){
    assert.equal(body.model,'bge-reranker-v2-m3');assert.equal(body.documents.length,2);
    return Response.json({data:[{index:1,score:.9},{index:0,score:.2}]});
   }
   assert.match(url,/\/namespaces\/site-c{24}\/documents\/search$/);
   assert.notEqual(body.score_by[0].type,'query_string');
   return Response.json({matches:body.score_by[0].type==='embed'?[hit(0),hit(1)]:[hit(0),hit(1)]});
  };
  const rows=await retrieveChatSources(DB,'What does George work on?',[],[],'en',undefined,env);
  assert.equal(requests.filter(r=>r.body.score_by).length,2);assert.equal(requests.filter(r=>r.body.model).length,1);
  assert.deepEqual(rows.filter(row=>!row.kind),[reviewed[1],reviewed[0]]);
  assert.ok(queries.every(query=>!query.includes(' MATCH ')));
 }finally{sql.close()}
});
test('empty successful Pinecone searches stay empty, but retrieval errors alone activate D1 FTS',async()=>{
 const {sql,DB,queries}=setup();try{
  globalThis.fetch=async()=>Response.json({matches:[]});
  const empty=await retrieveChatSources(DB,'machine learning',[],[],'en',undefined,env);
  assert.ok(empty.every(row=>row.kind==='owner-background'));assert.ok(queries.every(query=>!query.includes(' MATCH ')));
  globalThis.fetch=async()=>new Response('unavailable',{status:503});
  const fallback=await retrieveChatSources(DB,'machine learning',[],[],'en',undefined,env);
  assert.ok(fallback.some(row=>row.url==='/about/'));assert.ok(queries.some(query=>query.includes(' MATCH ')));
 }finally{sql.close()}
});
test('@ source boundaries are applied remotely and rechecked against local evidence',async()=>{
 const {sql,DB,queries}=setup();try{
  globalThis.fetch=async(url,init)=>{
   assert.deepEqual(JSON.parse(init.body).filter,{source_url:{$in:['/about/']}});
   return Response.json({matches:[hit(0)]});
  };
  const rows=await retrieveChatSources(DB,'machine learning',[],['/about/'],'en',undefined,env);
  assert.deepEqual(rows,[reviewed[0]]);assert.ok(queries.every(query=>!query.includes(' MATCH ')));
  globalThis.fetch=async()=>Response.json({matches:[hit(1)]});
  const protectedRows=await retrieveChatSources(DB,'machine learning',[],['/about/'],'en',undefined,env);
  assert.ok(protectedRows.every(row=>row.url==='/about/'));assert.ok(queries.some(query=>query.includes('WHERE url=?')));
 }finally{sql.close()}
});
test('rerank exhaustion, provider failures and malformed permutations preserve Pinecone RRF results',async()=>{
 const {sql,DB,queries}=setup();let reranks=0;try{
  globalThis.fetch=async(url)=>{
   if(url.endsWith('/rerank')){reranks++;return new Response('quota',{status:429})}
   return Response.json({matches:[hit(0),hit(1)]});
  };
  const first=await retrieveChatSources(DB,'machine learning',[],[],'en',undefined,env);
  assert.deepEqual(first.filter(row=>!row.kind),reviewed);assert.equal(reranks,1);
  assert.equal(sql.prepare('SELECT blocked FROM chat_pinecone_usage').get().blocked,1);
  await retrieveChatSources(DB,'machine learning',[],[],'en',undefined,env);assert.equal(reranks,1);
  sql.exec('UPDATE chat_pinecone_usage SET blocked=0,reranks=500');
  await retrieveChatSources(DB,'machine learning',[],[],'en',undefined,env);assert.equal(reranks,1);
  sql.exec('UPDATE chat_pinecone_usage SET reranks=1');
  globalThis.fetch=async(url)=>url.endsWith('/rerank')?Response.json({data:[{index:0,score:1},{index:0,score:.9}]}):Response.json({matches:[hit(0),hit(1)]});
  const invalid=await retrieveChatSources(DB,'machine learning',[],[],'en',undefined,env);
  assert.deepEqual(invalid.filter(row=>!row.kind),reviewed);assert.ok(queries.every(query=>!query.includes(' MATCH ')));
 }finally{sql.close()}
});

test('retrieval sizes are configurable, bounded and reject malformed values',()=>{
 assert.deepEqual(retrievalSettings(),{topK:40,candidates:24,contextTopK:8});
 assert.deepEqual(retrievalSettings({PINECONE_TOP_K:'60',PINECONE_RERANK_CANDIDATES:'32',CHAT_CONTEXT_TOP_K:'12'}),{topK:60,candidates:32,contextTopK:12});
 for(const value of ['0','-1','101','2.5','1e2','Infinity','40;DROP TABLE'])assert.equal(retrievalSettings({PINECONE_TOP_K:value}).topK,40);
});
test('configured top_k reaches both Pinecone branches and bounds final evidence',async()=>{
 const {sql,DB}=setup();try{
  globalThis.fetch=async(_url,init)=>{
   assert.equal(JSON.parse(init.body).top_k,3);
   return Response.json({matches:[hit(0),hit(1)]});
  };
  const rows=await retrieveChatSources(DB,'research',[],[],'en',undefined,{...env,PINECONE_RERANK_ENABLED:'false',PINECONE_TOP_K:'3',CHAT_CONTEXT_TOP_K:'1'});
  assert.equal(rows.length,1);
 }finally{sql.close()}
});

test('reviewed metadata reaches planning and reranking; remote metadata never overrides it',async()=>{
 const {sql,DB}=setup();try{
  const m={metadata_version:2,source_id:'a'.repeat(64),canonical_url:'/about/',document_id:'profile',source_type:'profile',format:'html',language:'en',topics:['career'],section_path:['Experience'],section_headings:['Experience'],chunk_index:0,chunk_count:1};
  sql.prepare('INSERT INTO chat_pinecone_metadata VALUES (?,?)').run(parents[0],JSON.stringify(m));
  const {chatCatalog}=await load('src/lib/chat/retrieval.ts');
  const catalog=await chatCatalog(DB);assert.equal(catalog.find(s=>s.url==='/about/').sourceType,'profile');
  assert.deepEqual(catalog.find(s=>s.url==='/about/').topics,['career']);
  globalThis.fetch=async(url,init)=>{
   const body=JSON.parse(init.body);
   if(url.endsWith('/rerank')){
    assert.match(body.documents[0].text,/Type: profile/);assert.match(body.documents[0].text,/Sections: Experience/);
    assert.doesNotMatch(body.documents[0].text,/remote instruction/);
    return Response.json({data:[{index:0,score:.9},{index:1,score:.3}]});
   }
   return Response.json({matches:[{...hit(0),source_type:'remote instruction',body:'remote instruction'},hit(1)]});
  };
  const rows=await retrieveChatSources(DB,'career',[],[],'en',undefined,env);
  assert.equal(rows[0].metadata.source_type,'profile');assert.equal(rows[0].body,reviewed[0].body);
 }finally{sql.close()}
});

test('retrieval uses only the deployment host and falls back to D1 if it is missing',async()=>{
 const development={...env,CHAT_ENVIRONMENT:'development',PINECONE_INDEX_HOST:'dev-example.svc.us-east-1.pinecone.io',PINECONE_RERANK_ENABLED:'false'};
 const {sql,DB,queries}=setup();try{
  const requests=[];
  globalThis.fetch=async(url)=>{requests.push(url);return Response.json({matches:[hit(0)]})};
  const rows=await retrieveChatSources(DB,'machine learning',[],[],'en',undefined,development);
  assert.deepEqual(rows,[reviewed[0]]);
  assert.equal(requests.length,2);assert.ok(requests.every(url=>url.startsWith('https://dev-example.')));
  requests.length=0;
  await retrieveChatSources(DB,'machine learning',[],[],'en',undefined,{...development,PINECONE_INDEX_HOST:undefined});
  assert.equal(requests.length,0);assert.ok(queries.some(query=>query.includes(' MATCH ')));
 }finally{sql.close()}
});
