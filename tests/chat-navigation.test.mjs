import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
let Chat;
globalThis.HTMLElement=class{};
globalThis.customElements={get(){},define(name,constructor){Chat=constructor;}};
globalThis.document={cookie:'site_cookie_choice=chat-v2-accepted'};
globalThis.sessionStorage={setItem(){}};
globalThis.window={};
const built=await build({entryPoints:['src/scripts/site-chat.ts'],bundle:true,platform:'node',format:'esm',write:false});
await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve};}
function chat(){
 const c=new Chat();const input={value:'Tell me about his work',disabled:false,dispatchEvent(){},focus(){}};
 Object.defineProperty(c,'input',{value:input});
 c.q=selector=>selector==='.chat-messages'?{querySelector(){return null}}:{textContent:''};
 c.applyConsent=()=>true;c.notice=()=>{};c.renderAttachments=()=>{};c.closeSources=()=>{};c.closeMenus=()=>{};c.renderThreads=()=>{};c.renderMessages=()=>{};c.renderPersona=()=>{};c.updateControls=()=>{};c.load=async()=>{};
 return c;
}
test('a delayed create never selects the old chat or clears the new view draft',async()=>{
 const c=chat(),created=deferred(),answer=deferred();let emit;const calls=[];const painted=[];
 c.renderLiveAnswer=m=>painted.push(m.answer);
 // Capture the streaming callback separately from the mocked response body.
 c.api=async(body,id,onEvent)=>{calls.push(body);if(body.action==='create'){await created.promise;return{id:body.id}}emit=onEvent;await answer.promise;return{};};
 const work=c.send();const origin=c.active;assert.equal(c.running.size,1);
 await c.action('new');assert.equal(c.active,'');c.input.value='A draft in another chat';
 created.resolve();await new Promise(r=>setImmediate(r));
 emit({type:'answer',answer:'Only for the original chat'});
 assert.equal(c.active,'');assert.equal(c.input.value,'A draft in another chat');assert.deepEqual(painted,[]);
 assert.equal(c.running.get(origin).messages[0].answer,'Only for the original chat');
 emit({type:'done',answer:'Complete',sources:[],model:'test'});answer.resolve();await work;
 assert.equal(c.input.value,'A draft in another chat');assert.equal(c.active,'');
 assert.equal(calls.filter(b=>b.action==='create').length,1);assert.equal(calls[1].id,origin);
});
test('switching back to a running chat restores its streaming answer without a second request',async()=>{
 const c=chat(),answer=deferred();let emit;let asks=0;
 c.api=async(body,id,onEvent)=>{if(body?.action==='create')return{id:body.id};if(body?.action==='ask'){asks++;emit=onEvent;await answer.promise;return{}}throw new Error('Unexpected detail fetch while running');};
 const work=c.send();const id=c.active;await new Promise(r=>setImmediate(r));
 c.setActive('another-chat');emit({type:'answer',answer:'Partial answer'});
 c.setActive(id);await c.loadMessages();assert.equal(c.messages[0].answer,'Partial answer');
 assert.equal(c.answering,true);await c.send();assert.equal(asks,1);
 c.loadMessages=async()=>{};answer.resolve();await work;assert.equal(c.running.size,0);
});
test('late thread-detail responses cannot overwrite a newer selection or an A-B-A navigation',async()=>{
 const c=chat(),old=deferred();c.setActive('A');c.api=async()=>old.promise;
 const loading=c.loadMessages();c.setActive('B');c.setActive('A');c.messages=[{id:'current'}];
 old.resolve({messages:[{id:'obsolete'}],thread:{questions:1}});await loading;
 assert.deepEqual(c.messages,[{id:'current'}]);
});
test('an uncertain create retries the same conversation and message identifiers',async()=>{
 const c=chat();const creates=[];const asks=[];let first=true;
 c.api=async body=>{if(body.action==='create'){creates.push(body.id);if(first){first=false;throw new Error('Connection lost after create')}return{id:body.id}}asks.push(body);return{}};
 c.loadMessages=async()=>{};
 await c.send();const id=c.active;const requestId=c.retries.get(id).id;
 assert.equal(c.input.value,'Tell me about his work');await c.send();
 assert.deepEqual(creates,[id,id]);assert.equal(c.threads.length,1);assert.equal(asks[0].requestId,requestId);
});

test('selecting a saved chat renders loading rather than the new-chat welcome',async()=>{
 const c=chat(),response=deferred(),states=[];
 c.threads=[{id:'old-chat',questions:2,persona:'baseline'}];c.input.value='';
 c.renderMessages=()=>states.push({loading:c.loadingConversation,failed:c.threadLoadFailed,active:c.active,messages:[...c.messages]});
 c.api=async()=>response.promise;
 const selecting=c.action('select','old-chat');
 assert.ok(states.length>0);assert.ok(states.every(state=>state.loading));
 response.resolve({messages:[{id:'saved-message',answer:'Existing answer',status:'done'}],thread:{questions:2,persona:'baseline'}});
 await selecting;assert.equal(c.loadingConversation,false);assert.equal(c.messages[0].id,'saved-message');
});
test('a stale chat load cannot clear a newer loading state, and failures never show the welcome',async()=>{
 const c=chat(),first=deferred(),second=deferred();let n=0;c.api=async()=>++n===1?first.promise:second.promise;
 const a=c.action('select','A');const b=c.action('select','B');
 first.resolve({messages:[{id:'obsolete'}],thread:{questions:1}});await a;
 assert.equal(c.active,'B');assert.equal(c.loadingConversation,true);
 second.resolve({messages:[{id:'current',status:'done'}],thread:{questions:1}});await b;
 assert.equal(c.messages[0].id,'current');assert.equal(c.loadingConversation,false);
 c.api=async()=>{throw new Error('offline')};await c.action('select','C');
 assert.equal(c.threadLoadFailed,true);assert.equal(c.loadingConversation,false);
});
