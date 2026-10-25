import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
let Chat;
globalThis.HTMLElement=class{};
globalThis.customElements={get(){},define(_name,constructor){Chat=constructor}};
globalThis.document={cookie:'site_cookie_choice=chat-v2-accepted',documentElement:{classList:{contains(){return false}}}};
globalThis.window={};
const built=await build({entryPoints:['src/scripts/site-chat.ts'],bundle:true,platform:'node',format:'esm',write:false});
await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
async function fixture(){
 const c=new Chat(),container={hidden:true,clientWidth:300,dataset:{}},notice={textContent:''};
 let callbacks,renders=0,updates=0;
 c.q=selector=>{if(selector==='.chat-challenge')return container;if(selector==='.chat-notice')return notice;throw Error(selector)};
 c.updateControls=()=>{updates++};
 window.turnstile={render(target,options){assert.equal(target,container);callbacks=options;renders++;return 'widget'},reset(){},remove(){}};
 await c.configureChallenge('public-site-key');
 return {c,container,notice,callbacks,get renders(){return renders},get updates(){return updates}};
}
test('successful verification clears a previous challenge error and hides the success widget',async()=>{
 const f=await fixture();
 f.callbacks['error-callback']();
 assert.ok(f.notice.textContent);assert.equal(f.container.hidden,false);assert.equal(f.c.challengeToken,'');
 f.callbacks.callback('verified-token');
 assert.equal(f.notice.textContent,'');assert.equal(f.container.hidden,true);assert.equal(f.c.challengeToken,'verified-token');
 f.callbacks['after-interactive-callback']();assert.equal(f.container.hidden,true);
 await f.c.configureChallenge('public-site-key');assert.equal(f.renders,1);assert.equal(f.container.hidden,true);
});
test('an interactive retry clears its old error and expiry makes the next challenge available',async()=>{
 const f=await fixture();assert.equal(f.callbacks.retry,'auto');
 f.callbacks['error-callback']();f.callbacks['before-interactive-callback']();
 assert.equal(f.notice.textContent,'');assert.equal(f.container.dataset.interactive,'true');assert.equal(f.container.hidden,false);
 f.callbacks['after-interactive-callback']();assert.equal(f.container.hidden,false);
 f.callbacks.callback('verified-token');assert.equal(f.container.hidden,true);
 f.callbacks['expired-callback']();assert.equal(f.container.hidden,false);assert.equal(f.c.challengeToken,'');
 f.callbacks['before-interactive-callback']();f.callbacks.callback('fresh-token');
 assert.equal(f.container.hidden,true);assert.equal(f.container.dataset.interactive,undefined);assert.equal(f.c.challengeToken,'fresh-token');
 f.callbacks['timeout-callback']();assert.equal(f.container.hidden,false);assert.equal(f.c.challengeToken,'');
});
test('verification recovery preserves unrelated API, allowance and conversation notices',async()=>{
 const f=await fixture();f.callbacks['error-callback']();f.c.notice('Your daily allowance is exhausted.');
 f.callbacks['before-interactive-callback']();assert.equal(f.notice.textContent,'Your daily allowance is exhausted.');
 f.callbacks.callback('verified-token');assert.equal(f.notice.textContent,'Your daily allowance is exhausted.');assert.equal(f.container.hidden,true);
});
