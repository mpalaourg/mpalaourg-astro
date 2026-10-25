import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {configurePineconeHost} from '../scripts/lib/chat-environments.mjs';
import {publicChatSettings} from '../scripts/configure-chat-pages.mjs';
const result=await build({entryPoints:['src/lib/chat/environment.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {chatEnvironment}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
test('only explicit production selects production resources',()=>{
 assert.equal(chatEnvironment({CHAT_ENVIRONMENT:'production'}),'production');
 for(const value of [undefined,'','development','preview','Production','production ','invalid'])assert.equal(chatEnvironment({CHAT_ENVIRONMENT:value}),'development');
 assert.equal(chatEnvironment(),'development');
});
test('Wrangler explicitly separates local, preview and production environment settings',async()=>{
 const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
 assert.equal(config.vars.CHAT_ENVIRONMENT,'development');
 assert.equal(config.env.preview.vars.CHAT_ENVIRONMENT,'development');
 assert.equal(config.env.production.vars.CHAT_ENVIRONMENT,'production');
 for(const target of [config.vars,config.env.preview.vars,config.env.production.vars]){
  assert.equal(target.LANGSMITH_PROJECT,`mpalaourg-chat-${target.CHAT_ENVIRONMENT}`);
  assert.equal(Object.keys(target).filter(key=>key.startsWith('LANGSMITH_PROJECT')).length,1);
  assert.ok(target.PINECONE_INDEX_HOST);
  assert.equal(Object.keys(target).filter(key=>key.startsWith('PINECONE_INDEX_HOST')).length,1);
  assert.equal(Object.keys(target).filter(key=>key.startsWith('LANGSMITH_SAMPLE_RATE')).length,1);
  assert.equal(target.LANGSMITH_SAMPLE_RATE,'1');
  assert.equal(target.PINECONE_RERANK_ENABLED,target.CHAT_ENVIRONMENT==='production'?'true':'false');
 }
 assert.notEqual(config.vars.PINECONE_INDEX_HOST,config.env.production.vars.PINECONE_INDEX_HOST);
 assert.equal(config.vars.PINECONE_INDEX_HOST,config.env.preview.vars.PINECONE_INDEX_HOST);
 assert.equal(config.env.preview.vars.CHAT_ENABLED,'false');
 // Production keeps its binding; a preview cannot inherit production histories.
 assert.deepEqual(config.env.production.d1_databases,config.d1_databases);
 assert.deepEqual(config.env.preview.d1_databases,[]);
});

test('configuring a Pinecone environment changes only its own deployments',async()=>{
 const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
 const devHost='new-development.svc.example.pinecone.io';
 const dev=configurePineconeHost(config,'development',devHost);
 assert.equal(dev.vars.PINECONE_INDEX_HOST,devHost);
 assert.equal(dev.env.preview.vars.PINECONE_INDEX_HOST,devHost);
 assert.deepEqual(dev.env.production,config.env.production);
 assert.notEqual(config.vars.PINECONE_INDEX_HOST,devHost);
 const prod=configurePineconeHost(config,'production','new-production.svc.example.pinecone.io');
 assert.deepEqual(prod.vars,config.vars);assert.deepEqual(prod.env.preview,config.env.preview);
 assert.equal(prod.env.production.vars.PINECONE_INDEX_HOST,'new-production.svc.example.pinecone.io');
 assert.throws(()=>configurePineconeHost(config,'development',config.env.production.vars.PINECONE_INDEX_HOST),/different index hosts/);
 assert.throws(()=>configurePineconeHost(config,'production',config.vars.PINECONE_INDEX_HOST),/different index hosts/);
 assert.throws(()=>configurePineconeHost(config,'invalid',devHost),/Invalid chat environment/);
 assert.throws(()=>configurePineconeHost(config,'development','evil.example'),/Invalid Pinecone host/);
});
test('remote D1 maintenance explicitly selects production; local commands stay local',async()=>{
 const {scripts}=JSON.parse(await readFile('package.json','utf8'));
 for(const name of ['chat:index:remote','db:migrate:production']){
  assert.match(scripts[name],/--remote/);assert.match(scripts[name],/--env production/);
 }
 for(const name of ['chat:index:local','db:migrate:local','db:query']){
  assert.match(scripts[name],/--local/);assert.doesNotMatch(scripts[name],/--remote/);
 }
});
test('Pages configuration accepts public settings and blocks credential values before authentication',()=>{
 const vars={CHAT_ENVIRONMENT:'production',CHAT_ENABLED:'true',PINECONE_INDEX_HOST:'example.svc.example.pinecone.io'};
 assert.equal(publicChatSettings(vars).CHAT_ENVIRONMENT.value,'production');
 for(const name of ['OPENROUTER_API_KEY','PINECONE_API_KEY','LANGSMITH_API_KEY','CHAT_IP_SECRET','CHAT_OWNER_BACKGROUND_B64','CHAT_AUTH_TOKEN']){
  assert.throws(()=>publicChatSettings({...vars,[name]:'fixture-private-value'}),/Only public chatbot settings/);
 }
 assert.throws(()=>publicChatSettings({CHAT_ENABLED:'true'}),/Declare CHAT_ENVIRONMENT/);
 assert.throws(()=>publicChatSettings({...vars,CHAT_ENABLED:true}),/Only public chatbot settings/);
});
