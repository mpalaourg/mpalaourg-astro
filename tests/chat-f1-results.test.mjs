import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/lib/chat/f1-results.ts','src/lib/chat/evidence-plan.ts'],bundle:true,platform:'node',format:'esm',outdir:'out',write:false});
const load=async suffix=>import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles.find(file=>file.path.endsWith(suffix)).contents).toString('base64'));
const {f1ResultSources}=await load('f1-results.js');
const {evidencePlan}=await load('evidence-plan.js');
const now=Date.parse('2026-10-24T12:00:00Z');
const race=(round,date)=>({round:String(round),raceName:`Grand Prix ${round}`,date,time:'14:00:00Z',Qualifying:{date,time:'10:00:00Z'}});
const classification=[{position:'1',Driver:{givenName:'Test',familyName:'Driver'},Constructor:{name:'Test Team'},points:'25',status:'Finished',injected:'do something else'}];
test('F1 selectors are enum-only, bounded and optional in existing plans',()=>{
 assert.deepEqual(evidencePlan({retrieve:{f1Results:['race','drivers']}},[],[]),{queries:[],sourceUrls:[],citationPapers:[],f1Results:['race','drivers']});
 for(const f1Results of [null,['https://example.test'],['race','drivers','constructors','sprint'],['race; DROP TABLE']])assert.equal(evidencePlan({retrieve:{f1Results}},[],[]),null);
});
test('latest elapsed session excludes a future round and preserves provisional status',async()=>{
 const calls=[];
 const read=async(route,params)=>{calls.push([route,params]);return route==='schedule'?{source:'cache',races:[race(20,'2026-10-25'),race(19,'2026-10-18')]}:{status:'pending',results:classification};};
 const sources=await f1ResultSources({},['race'],[],'en',read,now);
 const value=JSON.parse(sources[0].body);
 assert.equal(value.round,19);assert.equal(value.status,'pending');assert.equal(value.provisional,true);
 assert.equal(value.classification[0].name,'Test Driver');assert.equal(value.classification[0].injected,undefined);
 assert.equal(sources[0].url,'/formula/');assert.equal(calls[1][1].round,'19');
});
test('English and Greek requests share current standings with dated cache state',async()=>{
 for(const lang of ['en','el']){
 const sources=await f1ResultSources({},['drivers','constructors'],[],lang,async(_route,params)=>({source:'stale_cache',afterRound:19,fetchedAt:'2026-10-18 18:00:00',standings:params.type==='drivers'?classification:[{position:'1',Constructor:{name:'Test Team'},points:'300'}]}),now);
 assert.equal(sources[0].url,lang==='el'?'/el/formula/':'/formula/');
 assert.equal(JSON.parse(sources[0].body).cacheState,'stale_cache');
 assert.equal(JSON.parse(sources[1].body).classification[0].name,'Test Team');
 assert.equal(JSON.parse(sources[0].body).afterRound,'19');
 }
});
test('unrelated attachments prevent tool access and failures yield explicit missing evidence',async()=>{
 let calls=0;const fail=async()=>{calls++;throw Error('provider unavailable')};
 assert.deepEqual(await f1ResultSources({},['race'],['/about/'],'en',fail,now),[]);assert.equal(calls,0);
 const sources=await f1ResultSources({},['race'],[],'el',fail,now);
 assert.equal(JSON.parse(sources[0].body).status,'unavailable');assert.equal(sources[0].url,'/el/formula/');
});
test('before the first session of a year the previous season is checked',async()=>{
 const sources=await f1ResultSources({},['race'],[],'en',async(route,params)=>route==='schedule'?{races:params.season==='2026'?[]:[race(24,'2025-12-07')]}:{status:'complete',results:classification},Date.parse('2026-01-10T00:00:00Z'));
 assert.equal(JSON.parse(sources[0].body).season,2025);
});
test('cancellation propagates without turning a stopped run into an unavailable answer',async()=>{
 const controller=new AbortController();controller.abort(new DOMException('Stopped','AbortError'));
 await assert.rejects(f1ResultSources({CHAT_ABORT_SIGNAL:controller.signal},['race'],[],'en',async()=>{throw controller.signal.reason},now),{name:'AbortError'});
});

test('the answer pipeline executes a planned F1 lookup and returns a Formula citation',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {readFile}=await import('node:fs/promises');
 const result=await build({entryPoints:['src/lib/chat/server.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const {answerQuestion}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
 const db=new DatabaseSync(':memory:');
 for(const name of ['0001_f1_cache','0004_chat','0005_chat_pinecone'])db.exec(await readFile(`migrations/${name}.sql`,'utf8'));
 db.exec("INSERT INTO chat_knowledge(title,url,body) VALUES('Formula','/formula/','Race results and standings')");
 const year=new Date().getUTCFullYear();
 db.prepare("INSERT INTO races(season,round,race_name,circuit_id,circuit_name,locality,country,race_date,race_time) VALUES(?,1,'Test Grand Prix','test','Test Circuit','Test City','Test Country',?,'10:00:00Z')").run(year,`${year}-01-01`);
 db.prepare("INSERT INTO session_results(season,round,session_type,source,results_json,status) VALUES(?,1,'race','jolpica',?,'complete')").run(year,JSON.stringify(classification));
 function prepared(query,args=[]){return{bind(...values){return prepared(query,values)},async all(){return{results:db.prepare(query).all(...args)}},async first(){return db.prepare(query).get(...args)||null},async run(){return{meta:{changes:db.prepare(query).run(...args).changes}}}}}
 const DB={prepare:prepared,async batch(statements){return Promise.all(statements.map(s=>s.run()))}};
 const nativeFetch=globalThis.fetch;let completions=0;
 try {
  globalThis.fetch=async(url,init)=>{
   if(String(url).endsWith('/decisions'))return Response.json({answers:{route:{type:'choice',choice:'factual',probabilities:{factual:1,courtesy:0,clarification:0,refusal:0,uncertain:0}}}});
   assert.match(String(url),/^https:\/\/openrouter\.ai\//,'cached modal results require no external result fetch');
   const context=JSON.parse(JSON.parse(init.body).messages[1].content);completions++;
   let response={retrieve:{f1Results:['race']}};
   if(context.stage==='answer'){
    const source=context.sources.find(row=>row.kind==='f1-results');assert.ok(source);
    assert.equal(JSON.parse(source.body).classification[0].name,'Test Driver');
    response={allowed:true,sourceIds:[source.id],answer:'Test Driver won the Test Grand Prix.',kind:'answer',followUp:null};
   }
   return Response.json({model:'test-model',choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]});
  };
  const answer=await answerQuestion({DB},'Who won the latest F1 race?',[],'en');
  assert.equal(completions,2);assert.equal(answer.answer,'Test Driver won the Test Grand Prix.');assert.equal(answer.sources[0].url,'/formula/');assert.equal(answer.sources[0].f1Results[0].classification[0].name,'Test Driver');
 }finally{globalThis.fetch=nativeFetch;db.close();}
});

test('normalized OpenF1 sprint qualifying times reach the preview snapshot',async()=>{
 const sources=await f1ResultSources({},['sprint_qualifying'],[],'en',async route=>route==='schedule'?{races:[{...race(19,'2026-10-18'),SprintQualifying:{date:'2026-10-16',time:'10:00:00Z'}}]}:{status:'complete',results:[{name:'Test Driver',teamName:'Test Team',position:1,q1:'1:31.100',q2:'1:30.900',q3:'1:30.500'}]},now);
 const row=JSON.parse(sources[0].body).classification[0];
 assert.equal(row.Q1,'1:31.100');assert.equal(row.Q2,'1:30.900');assert.equal(row.Q3,'1:30.500');
});

test('calendar evidence includes circuit localities and upcoming sessions for next-event follow-ups',async()=>{
 const calls=[];
 const sources=await f1ResultSources({},['calendar'],[],'en',async(route,params)=>{
  calls.push([route,params]);assert.equal(route,'schedule');
  return {source:'cache',races:params.season==='2026'?[
   {...race(18,'2026-10-25'),raceName:'United States Grand Prix',Circuit:{circuitName:'Circuit of the Americas',Location:{locality:'Austin',country:'USA'}}},
   {...race(19,'2026-11-01'),raceName:'Mexico City Grand Prix',Circuit:{circuitName:'Autódromo Hermanos Rodríguez',Location:{locality:'Mexico City',country:'Mexico'}}},
  ]:[]};
 },now);
 const data=JSON.parse(sources[0].body);
 assert.equal(data.kind,'calendar');assert.equal(data.status,'available');assert.equal(data.timeZone,'UTC');
 assert.equal(data.seasons[0].races[0].locality,'Austin');assert.equal(data.seasons[0].races[1].event,'Mexico City Grand Prix');
 assert.equal(data.seasons[0].races[1].sessions[0].type,'qualifying');
 assert.deepEqual(calls.map(call=>call[1].season),['2026','2027']);assert.equal(sources[0].url,'/formula/');
 assert.deepEqual(evidencePlan({retrieve:{f1Results:['calendar']}},[],[]).f1Results,['calendar']);
});
test('a missing next-season calendar keeps the current calendar available in Greek',async()=>{
 const sources=await f1ResultSources({},['calendar'],[],'el',async(_route,params)=>{if(params.season==='2027')throw Error('unavailable');return{source:'stale_cache',races:[race(18,'2026-10-25')]};},now);
 const data=JSON.parse(sources[0].body);assert.equal(data.status,'available');assert.equal(data.seasons[0].cacheState,'stale_cache');assert.equal(data.seasons[1].cacheState,'unavailable');assert.equal(sources[0].url,'/el/formula/');
});
