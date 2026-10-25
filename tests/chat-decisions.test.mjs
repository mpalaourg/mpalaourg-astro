import assert from 'node:assert/strict';
import{test,afterEach}from'node:test';
import{build}from'esbuild';
import{decisionResponse}from'./helpers/chat-model.mjs';
const compiled=await build({entryPoints:['src/lib/chat/decisions.ts'],bundle:true,platform:'node',format:'esm',write:false});
const{parseRoute,decideChatRoute,DEFAULT_DECISION_MODELS}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const original=globalThis.fetch;afterEach(()=>globalThis.fetch=original);
const uncertain=()=>({answers:{route:{type:'choice',choice:'factual',probabilities:{factual:0.5,courtesy:0.2,clarification:0.1,refusal:0.1,uncertain:0.1}}}});
test('decision outputs require a known typed choice and a consistent probability distribution',async()=>{
 const good=await decisionResponse().json();assert.deepEqual(parseRoute(good),{kind:'factual',confident:true});
 for(const bad of [null,{}, {answers:{route:{type:'choice',choice:'execute_sql',probabilities:{}}}}, {answers:{route:{...good.answers.route,probabilities:{...good.answers.route.probabilities,refusal:1}}}}, {answers:{route:{...good.answers.route,choice:'refusal'}}}])assert.equal(parseRoute(bad),null);
 assert.equal(parseRoute(uncertain()).confident,false);
});
for(const [name,first]of [['HTTP error',()=>new Response('',{status:429})],['timeout',()=>{throw new DOMException('Timed out','TimeoutError')}],['invalid output',()=>Response.json({answers:{}})],['low confidence',()=>Response.json(uncertain())]])test(`decision chain escalates on ${name} without changing the criteria`,async()=>{
 const calls=[];globalThis.fetch=async(url,init)=>{assert.equal(url,'https://openrouter.ai/api/alpha/decisions');calls.push(JSON.parse(init.body));return calls.length===1?first():decisionResponse('refusal')};
 const result=await decideChatRoute({OPENROUTER_API_KEY:'test'},'A test question',[],[],'en',Date.now()+125000);
 assert.equal(result.kind,'refusal');assert.equal(result.model,DEFAULT_DECISION_MODELS[1]);
 assert.deepEqual(calls.map(c=>c.model),DEFAULT_DECISION_MODELS.slice(0,2));assert.deepEqual(calls[0].questions,calls[1].questions);assert.deepEqual(calls[0].state,calls[1].state);
 assert.equal(calls[0].messages,undefined);assert.equal(calls[0].state.systemPrompt,undefined);
});
test('Jev is used only after all three free decision routes fail',async()=>{
 const calls=[];globalThis.fetch=async(_url,init)=>{calls.push(JSON.parse(init.body).model);return calls.length<4?new Response('',{status:503}):decisionResponse('courtesy')};
 const result=await decideChatRoute({},'Hello',[],[],'en',Date.now()+125000);
 assert.deepEqual(calls,DEFAULT_DECISION_MODELS);assert.equal(result.kind,'courtesy');assert.equal(result.model,'typesafe/jev-1.14');
});
test('a confident refusal is final and uncertainty at the last model asks for clarification',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return decisionResponse('refusal')};
 assert.equal((await decideChatRoute({},'Test',[],[],'en',Date.now()+125000)).kind,'refusal');assert.equal(calls,1);
 globalThis.fetch=async()=>Response.json(uncertain());
 assert.equal((await decideChatRoute({},'Test',[],[],'en',Date.now()+125000)).kind,'clarification');
});
test('decision outages fail closed and exhausted request budgets do not make more calls',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:503})};
 await assert.rejects(decideChatRoute({},'Test',[],[],'en',Date.now()+125000),/chat_decisions_unavailable/);assert.equal(calls,4);
 calls=0;await assert.rejects(decideChatRoute({},'Test',[],[],'en',Date.now()-1),/chat_decisions_unavailable/);assert.equal(calls,0);
});

for(const [label,third]of [['success',()=>decisionResponse('factual')],['low confidence',()=>Response.json(uncertain())],['invalid output',()=>Response.json({answers:{}})]])test(`Mercury ${label} respects the paid fallback order`,async()=>{
 const calls=[];globalThis.fetch=async(_url,init)=>{
  const request=JSON.parse(init.body);calls.push(request);
  if(calls.length<3)return new Response('',{status:429});
  return calls.length===3?third():decisionResponse('factual');
 };
 const result=await decideChatRoute({},'His work?',[],[],'en',Date.now()+125000);
 assert.deepEqual(calls.map(c=>c.model),DEFAULT_DECISION_MODELS.slice(0,label==='success'?3:4));
 assert.equal(result.model,label==='success'?'inception/mercury-decide:free':'typesafe/jev-1.14');
 assert.ok(calls.every(c=>JSON.stringify(c.questions)===JSON.stringify(calls[0].questions)));
});

test('routing receives a bounded source catalog without source bodies or private metadata',async()=>{
 const available=Array.from({length:205},(_,i)=>({title:'1980s Formula 1 Drivers Champions',url:`/formula/champions/drivers/${1980+i}/`,body:'Excluded source body',private:'Excluded configuration'}));
 let state;
 globalThis.fetch=async(_url,init)=>{state=JSON.parse(init.body).state;return decisionResponse('factual')};
 const result=await decideChatRoute({},'Ποιος κέρδισε το πρωτάθλημα του 1982;',[],[],'el',Date.now()+125000,available);
 assert.equal(result.kind,'factual');
 assert.equal(state.availableSources.length,200);
 assert.deepEqual(state.availableSources[0],{title:available[0].title,url:available[0].url});
 assert.deepEqual(state.selectedSources,[],'catalog entries do not become user attachments');
});
