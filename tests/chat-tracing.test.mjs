import{test}from'node:test';import assert from'node:assert/strict';import{build}from'esbuild';
const compiled=await build({entryPoints:['src/lib/chat/tracing.ts'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});
// Keep the SDK import external; this is an integration boundary, not a model call.
const modulePath=new URL('../.chat/tracing-test-module.mjs',import.meta.url);const{writeFile,mkdir}=await import('node:fs/promises');await mkdir(new URL('../.chat/',import.meta.url),{recursive:true});await writeFile(modulePath,compiled.outputFiles[0].contents);const{createChatTrace,tracingConfig,traceUsage,scheduleTrace,traceStep}=await import(modulePath);
const secret='fixture-langsmith-credential',env={LANGSMITH_API_KEY:secret,LANGSMITH_TRACING:'true',LANGSMITH_CAPTURE_CONTENT:'true',LANGSMITH_ENDPOINT:'https://eu.api.smith.langchain.com'};
const context={threadId:'12345678-1234-4123-8123-123456789abc',requestId:'12345678-1234-4123-8123-abcdefabcdef',question:'What does Georgios work on?',language:'en',persona:'fun',hostname:'localhost'};
const collect=()=>{let runs;return{client:{async batchIngestRuns(data){runs=data.runCreates}},get:()=>JSON.parse(JSON.stringify(runs))}};
test('a deployment configures one tracing project with an environment default',()=>{
 assert.equal(tracingConfig(env).project,'mpalaourg-chat-development');
 assert.equal(tracingConfig({...env,CHAT_ENVIRONMENT:'development'}).project,'mpalaourg-chat-development');
 assert.equal(tracingConfig({...env,CHAT_ENVIRONMENT:'production'}).project,'mpalaourg-chat-production');
 assert.equal(tracingConfig({...env,CHAT_ENVIRONMENT:'production',LANGSMITH_PROJECT:'custom-prod'}).project,'custom-prod');
 assert.equal(tracingConfig({...env,LANGSMITH_PROJECT:'custom-dev'}).project,'custom-dev');
 assert.equal(tracingConfig({...env,LANGSMITH_PROJECT:'invalid/project'}),null);
 assert.equal(tracingConfig({...env,CHAT_ENVIRONMENT:'invalid'}).project,'mpalaourg-chat-development');
 assert.equal(createChatTrace({...env,LANGSMITH_SAMPLE_RATE:'0.5'},context,()=>.7),undefined);
});
test('message traces group child steps by thread, capture actual usage and never serialize sensitive envelopes',async()=>{
 const trace=createChatTrace({...env,OPENROUTER_API_KEY:'fixture-provider-credential',CHAT_OWNER_BACKGROUND_B64:'fixture-private-background'}, {...context,question:'email me at example@example.test api_key=some-private-value '+secret});
 const span=trace.start('answer-model','llm',{model:'actual/model',ls_provider:'openrouter',headers:{Authorization:'fixture-provider-credential'},prompt:'private-system-prompt',history:'private-history',body:'private-document',owner:'private-owner'});span.token();span.token();span.end({model:'actual/model',ls_model_name:'actual/model',source_urls:['/publications/','https://evil.test','/api?q=secret']},undefined,{prompt_tokens:10,completion_tokens:5,total_tokens:15,cost:.001});
 trace.firstAnswer();trace.result({answer:'A verified response.',model:'actual/model',sources:[{url:'/publications/'}]});const c=collect();await trace.flush(c.client);await trace.flush(c.client);const runs=c.get();assert.equal(runs.length,2);
 assert.equal(runs[0].inputs.messages[0].role,'user');assert.equal(runs[0].outputs.messages[0].content,'A verified response.');
 for(const run of runs){assert.equal(run.session_name,'mpalaourg-chat-development');assert.equal(run.extra.metadata.thread_id,context.threadId);assert.equal(run.trace_id,context.requestId);assert.ok(run.end_time>=run.start_time)}
 assert.equal(runs[1].parent_run_id,runs[0].id);assert.ok(runs[1].dotted_order.startsWith(runs[0].dotted_order+'.'));assert.equal(runs[1].events.length,1);
 assert.deepEqual(runs[1].outputs.usage_metadata,{input_tokens:10,output_tokens:5,total_tokens:15,total_cost:.001});
 const text=JSON.stringify(runs);for(const blocked of [secret,'fixture-provider-credential','private-system-prompt','private-history','private-document','private-owner','some-private-value','example@example.test'])assert.ok(!text.includes(blocked),blocked);
 assert.deepEqual(runs[1].extra.metadata.source_urls,['/publications/']);
});
test('metadata-only mode and cache hits do not invent generation tokens or costs',async()=>{
 const trace=createChatTrace({...env,LANGSMITH_CAPTURE_CONTENT:'false'},context);trace.start('starter-cache','tool').end({cache_hit:true});trace.result({answer:'A private response',model:'cached/model',sources:[]});const c=collect();await trace.flush(c.client);const runs=c.get();assert.deepEqual(runs[0].inputs,{});assert.equal(runs[0].outputs.messages,undefined);assert.equal(runs[0].outputs.model,'cached/model');assert.ok(runs.every(r=>r.run_type!=='llm'));assert.ok(!JSON.stringify(runs).includes('private response'));
 assert.deepEqual(traceUsage({prompt_tokens:-1,cost:Infinity,completion_tokens:NaN}),{});
});
test('error spans export bounded stack frames and causes while excluding private exception messages',async()=>{
 const trace=createChatTrace({...env,LANGSMITH_CAPTURE_CONTENT:'false',OPENROUTER_API_KEY:'fixture-provider-secret'},context);
 const privateMessage='SELECT visitor-private-value; provider body fixture-provider-secret\n    at PRIVATE_MESSAGE_FRAME (worker.js:99:99)';
 const cause=Object.assign(new Error(privateMessage),{code:'ECONNRESET'});
 cause.stack=`Error: ${privateMessage}\n    at requestJSON (/Users/private-owner/project/src/lib/chat/pinecone.ts:80:7)`;
 const error=new TypeError(privateMessage,{cause});
 error.stack=`TypeError: ${privateMessage}\n    at answerQuestion (file:///Users/private-owner/project/src/lib/chat/server.ts?token=private-query:91:13)\n    at fetch (node:internal/deps/undici/undici:100:9)`;
 trace.start('answer-model','llm').end({http_status:429,failure:'http_error'},'http_error',undefined,error);
 trace.fail({stage:'generate_answer'},error);
 const c=collect();await trace.flush(c.client);const runs=c.get(),step=runs[1];
 assert.match(step.error,/TypeError: http_error/);assert.match(step.error,/at answerQuestion \(src\/lib\/chat\/server.ts:91:13\)/);
 assert.match(step.error,/Caused by: Error: http_error \(ECONNRESET\)/);assert.match(step.error,/src\/lib\/chat\/pinecone.ts:80:7/);
 assert.match(step.error,/node:internal\/deps\/undici\/undici:100:9/);
 assert.equal(step.outputs.failure,'http_error');assert.equal(step.extra.metadata.http_status,429);
 assert.match(runs[0].error,/TypeError: chat_request_failed/);
 const serialized=JSON.stringify(runs);
 for(const secret of ['visitor-private-value','provider body','fixture-provider-secret','private-owner','private-query','PRIVATE_MESSAGE_FRAME'])assert.ok(!serialized.includes(secret),secret);
 assert.deepEqual(step.inputs,{});
});
test('hostile or cyclic exceptions cannot interrupt tracing and oversized stacks are bounded',async()=>{
 const trace=createChatTrace(env,context),hostile={get stack(){throw Error('unreadable stack')}};
 assert.doesNotThrow(()=>trace.start('hostile').end({},'operation_failed',undefined,hostile));
 const cyclic=new Error('private');cyclic.cause=cyclic;cyclic.stack='Error: private\n'+Array.from({length:200},()=>`    at call (src/lib/chat/server.ts:1:2)`).join('\n');
 trace.start('cyclic').end({},'network_failure',undefined,cyclic);
 const c=collect();await assert.doesNotReject(trace.flush(c.client));const runs=c.get();
 assert.equal(runs[1].error,'operation_failed');assert.ok(runs[2].error.length<=4000);
 assert.equal(runs[2].error.split('\n').filter(line=>line.includes('    at ')).length,12);
 assert.ok(!runs[2].error.includes('Caused by:'));
});
test('concurrent messages isolate projects, inputs, threads and errors',async()=>{
 const a=createChatTrace(env,context),b=createChatTrace({...env,CHAT_ENVIRONMENT:'production'},{...context,hostname:'mpalaourg.dev',threadId:crypto.randomUUID(),requestId:crypto.randomUUID(),question:'Second question'});
 a.start('failed-step').end({},'provider_failed');a.fail();b.result({answer:'Second answer',model:'second/model',sources:[]});const ac=collect(),bc=collect();await Promise.all([a.flush(ac.client),b.flush(bc.client)]);assert.equal(ac.get()[0].error,'chat_request_failed');assert.equal(bc.get()[0].error,undefined);assert.equal(bc.get()[0].session_name,'mpalaourg-chat-production');assert.ok(!JSON.stringify(bc.get()).includes(context.threadId));
});
test('the real SDK exports a complete bounded batch, and HTTP failures never escape',async()=>{
 const native=globalThis.fetch;let calls=0,payload,transport;
 globalThis.fetch=async(url,options)=>{calls++;transport={url:String(url),keyMatches:new Headers(options.headers).get('x-api-key')===secret,redirect:options.redirect,hasSignal:!!options.signal,bodyType:typeof options.body};payload=JSON.parse(typeof options.body==='string'?options.body:new TextDecoder().decode(options.body));return new Response('',{status:202})};
 try{const trace=createChatTrace(env,context);trace.result({answer:'Verified answer',model:'actual/model',sources:[]});await trace.flush();assert.equal(calls,1);assert.deepEqual(transport,{url:'https://eu.api.smith.langchain.com/runs/batch',keyMatches:true,redirect:'error',hasSignal:true,bodyType:'object'});assert.equal(payload.post[0].session_name,'mpalaourg-chat-development');assert.ok(!JSON.stringify(payload).includes(secret));
 globalThis.fetch=async()=>{calls++;throw new Error('fixture-network-secret')};const failed=createChatTrace(env,context);await assert.doesNotReject(failed.flush());assert.equal(calls,2);
 }finally{globalThis.fetch=native}
});
test('nested steps have useful redacted I/O and retain recovered failure details',async()=>{
 const trace=createChatTrace(env,context),pipeline=trace.start('Answer pipeline'),cache=pipeline.start('Cache · lookup','tool');
 cache.input({question:context.question,persona:'fun',history_turns:0,system_prompt:'private-hidden-instruction'});cache.output({hit:true,model:'cached/model',reason:'reviewed_starter_match'});cache.end({cache_hit:true});trace.annotate({cache_hit:true});
 const attempt=pipeline.start('answer-model','llm');attempt.input({messages:[{role:'user',content:'email@example.test'}],prompt:'private-system-prompt'});attempt.output({messages:[{role:'assistant',content:'A validated reply'}]});attempt.end({http_status:429,failure:'http_error'},'http_error',{prompt_tokens:10});pipeline.end();trace.result({answer:'A validated reply',model:'cached/model',sources:[]});const c=collect();await trace.flush(c.client);const runs=c.get();
 assert.equal(runs[0].name,'Chat answer · cached');assert.ok(runs[0].tags.includes('cache-hit'));assert.equal(runs[2].parent_run_id,runs[1].id);assert.equal(runs[2].inputs.question,context.question);assert.equal(runs[2].outputs.hit,true);
 assert.equal(runs[3].outputs.messages[0].content,'A validated reply');assert.equal(runs[3].outputs.messages[0].usage_metadata.input_tokens,10);assert.equal(runs[3].error,'http_error');assert.equal(runs[3].extra.metadata.http_status,429);assert.ok(!JSON.stringify(runs).includes('private-hidden-instruction'));assert.ok(!JSON.stringify(runs).includes('email@example.test'));
});
test('progress is published before the background title ends, then patched without duplicate trace IDs',async()=>{
 const trace=createChatTrace(env,context),title=trace.start('Background · chat title','llm');const batches=[];const client={async batchIngestRuns(data){batches.push(structuredClone(data))}};
 await trace.publish(client);assert.equal(batches[0].runCreates.length,2);assert.equal(batches[0].runCreates[0].end_time,undefined);
 const answer=trace.start('Cache · reveal reply');answer.output({messages:[{role:'assistant',content:'Cached answer'}],chunks:5,duration_ms:1200});answer.end();trace.result({answer:'Cached answer',model:'cached/model',sources:[]});await trace.publish(client);
 assert.equal(batches[1].runCreates.length,1);const completed=batches[1].runUpdates.find(run=>run.id===context.requestId);assert.equal(completed.outputs.messages[0].content,'Cached answer');assert.ok(completed.end_time);assert.equal(batches[1].runUpdates.find(run=>run.name.includes('title')).end_time,undefined);
 title.output({messages:[{role:'assistant',content:'Workflows workshop'}]});title.end();await trace.flush(client);assert.equal(batches[2].runCreates.length,0);assert.equal(batches[2].runUpdates.find(run=>run.id===context.requestId).end_time,completed.end_time);assert.ok(batches[2].runUpdates.every(run=>run.end_time));assert.equal(new Set(batches.flatMap(b=>b.runCreates.map(r=>r.id))).size,3);
});
test('a slow background task cannot inflate saved-answer latency',async()=>{
 const nativeNow=Date.now;let clock=Date.UTC(2026,9,23,19);Date.now=()=>clock;
 try{const exports=[],trace=createChatTrace(env,context),background=trace.start('Background · chat title','llm');clock+=5000;trace.result({answer:'Cached reply',model:'cached/model',sources:[]});const client={async batchIngestRuns(batch){exports.push(structuredClone(batch))}};await trace.publish(client);clock+=15000;background.output({messages:[{role:'assistant',content:'Research papers'}]});background.end();await trace.flush(client);const root=exports[1].runUpdates.find(run=>run.parent_run_id===undefined);assert.equal(root.end_time-Number(root.start_time),5000);assert.equal(root.extra.metadata.answer_latency_ms,5000);assert.equal(root.extra.metadata.background_completed_ms,20000);
 }finally{Date.now=nativeNow}
});

test('malformed telemetry fields and broken UUID generation cannot escape span boundaries',async()=>{
 const trace=createChatTrace(env,context),bad=Object.defineProperty({},'question',{enumerable:true,get(){throw new Error('bad metadata getter')}});
 const span=trace.start('Answer pipeline');
 for(const operation of [()=>trace.annotate(bad),()=>span.input(bad),()=>span.output(bad),()=>span.end(bad),()=>trace.result(bad),()=>trace.fail(bad)])assert.doesNotThrow(operation);
 const nativeUUID=crypto.randomUUID;crypto.randomUUID=()=>{throw new Error('runtime UUID failure')};
 try{const noop=trace.start('broken span');assert.doesNotThrow(()=>noop.start('nested').input(bad));assert.doesNotThrow(()=>traceStep({CHAT_TRACE_PARENT:noop},'nested').end(bad))}finally{crypto.randomUUID=nativeUUID}
 trace.result({answer:'Answer still saved',model:'actual/model',sources:[]});const c=collect();assert.equal(await trace.flush(c.client),true);assert.equal(c.get()[0].outputs.messages[0].content,'Answer still saved');
});
test('snapshot failures and even a throwing diagnostic logger are contained; failed exports are dropped',async()=>{
 const nativeClone=globalThis.structuredClone,trace=createChatTrace(env,context);
 globalThis.structuredClone=()=>{throw new Error('serialization unavailable')};
 try{assert.equal(await trace.publish(),false);assert.equal(await trace.flush(),false)}finally{globalThis.structuredClone=nativeClone}
 const failed=createChatTrace(env,context),nativeWarn=console.warn;let attempts=0;console.warn=()=>{throw new Error('logger unavailable')};
 const client={async batchIngestRuns(){attempts++;throw new Error('unavailable')}};
 try{assert.equal(await failed.publish(client),false);assert.equal(await failed.flush(client),false);assert.equal(attempts,1)}finally{console.warn=nativeWarn}
});
test('telemetry scheduling absorbs synchronous, asynchronous and waitUntil failures',async()=>{
 const scheduled=[];
 assert.doesNotThrow(()=>scheduleTrace(()=>{throw new Error('sync export failure')},{waitUntil:task=>scheduled.push(task)}));
 assert.doesNotThrow(()=>scheduleTrace(()=>Promise.reject(new Error('async export failure')),{waitUntil:task=>{scheduled.push(task);throw new Error('runtime shutting down')}}));
 await assert.doesNotReject(Promise.all(scheduled));
});
test('a transport ignoring cancellation is bounded and does not retry queued snapshots',async()=>{
 const trace=createChatTrace(env,context);let calls=0;const client={batchIngestRuns(){calls++;return new Promise(()=>{})}};
 const initial=trace.publish(client),final=trace.flush(client);
 assert.deepEqual(await Promise.all([initial,final]),[false,false]);assert.equal(calls,1);
});
