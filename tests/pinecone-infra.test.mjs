import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../scripts/pinecone-chat.mjs';
const manifest=JSON.parse(await readFile('infra/pinecone/chat-index.json','utf8'));
const {environments,...base}=manifest;
const spec={...base,name:environments.development.name};
const cwd=process.cwd(),nativeFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=nativeFetch;process.chdir(cwd)});
const env={PINECONE_API_KEY:'test-project-key'};
const host='fixture-index.svc.us-east-1.pinecone.io';
async function workspace(){
 const root=await mkdtemp(join(tmpdir(),'pinecone-iac-'));
 await mkdir(join(root,'infra/pinecone'),{recursive:true});await mkdir(join(root,'.chat'));
 await writeFile(join(root,'infra/pinecone/chat-index.json'),JSON.stringify(manifest));
 process.chdir(root);return root;
}
const described=()=>({host,status:{ready:true},schema:structuredClone(spec.schema)});
test('IaC plan is read-only; apply creates once and subsequent applies preserve the index',async()=>{
 const root=await workspace();let exists=false;const requests=[];try{
  globalThis.fetch=async(url,init)=>{
   requests.push({url,method:init.method,body:init.body&&JSON.parse(init.body)});
   if(url==='https://api.pinecone.io/indexes'&&init.method==='GET')return Response.json({indexes:exists?[{name:spec.name}]:[]});
   if(init.method==='POST'){exists=true;assert.deepEqual(JSON.parse(init.body),spec);return Response.json(described())}
   return Response.json(described());
  };
  await main('plan',env);assert.equal(exists,false);assert.ok(requests.every(row=>row.method==='GET'));
  await main('apply',env);await main('apply',env);
  assert.equal(requests.filter(row=>row.method==='POST').length,1);
  assert.ok(requests.every(row=>row.method!=='DELETE'));
  const output=await readFile('.chat/pinecone-connection-development.json','utf8');assert.match(output,/PINECONE_INDEX_HOST/);assert.ok(!output.includes(env.PINECONE_API_KEY));
 }finally{process.chdir(cwd);await rm(root,{recursive:true,force:true})}
});
test('IaC refuses incompatible existing schemas without replacing or deleting them',async()=>{
 const root=await workspace();const methods=[];try{
  globalThis.fetch=async(url,init)=>{
   methods.push(init.method);
   if(url.endsWith('/indexes'))return Response.json({indexes:[{name:spec.name}]});
   const index=described();index.schema.fields.body.embed.model='wrong-model';return Response.json(index);
  };
  await assert.rejects(main('apply',env),/does not have our multilingual/);
  assert.ok(methods.every(method=>method==='GET'));
 }finally{process.chdir(cwd);await rm(root,{recursive:true,force:true})}
});
test('sync checkpoints successful batches and a rerun makes no duplicate upserts',async()=>{
 const root=await workspace();let writes=0;try{
  await writeFile('.chat/pinecone.json',JSON.stringify({namespace:'site-fixture',records:[{_id:'one',body:'Public reviewed content'},{_id:'two',body:'More public content'}]}));
  globalThis.fetch=async(url,init)=>{
   if(init.method==='GET')return Response.json(described());
   writes++;assert.match(url,/\/namespaces\/site-fixture\/documents\/upsert$/);
   return Response.json({upserted_count:JSON.parse(init.body).documents.length,usage:{embed_total_tokens:10}});
  };
  await main('sync',env);await main('sync',env);assert.equal(writes,1);
  assert.ok(!(await readFile('.chat/pinecone-upload-state.json','utf8')).includes(env.PINECONE_API_KEY));
 }finally{process.chdir(cwd);await rm(root,{recursive:true,force:true})}
});

test('default IaC target is development; production requires explicit selection and separate outputs',async()=>{
 const root=await workspace();const controls=[];try{
  globalThis.fetch=async(url,init)=>{
   controls.push(url);return url.endsWith('/indexes')?Response.json({indexes:[{name:environments.development.name},{name:environments.production.name}]}):Response.json(described());
  };
  await main('apply',env);
  assert.ok(controls.some(url=>url.endsWith('/'+environments.development.name)));
  assert.ok(!controls.some(url=>url.endsWith('/'+environments.production.name)));
  controls.length=0;
  // A local runtime host must not redirect the explicitly selected IaC target.
  await main('apply',{...env,PINECONE_INDEX_HOST:'unrelated-runtime.svc.example.pinecone.io'},'production');
  assert.ok(controls.some(url=>url.endsWith('/'+environments.production.name)));
  const dev=JSON.parse(await readFile('.chat/pinecone-connection-development.json'));
  const prod=JSON.parse(await readFile('.chat/pinecone-connection-production.json'));
  assert.equal(dev.environment,'development');assert.equal(prod.environment,'production');
  assert.notEqual(dev.index,prod.index);
  await assert.rejects(main('sync',env,'invalid'),/Choose --environment/);
 }finally{process.chdir(cwd);await rm(root,{recursive:true,force:true})}
});
test('IaC rejects shared environment names before any provider call',async()=>{
 const root=await workspace();try{
  const invalid=structuredClone(manifest);invalid.environments.development.name=invalid.environments.production.name;
  await writeFile('infra/pinecone/chat-index.json',JSON.stringify(invalid));
  globalThis.fetch=()=>{throw Error('Provider must not be called')};
  await assert.rejects(main('apply',env),/distinct declared index names/);
 }finally{process.chdir(cwd);await rm(root,{recursive:true,force:true})}
});
