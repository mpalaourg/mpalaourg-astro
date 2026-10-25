import assert from 'node:assert/strict';
import{test}from'node:test';
import{build}from'esbuild';
const built=await build({entryPoints:['src/lib/chat/turnstile.ts'],bundle:true,platform:'node',format:'esm',write:false});
const{validTurnstile,TURNSTILE_TEST_SITE_KEY:site,TURNSTILE_TEST_SECRET_KEY:secret}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
const dummy={success:true,hostname:'example.com',metadata:{result_with_testing_key:true}};
test('Cloudflare marked dummy responses work only on loopback with the official passing test pair',()=>{
 for(const host of ['localhost','127.0.0.1','[::1]'])assert.equal(validTurnstile(dummy,host,site,secret),true);
 for(const host of ['mpalaourg.dev','mpalaourg.me','localhost.attacker.test','192.168.1.5'])assert.equal(validTurnstile(dummy,host,site,secret),false);
 for(const value of [{...dummy,success:false},{success:true,hostname:'localhost',action:'site-chat'}])assert.equal(validTurnstile(value,'localhost',site,secret),false);
 assert.equal(validTurnstile(dummy,'localhost','real-site',secret),false);
 assert.equal(validTurnstile(dummy,'localhost',site,'real-secret'),false);
});
test('real widgets retain exact hostname and action validation even on localhost',()=>{
 for(const host of ['mpalaourg.dev','localhost']){
  assert.equal(validTurnstile({success:true,hostname:host,action:'site-chat'},host,'real-site','real-secret'),true);
  for(const value of [{success:false,hostname:host,action:'site-chat'},{success:true,hostname:'other.test',action:'site-chat'},{success:true,hostname:host,action:'test'},dummy])assert.equal(validTurnstile(value,host,'real-site','real-secret'),false);
 }
 assert.equal(validTurnstile({success:true,hostname:'mpalaourg.dev',action:'site-chat'},'mpalaourg.dev',site,secret),false);
});
