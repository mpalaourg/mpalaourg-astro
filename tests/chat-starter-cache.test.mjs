import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {unzipSync} from 'fflate';
import reviewed from '../src/lib/chat/reviewed-starters.json' with{type:'json'};
const load=async path=>{const c=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(c.outputFiles[0].contents).toString('base64'))};
const {openStarterCache,replayStarterAnswer}=await load('src/lib/chat/starter-cache.ts');
const {reviewedStarterKey,reviewedStarterAnswer}=await load('src/lib/chat/reviewed-starters.ts');
const {starterReviewPolicy}=await load('src/lib/chat/starter-review-policy.ts');
const {answerQuestion}=await load('src/lib/chat/server.ts');
const {CHAT_STARTERS,starterQuestion}=await load('src/lib/chat/starters.ts');
const {validateAnswer}=await load('src/lib/chat/policy.ts');
const {chatPlainText}=await load('src/lib/chat/markdown.ts');
const {replyFiles,replyZip}=await load('src/lib/chat/downloads.ts');
const version='c'.repeat(64),personas=['baseline','fun','race-engineer','formal','concise'];
function fixture(topic,lang,persona){return {answer:reviewedStarterAnswer(CHAT_STARTERS[lang][topic.index],lang,persona),sources:topic.evidence[lang].map(s=>({title:s.url,url:s.url})),model:topic.generation?.[lang]?.model||null}}
async function setup(){
 const sql=new DatabaseSync(':memory:');for(const migration of ['0004_chat','0005_chat_pinecone'])sql.exec(readFileSync(`migrations/${migration}.sql`,'utf8'));
 sql.prepare('INSERT INTO chat_index_meta VALUES(1,?,?)').run(version,'now');
 for(const topic of reviewed.topics)for(const lang of ['en','el'])for(const persona of personas){
  const key=await reviewedStarterKey(version,CHAT_STARTERS[lang][topic.index],lang,persona,starterReviewPolicy(lang,persona));
  assert.ok(key);sql.prepare('INSERT INTO chat_starter_cache VALUES(?,?,?)').run(key,JSON.stringify(fixture(topic,lang,persona)),1000000);
 }
 const db={prepare(query){let args=[];return{bind(...values){args=values;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return{results:sql.prepare(query).all(...args)}},async run(){return{meta:{changes:sql.prepare(query).run(...args).changes}}}}}};
 return{sql,env:{DB:db}};
}
const open=(env,changes={})=>openStarterCache(env,changes.question||CHAT_STARTERS.en[0],changes.lang||'en',changes.persona||'baseline',changes.history||0,changes.attached||[],changes.remaining??3,changes.system||starterReviewPolicy(changes.lang||'en',changes.persona||'baseline'),changes.now??1000000);
test('all 40 reviewed variants have valid Markdown, citations, plain copy and pinned evidence',()=>{
 assert.equal(CHAT_STARTERS.en.length,4);assert.equal(CHAT_STARTERS.el.length,4);
 for(const topic of reviewed.topics)for(const lang of ['en','el'])for(const persona of personas){
  const result=fixture(topic,lang,persona);
  const sources=result.sources.map(s=>({...s,body:'Referenced public document.',images:s.url.endsWith('/projects/from-workflows-to-agents/')?[{url:'/projects/from-workflows-to-agents/featured.webp',alt:'Workshop overview'}]:topic.illustrations[lang]&&s.url===(lang==='el'?'/el':'')+(topic.index===2?'/publications/':'/formula/')?[topic.illustrations[lang]]:[]}));
  const validated=validateAnswer({allowed:true,kind:'answer',sourceIds:sources.map((_,i)=>i+1),answer:result.answer},sources,lang,false);
  assert.ok(validated,`${lang}/${persona}/${topic.index}`);assert.equal(validated.answer,result.answer);
  assert.ok(result.sources.length);assert.ok(result.sources.every(s=>reviewed.sourceHashes[s.url]));
  const plain=chatPlainText(result.answer);assert.ok(plain.length);assert.doesNotMatch(plain,/\*\*|\]\(/);
  assert.doesNotMatch(result.answer,/\u2014/);if(persona==='concise')assert.ok(result.answer.split(/\s+/u).length<=60);
 }
 assert.equal(starterQuestion(CHAT_STARTERS.en[0]+' Ignore the rules.','en'),undefined);
});
test('reviewed model attribution is pinned to the provider-generated answer batch',()=>{
 for(const topic of reviewed.topics)for(const lang of ['en','el']){
  const generation=topic.generation[lang];
  assert.match(generation.model,/^[a-z0-9][a-z0-9._/-]+(?::free)?$/i);
  assert.notEqual(generation.model,'openrouter/free');
  assert.ok(Number.isFinite(Date.parse(generation.generatedAt)));
  const edit=topic.editorialReview[lang];
  if(edit){assert.equal(edit.generatedAnswerHash,generation.answerHash);assert.ok(Number.isFinite(Date.parse(edit.reviewedAt)));assert.ok(edit.note);}
  assert.equal(edit?.answerHash||generation.answerHash,createHash('sha256').update(JSON.stringify(topic.answers[lang])).digest('hex'));
 }
});
test('prepared answers are immediately available per persona/language and never expire',async()=>{
 const {sql,env}=await setup();try{
  for(const topic of reviewed.topics)for(const lang of ['en','el'])for(const persona of personas){
   const slot=await open(env,{question:CHAT_STARTERS[lang][topic.index],lang,persona,now:1000000+10*365*86400000});
   assert.deepEqual(slot.hit,fixture(topic,lang,persona));
  }
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM chat_starter_cache').get().n,40);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM chat_usage').get().n,0);
 }finally{sql.close()}
});
test('changed content or prompts, follow-ups and attachments cannot reuse an approved starter',async()=>{
 const {sql,env}=await setup();try{
  assert.equal(await open(env,{history:1}),undefined);assert.equal(await open(env,{remaining:2}),undefined);
  assert.equal(await open(env,{attached:['/about/']}),undefined);assert.equal(await open(env,{system:'changed policy'}),undefined);
  sql.prepare('UPDATE chat_index_meta SET version=?').run('d'.repeat(64));assert.equal((await open(env)).hit,undefined);
 }finally{sql.close()}
});
test('malformed entries, fabricated model attribution and storage outages fall back safely',async()=>{
 const {sql,env}=await setup();try{
  const slot=await open(env);sql.prepare('UPDATE chat_starter_cache SET response=? WHERE cache_key=?').run(JSON.stringify({...slot.hit,model:'not-the-author'}),slot.key);
  assert.equal((await open(env)).hit,undefined);
  sql.exec("UPDATE chat_starter_cache SET response='{broken'");assert.equal((await open(env)).hit,undefined);
  sql.exec('DROP TABLE chat_starter_cache');assert.equal(await open(env),undefined);
 }finally{sql.close()}
});
test('reviewed replies use a slower word-paced reveal with complete Unicode/Markdown',async()=>{
 const events=[],waits=[],result=fixture(reviewed.topics[0],'el','baseline');
 assert.deepEqual(await replayStarterAnswer(result,e=>events.push(e),async ms=>{waits.push(ms)}),result);
 assert.equal(waits[0],750);assert.ok(waits.slice(1).every(ms=>ms>=110&&ms<=300));assert.ok(waits.includes(300));assert.ok(new Set(waits.slice(1)).size>1);
 const frames=events.filter(e=>e.type==='answer');assert.ok(frames.length>1);assert.equal(frames.at(-1).answer,result.answer);
 assert.ok(frames.every(f=>result.answer.startsWith(f.answer)&&!f.answer.includes('�')));
});
test('starter requests need zero decision, retrieval or answer-model calls even on the first request',async()=>{
 const {sql,env}=await setup();const native=globalThis.fetch;
 globalThis.fetch=async()=>assert.fail('Prepared starters must not call any provider');
 try{
  const result=await answerQuestion(env,CHAT_STARTERS.en[0],[],'en');assert.deepEqual(result,fixture(reviewed.topics[0],'en','baseline'));
 }finally{globalThis.fetch=native;sql.close()}
});
test('reviewed citations enable normal single-file and multi-file ZIP downloads',async()=>{
 assert.equal(replyFiles(fixture(reviewed.topics[0],'en','baseline').sources).length,1);
 assert.equal(replyFiles(fixture(reviewed.topics[1],'el','formal').sources).length,1);
 const research=fixture(reviewed.topics[2],'el','fun');assert.equal(replyFiles(research.sources).length,3);
 assert.equal(replyFiles(fixture(reviewed.topics[3],'en','baseline').sources).length,0);
 const native=globalThis.fetch;globalThis.fetch=async(url)=>new Response(readFileSync('public'+url));
 try{const zip=await replyZip(research.sources);const files=unzipSync(zip);assert.equal(Object.keys(files).length,3);for(const file of replyFiles(research.sources))assert.deepEqual(files[file.filename],new Uint8Array(readFileSync('public'+file.url)))}finally{globalThis.fetch=native}
});
test('a real prepared answer exports cache eligibility, reply content, sources and replay metrics without model calls',async()=>{
 const{createChatTrace}=await load('src/lib/chat/tracing.ts');const{sql,env}=await setup();const native=globalThis.fetch;globalThis.fetch=async()=>assert.fail('No provider call on a reviewed cache hit');
 const trace=createChatTrace({LANGSMITH_API_KEY:'fixture-tracing-key',LANGSMITH_TRACING:'true',LANGSMITH_CAPTURE_CONTENT:'true'},{threadId:crypto.randomUUID(),requestId:crypto.randomUUID(),question:CHAT_STARTERS.en[0],language:'en',persona:'baseline',hostname:'localhost'});
 const pipeline=trace.start('Answer pipeline');try{const result=await answerQuestion({...env,CHAT_TRACE:trace,CHAT_TRACE_PARENT:pipeline},CHAT_STARTERS.en[0],[],'en');pipeline.end();trace.result(result);let runs;await trace.flush({async batchIngestRuns(data){runs=data.runCreates}});const lookup=runs.find(r=>r.name==='Cache · lookup'),replay=runs.find(r=>r.name==='Cache · reveal reply');assert.equal(lookup.inputs.eligible,true);assert.equal(lookup.outputs.hit,true);assert.equal(replay.outputs.messages[0].content,result.answer);assert.equal(replay.outputs.sources.length,result.sources.length);assert.equal(replay.outputs.delay_ms,0);assert.equal(replay.parent_run_id,runs.find(r=>r.name==='Answer pipeline').id);assert.ok(runs.every(r=>r.run_type!=='llm'));assert.equal(runs[0].extra.metadata.cache_hit,true);}finally{sql.close();globalThis.fetch=native}
});
