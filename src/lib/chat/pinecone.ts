import {traceStep,type TracingEnv} from './tracing';
import {sourceMetadata,metadataContext} from './metadata';
import type {Source} from './policy';
import {isIndexedSource} from './sources';

export interface PineconeEnv extends TracingEnv {
  PINECONE_API_KEY?:string;
  PINECONE_INDEX_HOST?:string;
  PINECONE_ENABLED?:string;
  PINECONE_RERANK_ENABLED?:string;
  PINECONE_TOP_K?:string;
  PINECONE_RERANK_CANDIDATES?:string;
  CHAT_CONTEXT_TOP_K?:string;
}
export const PINECONE_VERSION='2026-07';
export const FREE_RERANK_REQUESTS=500;
type Hit={_id:string;_score:number};
type RetrievalResult={ok:true;sources:Source[]}|{ok:false};

// Invalid configuration uses safe defaults rather than making retrieval unavailable.
export function retrievalSettings(env?:PineconeEnv){
  const integer=(value:string|undefined,fallback:number,min:number,max:number)=>{
    if(!value || !/^\d+$/.test(value))return fallback;
    const n=Number(value);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:fallback;
  };
  return {topK:integer(env?.PINECONE_TOP_K,40,1,100),
    candidates:integer(env?.PINECONE_RERANK_CANDIDATES,24,1,100),
    contextTopK:integer(env?.CHAT_CONTEXT_TOP_K,8,1,24)};
}

export function pineconeQuery(question:string,queries:string[]):string {
  const text=[question,...queries.slice(0,4)].join('\n');
  const encoder=new TextEncoder();let bytes=0,result='';
  for(const point of text){const n=encoder.encode(point).length;if(bytes+n>440)break;bytes+=n;result+=point}
  return result.trim();
}

export function pineconeOrigin(host:string):string {
  const url=new URL(host.startsWith('https://')?host:`https://${host}`);
  if(url.protocol!=='https:' || url.username || url.password || url.port || url.pathname!=='/' || url.search || url.hash ||
     !/^[a-z0-9-]+\.svc\.[a-z0-9.-]+\.pinecone\.io$/.test(url.hostname))throw new Error('invalid_configuration');
  return url.origin;
}

// Equal branch weights; repeated child passages cannot vote repeatedly for the
// same reviewed parent within a ranked list. RRF is local and always free.
export function reciprocalRankFusion(lists:Hit[][],observe?:(hits:{id:string;score:number;rank:number}[])=>void):string[] {
  const scores=new Map<string,number>();
  for(const list of lists){
    const seen=new Set<string>();
    for(const [i,hit] of list.entries()){
      const parent=hit._id.slice(0,64);
      if(seen.has(parent))continue;seen.add(parent);
      scores.set(parent,(scores.get(parent)||0)+1/(60+i+1));
    }
  }
  const ranked=[...scores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  observe?.(ranked.map(([id,score],i)=>({id,score,rank:i+1})));return ranked.map(([id])=>id);
}

export async function reserveRerank(db:D1Database,now=new Date()):Promise<boolean>{
  const row=await db.prepare(`INSERT INTO chat_pinecone_usage(month,reranks) VALUES (?,1)
    ON CONFLICT(month) DO UPDATE SET reranks=reranks+1 WHERE reranks<500 AND blocked=0
    RETURNING reranks`).bind(now.toISOString().slice(0,7)).first();
  return !!row;
}

class PineconeFailure extends Error {
  constructor(readonly reason:string){super(reason)}
}
async function requestJSON(url:string,key:string,body:unknown,signal:AbortSignal):Promise<any>{
  const response=await fetch(url,{method:'POST',redirect:'error',signal,
    headers:{'Api-Key':key,'Content-Type':'application/json','X-Pinecone-Api-Version':PINECONE_VERSION},body:JSON.stringify(body)});
  if(!response.ok){await response.body?.cancel();throw new PineconeFailure(`http_${response.status}`)}
  const reader=response.body?.getReader();if(!reader)throw new PineconeFailure('invalid_response');
  let size=0;const parts:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256000){await reader.cancel();throw new PineconeFailure('invalid_response')}parts.push(value)}
  const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length}
  const data=JSON.parse(new TextDecoder().decode(bytes));
  if(data?.error)throw new PineconeFailure('invalid_response');
  return data;
}

function rankedHits(data:any,limit:number):Hit[]{
  if(!Array.isArray(data?.matches)||data.matches.length>limit)throw new PineconeFailure('invalid_response');
  return data.matches.map((hit:any)=>{
    if(typeof hit?._id!=='string'||!/^([a-f0-9]{64})-\d{4}$/.test(hit._id)||typeof hit._score!=='number'||!Number.isFinite(hit._score))throw new PineconeFailure('invalid_response');
    return {_id:hit._id,_score:hit._score};
  });
}

async function rerank(db:D1Database,env:PineconeEnv,query:string,sources:Source[],deadline:number):Promise<Source[]>{
  const span=traceStep(env,'Reranking · optional model','retriever',{rerank:true});
  if(env.PINECONE_RERANK_ENABLED==='false'||sources.length<2||Date.now()+500>=deadline){span?.output({status:'skipped',reason:env.PINECONE_RERANK_ENABLED==='false'?'disabled_for_environment':sources.length<2?'too_few_candidates':'deadline_near'});span?.end({rerank:false});return sources;}
  const month=new Date().toISOString().slice(0,7);
  span?.input({model:'bge-reranker-v2-m3',query,source_urls:sources.map(source=>source.url),candidates:sources.length});
  try{
    if(!await reserveRerank(db)){span?.output({status:'skipped',reason:'free_allowance_unavailable'});span?.end({rerank:false,kind:'free_allowance_unavailable'});return sources;}
    const data=await requestJSON('https://api.pinecone.io/rerank',env.PINECONE_API_KEY!,{
      model:'bge-reranker-v2-m3',query,top_n:sources.length,return_documents:false,
      documents:sources.map((source,i)=>({id:String(i),text:`${source.title}\n${metadataContext(source)}\n${source.body}`})),
      parameters:{truncate:'END'},
    },AbortSignal.timeout(Math.max(1,Math.min(4000,deadline-Date.now()))));
    if(!Array.isArray(data?.data)||data.data.length!==sources.length)throw new PineconeFailure('invalid_response');
    const indices=data.data.map((row:any)=>row.index);
    if(new Set(indices).size!==sources.length || indices.some((i:unknown)=>!Number.isInteger(i)||Number(i)<0||Number(i)>=sources.length) ||
       data.data.some((row:any)=>typeof row.score!=='number'||!Number.isFinite(row.score)))throw new PineconeFailure('invalid_response');
    span?.output({hits:data.data.map((row:{index:number;score:number},rank:number)=>({url:sources[row.index].url,score:row.score,rank:rank+1}))});
    span?.end({rerank:true,source_count:sources.length});
    return indices.map((i:number)=>sources[i]);
  }catch(error){
    // Any 429 conservatively disables reranking for this UTC month. Do not
    // refund: failed/aborted requests might have been billed by the provider.
    if(error instanceof PineconeFailure&&error.reason==='http_429'){
      try{await db.prepare('UPDATE chat_pinecone_usage SET blocked=1 WHERE month=?').bind(month).run()}catch{/* keep the search results */}
    }
    span?.end({rerank:false},'rerank_skipped',undefined,error);
    console.warn('chat_pinecone_rerank_skipped');
    return sources;
  }
}

export async function retrievePineconeSources(db:D1Database,env:PineconeEnv|undefined,query:string,selected:string[],deadline=Date.now()+12000):Promise<RetrievalResult>{
  // Missing setup is an unavailable provider, so the existing site keeps working.
  if(env?.PINECONE_ENABLED==='false'||!env?.PINECONE_API_KEY||!env.PINECONE_INDEX_HOST){const skip=traceStep(env,'Pinecone · unavailable','retriever');skip?.output({status:'skipped',backend:'pinecone',reason:env?.PINECONE_ENABLED==='false'?'disabled':'not_configured'});skip?.end();return {ok:false};}
  const settings=retrievalSettings(env);
  const span=traceStep(env,'pinecone-hybrid-search','retriever',{backend:'pinecone',top_k:settings.topK,candidates:settings.candidates,context_top_k:settings.contextTopK});
  try{
    const origin=pineconeOrigin(env.PINECONE_INDEX_HOST);
    const meta=await db.prepare('SELECT version FROM chat_index_meta WHERE id=1').first<{version:string}>();
    if(!meta||!/^[a-f0-9]{64}$/.test(meta.version))throw new PineconeFailure('index_not_ready');
    const namespace=`site-${meta.version.slice(0,24)}`;
    const endpoint=`${origin}/namespaces/${namespace}/documents/search`;
    const signal=AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())));
    const common={top_k:settings.topK,include_fields:[],...(selected.length?{filter:{source_url:{$in:selected}}}:{})};
    // Plain text scoring, never Lucene/query_string interpolation. Metadata
    // filters are server-selected URLs, with a second local scope check below.
    span?.input({query,selected_source_urls:selected,top_k:settings.topK});
    const denseSpan=span?.start('Semantic · dense retrieval','retriever'),keywordSpan=span?.start('BM25 · keyword retrieval','retriever');
    denseSpan?.input({query,top_k:settings.topK,selected_source_urls:selected});keywordSpan?.input({query,top_k:settings.topK,selected_source_urls:selected});
    const branch=async(child:typeof denseSpan,scoreBy:unknown)=>{try{const hits=rankedHits(await requestJSON(endpoint,env.PINECONE_API_KEY!,{...common,score_by:[scoreBy]},signal),settings.topK);child?.output({hits:hits.map((hit,i)=>({id:hit._id,score:hit._score,rank:i+1})),total_hits:hits.length,displayed_hits:Math.min(24,hits.length),truncated:hits.length>24});child?.end({source_count:hits.length});return hits}catch(error){child?.end({failure:error instanceof PineconeFailure?error.reason:'network_or_timeout'},'search_branch_failed',undefined,error);throw error}};
    const [dense,keyword]=await Promise.all([
      branch(denseSpan,{type:'embed',fields:['body'],query}),
      branch(keywordSpan,{type:'text',fields:['title','body'],query}),
    ]);
    const fusion=span?.start('RRF · rank fusion','tool',{rrf_k:60});
    fusion?.input({rrf_k:60,candidates:settings.candidates});
    const ids=reciprocalRankFusion([dense,keyword],hits=>fusion?.output({hits:hits.slice(0,settings.candidates)})).slice(0,settings.candidates);
    fusion?.end({source_count:ids.length});
    const sources:Source[]=[];
    for(const id of ids){
      const row=await db.prepare('SELECT k.title,k.url,k.body,m.metadata FROM chat_pinecone_chunks p JOIN chat_knowledge k ON k.rowid=p.knowledge_rowid LEFT JOIN chat_pinecone_metadata m ON m.id=p.id WHERE p.id=?').bind(id).first<Omit<Source,'metadata'>&{metadata?:string}>();
      if(!row||!isIndexedSource(row.url)||selected.length&&!selected.includes(row.url))throw new PineconeFailure('index_mismatch');
      const metadata=sourceMetadata(row.metadata);
      sources.push({title:row.title,url:row.url,body:row.body,...(metadata?{metadata}:{})});
    }
    // Empty successful searches remain empty. No D1 keyword search here.
    const result=await rerank(db,{...env,CHAT_TRACE_PARENT:span},query,sources,deadline);
    span?.output({sources:result.map(source=>({title:source.title,url:source.url})),source_count:result.length});span?.end({dense_hits:dense.length,keyword_hits:keyword.length,source_count:result.length});
    return {ok:true,sources:result};
  }catch(error){
    span?.end({failure:error instanceof PineconeFailure?error.reason:'unavailable'},'pinecone_unavailable',undefined,error);
    console.warn('chat_pinecone_fallback',{reason:error instanceof PineconeFailure?error.reason:'unavailable'});
    return {ok:false};
  }
}
