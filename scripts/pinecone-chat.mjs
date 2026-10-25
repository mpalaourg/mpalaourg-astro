import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const API_VERSION='2026-07';
class SetupError extends Error {}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function origin(host){
  const url=new URL(host.startsWith('https://')?host:`https://${host}`);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||
    !/^[a-z0-9-]+\.svc\.[a-z0-9.-]+\.pinecone\.io$/.test(url.hostname))throw new SetupError('Invalid Pinecone index host.');
  return url.origin;
}
async function api(url,key,method='GET',body){
  const res=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Api-Key':key,'Content-Type':'application/json','X-Pinecone-Api-Version':API_VERSION},...(body?{body:JSON.stringify(body)}:{})});
  if(!res.ok){await res.body?.cancel();throw new SetupError(`Pinecone returned HTTP ${res.status}. Credentials and provider bodies are not logged.`)}
  return res.json();
}
function validateIndex(index,expected){
  const fields=index?.schema?.fields;
  if(fields?.body?.type!=='string'||fields.body.embed?.model!=='multilingual-e5-large'||!fields.body.full_text_search||!fields.title?.full_text_search)
    throw new SetupError('Existing index does not have our multilingual embedding + BM25 document schema. Use a separate correctly configured index; nothing was deleted.');
  if(fields.body.embed.dimension!==expected.fields.body.embed.dimension)throw new SetupError('Existing index has incompatible embedding dimensions.');
  const subset=(actual,wanted)=>wanted&&typeof wanted==='object'
    ? actual&&typeof actual==='object'&&Object.entries(wanted).every(([key,value])=>subset(actual[key],value))
    : actual===wanted;
  if(!subset(index.schema,expected)||Object.keys(fields).sort().join(',')!==Object.keys(expected.fields).sort().join(','))throw new SetupError('Index schema drift detected. Apply stopped without changing existing resources.');
  return origin(index.host);
}

export async function main(command,env=process.env,environment='development'){
  if(!['development','production'].includes(environment))throw new SetupError('Choose --environment development or --environment production.');
  if(!['plan','apply','sync','check'].includes(command))throw new SetupError('Use plan, apply, sync or check.');
  const manifest=JSON.parse(await readFile('infra/pinecone/chat-index.json','utf8'));
  const {environments,...base}=manifest;
  if(!environments?.[environment]?.name||environments.development?.name===environments.production?.name)throw new SetupError('Development and production require distinct declared index names.');
  const spec={...base,name:environments[environment].name};
  const connectionPath=`.chat/pinecone-connection-${environment}.json`;
  console.log(`Pinecone target: ${environment} (${spec.name}).`);
  if(command==='plan'&&!env.PINECONE_API_KEY){
    console.log(`Desired index: ${spec.name}, ${spec.deployment.cloud}/${spec.deployment.region}, multilingual embeddings + BM25. Add PINECONE_API_KEY for a read-only remote drift check.`);
    return;
  }
  if(!env.PINECONE_API_KEY)throw new SetupError('Add PINECONE_API_KEY to your local .env first. Never paste it into chat.');
  const name=spec.name;
  if(!/^[a-z0-9][a-z0-9-]{0,44}$/.test(name))throw new SetupError('Invalid index name.');
  const control=`https://api.pinecone.io/indexes/${name}`;
  let index;
  if(command==='plan'||command==='apply'){
    // Idempotent: never replace/delete an existing index, namespace or database.
    const indexes=await api('https://api.pinecone.io/indexes',env.PINECONE_API_KEY);
    if(!Array.isArray(indexes.indexes))throw new SetupError('Invalid Pinecone index list response.');
    if(!indexes.indexes.some(row=>row.name===name)){
      if(command==='plan'){console.log(`Plan: create ${name} in ${spec.deployment.cloud}/${spec.deployment.region}. No resources changed.`);return}
      index=await api('https://api.pinecone.io/indexes',env.PINECONE_API_KEY,'POST',spec);
      console.log(`Created ${name} in AWS us-east-1. No paid-plan upgrade was requested.`);
    }
    else if(command==='plan'){
      index=await api(control,env.PINECONE_API_KEY);validateIndex(index,spec.schema);
      console.log(`Plan: ${name} matches the declared schema. No resources changed.`);return;
    }
  }
  for(let attempt=0;attempt<20;attempt++){
    index=await api(control,env.PINECONE_API_KEY);
    if(index.status?.ready)break;
    if(attempt===19)throw new SetupError('Index is still initializing. Run the command again once ready.');
    await pause(1000);
  }
  const host=validateIndex(index,spec.schema);
  // The manifest and control-plane response determine the IaC target. Local
  // runtime host overrides must not redirect a selected production operation.
  await mkdir('.chat',{recursive:true});
  await writeFile(connectionPath,JSON.stringify({environment,PINECONE_INDEX_HOST:new URL(host).hostname,index:name},null,2)+'\n');
  const corpus=command==='apply'?null:JSON.parse(await readFile('.chat/pinecone.json','utf8'));
  if(command==='sync'){
    // A namespace is an immutable public corpus version. Resume completed
    // batches; an ambiguous failed request is safe to repeat (IDs are stable).
    // Repeated upserts can consume embedding tokens, so there is no blind retry.
    const statePath='.chat/pinecone-upload-state.json';
    let saved={};try{saved=JSON.parse(await readFile(statePath,'utf8'))}catch(error){if(error.code!=='ENOENT')throw new SetupError('Upload checkpoint is unreadable. Inspect it before retrying.')}
    const scope=`${host}/${corpus.namespace}`;
    const done=new Set(saved[scope]||[]);
    const pending=corpus.records.filter(row=>!done.has(row._id));
    let tokens=0;
    for(let i=0;i<pending.length;i+=64){
      const documents=pending.slice(i,i+64);
      const result=await api(`${host}/namespaces/${corpus.namespace}/documents/upsert`,env.PINECONE_API_KEY,'POST',{documents});
      if(result.upserted_count!==documents.length)throw new SetupError('Unexpected upsert count. Upload stopped; completed batches are retained.');
      for(const row of documents)done.add(row._id);
      const batchTokens=Number(result.usage?.embed_total_tokens)||documents.reduce((n,row)=>n+Buffer.byteLength(row.body),0);
      tokens+=Number(result.usage?.embed_total_tokens)||0;
      saved[scope]=[...done];await writeFile(statePath,JSON.stringify(saved)+'\n');
      console.log(`Uploaded ${done.size}/${corpus.records.length} passages; embedding tokens this run: ${tokens}.`);
      // Stay below Starter passage-token throughput, even on a very fast link.
      if(i+64<pending.length)await pause(Math.max(1000,Math.ceil(batchTokens*60000/200000)));
    }
    console.log('Sync complete. Allow about one minute for indexing. Existing namespaces and history were not deleted.');
  }
  if(command==='check'){
    // A fixed ingestion check, not a visitor query or a reranking call.
    const result=await api(`${host}/namespaces/${corpus.namespace}/documents/search`,env.PINECONE_API_KEY,'POST',{
      top_k:1,score_by:[{type:'text',fields:['body'],query:'Georgios'}],include_fields:[],
    });
    if(!Array.isArray(result.matches)||!result.matches.length)throw new SetupError('The current corpus namespace is not searchable yet. Finish sync and allow indexing to complete.');
    console.log('Current Pinecone corpus is searchable.');
  }
  console.log(`Public connection settings saved to ${connectionPath}. The API key was not written or printed.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const flags=process.argv.slice(3);
  const environment=flags.length===0?'development':flags.length===2&&flags[0]==='--environment'?flags[1]:'invalid';
  main(process.argv[2],process.env,environment).catch(error=>{console.error(error instanceof SetupError?error.message:'Pinecone setup failed. No credentials or provider response bodies were logged.');process.exitCode=1});
}
