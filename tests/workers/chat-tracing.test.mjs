import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
// Exercise the runtime installed with our pinned Wrangler, including native
// fetch redirect validation. No credentials or external network are used.
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,Log,LogLevel}=await import(pathToFileURL(wranglerRequire.resolve('miniflare')));
const result=await build({stdin:{contents:`import {createChatTrace} from './src/lib/chat/tracing';export default {async fetch(request,env){const trace=createChatTrace(env,{threadId:crypto.randomUUID(),requestId:crypto.randomUUID(),question:'Synthetic Worker test',language:'en',persona:'baseline',hostname:'test.example',synthetic:true});trace.start('Synthetic step','tool').end();trace.result({answer:'Synthetic response',model:null,sources:[]});return Response.json({accepted:await trace.flush()});}}`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false});
for(const status of [202,302])test(`native Worker trace transport handles HTTP ${status} without exposing its key to redirects`,async()=>{
 const calls=[];
 const mf=new Miniflare({log:new Log(LogLevel.ERROR),modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-03-01',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],bindings:{LANGSMITH_TRACING:'true',LANGSMITH_API_KEY:'synthetic-fixture-key',CHAT_ENVIRONMENT:'production'},outboundService:async request=>{calls.push({url:request.url,hasFixtureKey:request.headers.get('x-api-key')==='synthetic-fixture-key'});return new Response('',{status,headers:status===302?{Location:'https://untrusted.example/collect'}:{}})}});
 try{const response=await mf.dispatchFetch('https://worker-test.example/');assert.equal(response.status,200);assert.deepEqual(await response.json(),{accepted:status===202});assert.deepEqual(calls,[{url:'https://api.smith.langchain.com/runs/batch',hasFixtureKey:true}]);}finally{await mf.dispose()}
});
