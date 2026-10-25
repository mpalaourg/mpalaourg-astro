import {chatEnvironment,type ChatEnvironmentEnv} from './environment';
import type {Client} from 'langsmith';
import type {RunCreate} from 'langsmith/schemas';
export interface TracingEnv extends ChatEnvironmentEnv{
  LANGSMITH_API_KEY?:string;LANGSMITH_ENDPOINT?:string;LANGSMITH_WORKSPACE_ID?:string;
  LANGSMITH_TRACING?:string;LANGSMITH_CAPTURE_CONTENT?:string;
  LANGSMITH_PROJECT?:string;
  LANGSMITH_SAMPLE_RATE?:string;
  CHAT_TRACE?:ChatTrace;CHAT_TRACE_PARENT?:ChatSpan;
}
type Fields=Record<string,unknown>;
type Context={threadId:string;requestId:string;question:string;language:'en'|'el';persona:string;hostname:string;synthetic?:boolean};
const endpoints=['https://api.smith.langchain.com','https://eu.api.smith.langchain.com','https://apac.api.smith.langchain.com','https://aws.api.smith.langchain.com'];
const fieldNames=new Set(['cache_hit','model','requested_model','http_status','failure','kind','source_urls','source_count','backend','rerank','top_k','candidates','context_top_k','dense_hits','keyword_hits','probability','confident','elapsed_ms','first_token_ms','title_generated','stage','answer_saved','reported_cost','ls_provider','ls_model_name','answer_latency_ms','background_completed_ms','first_turn','history_turns','remaining_turns','attachment_count','eligible','reason','delay_ms','chunks','characters','duration_ms','error_type','validation','response_characters','migration','rank','score','rrf_k']);
export function tracingConfig(env:TracingEnv){
  const environment=chatEnvironment(env),production=environment==='production';
  const endpoint=(env.LANGSMITH_ENDPOINT||endpoints[0]).replace(/\/$/,'');
  const project=env.LANGSMITH_PROJECT||`mpalaourg-chat-${environment}`;
  const raw=env.LANGSMITH_SAMPLE_RATE;
  const rate=raw===undefined?1:Number(raw);
  if(env.LANGSMITH_TRACING!=='true'||!env.LANGSMITH_API_KEY||!endpoints.includes(endpoint)||!/^[-a-zA-Z0-9_]{1,100}$/.test(project)||!Number.isFinite(rate)||rate<0||rate>1)return null;
  return {production,environment,endpoint,project,rate,capture:env.LANGSMITH_CAPTURE_CONTENT==='true'};
}
// Text is opt-in. Never export provider envelopes, history, document bodies,
// system instructions, owner background, headers, cookies or visitor keys.
export function redactTraceText(text:string,secrets:string[]=[]){
  let value=text.slice(0,4000);
  for(const secret of secrets)if(secret.length>=8)value=value.split(secret).join('[redacted]');
  return value.replace(/\b(?:sk-(?:or-v1-)?|lsv2_|ls__)[a-zA-Z0-9_-]{12,}\b/g,'[redacted]')
    .replace(/\bBearer\s+\S+/gi,'Bearer [redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
    .replace(/\b(?:api[_ -]?key|password|secret)\s*[:=]\s*[^\s,;]+/gi,'[redacted]');
}
// Exception messages can contain model output, SQL or visitor text. Rebuild the
// traceback from a caller-selected failure label and bounded stack frames only.
function errorTraceback(cause:unknown,label:string,secrets:string[]):string{
  const failure=redactTraceText(label,secrets).slice(0,120);
  if(cause===undefined)return failure;
  return attempt(()=>{
    const sections:string[]=[],seen=new Set<unknown>();let current:unknown=cause;
    for(let depth=0;depth<3&&current&&typeof current==='object'&&!seen.has(current);depth++){
      seen.add(current);
      const error=current as {name?:unknown;message?:unknown;stack?:unknown;cause?:unknown;code?:unknown};
      const name=typeof error.name==='string'&&/^(?:[A-Za-z]+Error|Error|DOMException)$/.test(error.name)?error.name:'Error';
      const code=typeof error.code==='string'&&/^[A-Z][A-Z0-9_]{1,39}$/.test(error.code)?` (${error.code})`:'';
      sections.push(`${depth?'Caused by: ':''}${name}: ${failure}${code}`);
      let stack=typeof error.stack==='string'?error.stack:'';
      const header=`${typeof error.name==='string'?error.name:'Error'}: ${typeof error.message==='string'?error.message:''}`;
      if(stack.startsWith(header))stack=stack.slice(header.length);
      let count=0;
      for(const line of stack.slice(0,32000).split('\n')){
        const frame=line.match(/^\s*at\s+(?:(.*?)\s+\()?([^()\n]+):(\d{1,7}):(\d{1,7})\)?\s*$/);
        if(!frame)continue;
        const fn=frame[1]&&/^[A-Za-z0-9_$.<> [\]]{1,100}$/.test(frame[1])?frame[1]:'';
        let location=frame[2].replace(/^(?:async\s+|file:\/\/)/,'').split(/[?#]/,1)[0].replaceAll('\\','/');
        if(location.startsWith('data:'))location='[bundled module]';
        else if(/^node:[a-zA-Z0-9_./-]+$/.test(location)){} // Node runtime frames.
        else{
          const local=location.match(/(?:^|\/)((?:src|node_modules|\.astro|\.chat)\/[a-zA-Z0-9_@./-]+)$/);
          location=local?.[1]||location.split('/').pop()||'';
          if(!/^[a-zA-Z0-9_@./-]+\.(?:[cm]?js|tsx?|astro)$/.test(location))location='[runtime]';
        }
        sections.push(`    at ${fn?fn+' (':''}${location}:${frame[3]}:${frame[4]}${fn?')':''}`);
        if(++count>=12)break;
      }
      current=error.cause;
    }
    return redactTraceText(sections.join('\n')||failure,secrets);
  },failure);
}
function fields(input:Fields,secrets:string[]):Fields{
  return Object.fromEntries(Object.entries(input).filter(([key])=>fieldNames.has(key)).flatMap<[string,unknown]>(([key,value])=>{
    if(typeof value==='number')return Number.isFinite(value)?[[key,value]]:[];
    if(typeof value==='boolean')return [[key,value]];
    if(key==='source_urls'&&Array.isArray(value))return [[key,value.filter((v):v is string=>typeof v==='string'&&v.startsWith('/')&&!v.startsWith('//')&&!v.includes('?')).slice(0,24).map(v=>redactTraceText(v,secrets))]];
    return typeof value==='string'?[[key,redactTraceText(value,secrets).slice(0,180)]]:[];
  }));
}
export function traceUsage(raw:unknown){
  const usage=raw as Record<string,unknown>|undefined;if(!usage||typeof usage!=='object')return {};
  const output:Record<string,number>={};for(const [from,to]of [['prompt_tokens','input_tokens'],['completion_tokens','output_tokens'],['total_tokens','total_tokens'],['cost','total_cost']]){
    const n=usage[from];if(typeof n==='number'&&Number.isFinite(n)&&n>=0)output[to]=n;
  }return output;
}
function order(at:number,id:string){return new Date(at).toISOString().replace(/[-:.]/g,'').replace('Z','000Z')+id}
const ioKeys=new Set(['messages','role','content','question','language','persona','stage','history_turns','remaining_turns','attachment_count','eligible','reason','hit','cache_key','model','sources','source_urls','source_count','title','url','page','slide','source_type','query','queries','selected_source_urls','citation_papers','route','probabilities','confident','factual','courtesy','clarification','refusal','uncertain','requested_model','status','http_status','failure','kind','saved','delay_ms','chunks','characters','duration_ms','error_type','validation','response_characters','hits','total_hits','displayed_hits','truncated','id','score','rank','candidates','top_k','rrf_k','rerank','backend','input_tokens','output_tokens','total_tokens','total_cost','usage_metadata']);
const contentKeys=new Set(['messages','content','question','title','queries']);
function safeIO(input:Fields,secrets:string[],capture:boolean,depth=0):Fields{
  if(depth>5)return {};
  const clean:Fields={};for(const[key,value]of Object.entries(input)){
    if(!ioKeys.has(key)||!capture&&contentKeys.has(key))continue;
    if(typeof value==='string')clean[key]=redactTraceText(value,secrets);
    else if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||value===null)clean[key]=value;
    else if(Array.isArray(value))clean[key]=value.slice(0,24).map(v=>typeof v==='string'?redactTraceText(v,secrets):typeof v==='number'&&Number.isFinite(v)?v:v&&typeof v==='object'?safeIO(v,secrets,capture,depth+1):null);
    else if(value&&typeof value==='object')clean[key]=safeIO(value as Fields,secrets,capture,depth+1);
  }return clean;
}
export interface ChatSpan{
  input(data:Fields):void;output(data:Fields):void;token():void;
  end(data?:Fields,error?:string,usage?:unknown,cause?:unknown):void;
  start(name:string,type?:'chain'|'llm'|'retriever'|'tool',metadata?:Fields):ChatSpan;
}
// Instrumentation is deliberately lossy: a malformed field or broken runtime
// must never become an application error, including inside nested span handles.
function attempt<T>(work:()=>T,fallback:T):T{try{return work()}catch{return fallback}}
const noopSpan:ChatSpan={input(){},output(){},token(){},end(){},start(){return noopSpan}};
function protectedSpan(span:ChatSpan):ChatSpan{return {
  input:data=>{attempt(()=>span.input(data),undefined)},
  output:data=>{attempt(()=>span.output(data),undefined)},
  token:()=>{attempt(()=>span.token(),undefined)},
  end:(...args)=>{attempt(()=>span.end(...args),undefined)},
  start:(...args)=>attempt(()=>span.start(...args),noopSpan),
}}
// Cloudflare keeps telemetry alive after the response. Other runtimes may drop
// it at shutdown; delivering the answer always takes priority over exporting.
export function scheduleTrace(work:()=>Promise<unknown>,context?:{waitUntil(task:Promise<unknown>):void}):void{
  const task=Promise.resolve().then(work).catch(()=>undefined);
  attempt(()=>context?.waitUntil(task),undefined);
}
type Exporter=Pick<Client,'batchIngestRuns'>;
export class ChatTrace{
  private runs:RunCreate[]=[];private finished=false;private firstText=false;private secrets:string[];
  private root:RunCreate;private config:NonNullable<ReturnType<typeof tracingConfig>>;
  private unavailable=false;private published=new Set<string>();private queue:Promise<boolean>=Promise.resolve(true);private client?:Promise<Exporter>;
  constructor(private env:TracingEnv,context:Context,config:NonNullable<ReturnType<typeof tracingConfig>>){
    this.config=config;this.secrets=Object.entries(env).filter(([key,value])=>/KEY|SECRET|BACKGROUND/.test(key)&&typeof value==='string').map(([,v])=>v as string);
    const start=Date.now(),id=context.requestId;
    this.root={id,trace_id:id,name:context.question?'Chat answer':'Chat API diagnostic',run_type:'chain',start_time:start,dotted_order:order(start,id),session_name:config.project,
      inputs:config.capture&&context.question?{messages:[{role:'user',content:redactTraceText(context.question,this.secrets)}]}:{},
      extra:{metadata:{thread_id:context.threadId,message_id:id,environment:config.environment,language:context.language,persona:context.persona,...(context.synthetic?{synthetic:true}:{})}},tags:[config.environment,context.language,context.persona,...(context.synthetic?['setup-check']:[])]};
    this.runs.push(this.root);
  }
  annotate(data:Fields){return attempt(()=>{Object.assign(this.root.extra!.metadata,fields(data,this.secrets));if(data.cache_hit===true){this.root.name='Chat answer · cached';if(!this.root.tags!.includes('cache-hit'))this.root.tags!.push('cache-hit')}},undefined);}
  start(name:string,type:'chain'|'llm'|'retriever'|'tool'='chain',metadata:Fields={}):ChatSpan{return this.span(this.root,name,type,metadata)}
  private span(parent:RunCreate,name:string,type:'chain'|'llm'|'retriever'|'tool',metadata:Fields):ChatSpan{return attempt(()=>{
    const at=Date.now(),id=crypto.randomUUID();
    const run:RunCreate={id,trace_id:this.root.id,parent_run_id:parent.id,name,run_type:type,start_time:at,dotted_order:parent.dotted_order+'.'+order(at,id),session_name:this.config.project,inputs:{},extra:{metadata:{thread_id:this.root.extra!.metadata.thread_id,message_id:this.root.id,environment:this.config.environment,...fields(metadata,this.secrets)}}};
    if(this.runs.length<60)this.runs.push(run);
    let ended=false,token=false;
    return protectedSpan({input:data=>{run.inputs=safeIO(data,this.secrets,this.config.capture)},output:data=>{run.outputs=safeIO(data,this.secrets,this.config.capture)},
      start:(childName,childType='chain',childMetadata={})=>this.span(run,childName,childType,childMetadata),
      token:()=>{if(!token){token=true;run.events=[{name:'new_token',time:new Date().toISOString()}]}},end:(data={},error,usage,cause)=>{
        if(ended)return;ended=true;run.end_time=Date.now();Object.assign(run.extra!.metadata,fields(data,this.secrets),{elapsed_ms:Date.now()-at});
        const counts=traceUsage(usage);
        if(type==='llm'&&Object.keys(counts).length){
          if(Array.isArray(run.outputs?.messages)&&run.outputs.messages.length)run.outputs.messages[run.outputs.messages.length-1].usage_metadata=counts;
          else run.outputs={...run.outputs,usage_metadata:counts};
        }
        if(!run.outputs)run.outputs=fields(data,this.secrets);
        if(error){run.error=errorTraceback(cause,error,this.secrets);run.outputs={...run.outputs,status:'failed',failure:redactTraceText(error,this.secrets).slice(0,120)};}
      }});
  },noopSpan);}
  firstAnswer(){return attempt(()=>{if(!this.firstText){this.firstText=true;this.root.extra!.metadata.first_token_ms=Date.now()-Number(this.root.start_time)}},undefined);}
  result(result:{answer:string;model:string|null;sources:{url:string;title?:string}[]}){return attempt(()=>{
    this.root.end_time=Date.now();
    this.root.outputs={cache_hit:this.root.extra!.metadata.cache_hit===true,answer_latency_ms:Date.now()-Number(this.root.start_time),first_token_ms:this.root.extra!.metadata.first_token_ms,...(this.config.capture?{messages:[{role:'assistant',content:redactTraceText(result.answer,this.secrets)}]}:{}),model:result.model,sources:safeIO({sources:result.sources},this.secrets,this.config.capture).sources};
    this.annotate({model:result.model,source_urls:result.sources.map(s=>s.url),source_count:result.sources.length,answer_saved:true,answer_latency_ms:Date.now()-Number(this.root.start_time)});
  },undefined);}
  fail(details:Fields={},cause?:unknown){return attempt(()=>{this.root.end_time=Date.now();this.root.error=errorTraceback(cause,'chat_request_failed',this.secrets);this.root.outputs={status:'failed',...fields(details,this.secrets)};this.annotate({...details,answer_saved:false});this.root.tags!.push('error')},undefined);}
  private async exporter(){
    this.client??=(async()=>{const{Client}=await import('langsmith');return new Client({apiKey:this.env.LANGSMITH_API_KEY,apiUrl:this.config.endpoint,workspaceId:this.env.LANGSMITH_WORKSPACE_ID,
      autoBatchTracing:false,manualFlushMode:true,omitTracedRuntimeInfo:true,disablePromptCache:true,debug:false,timeout_ms:3000,callerOptions:{maxRetries:0},tracingMode:'langsmith',
      fetchImplementation:async(input,init)=>{
        // Workers supports manual redirects. Never forward tracing credentials
        // to a redirect destination, even when the SDK would accept the reply.
        const response=await fetch(input,{...init,redirect:'manual',signal:AbortSignal.timeout(3000)});
        if(response.status>=300&&response.status<400){
          await response.body?.cancel();
          throw Object.assign(new Error('trace_redirect_rejected'),{status:response.status});
        }
        if(response.status===422){
          let validation:unknown;
          try{
            const data=await response.clone().json() as {detail?:{loc?:unknown;type?:unknown}[]};
            validation=Array.isArray(data.detail)?data.detail.slice(0,6).map(detail=>({path:Array.isArray(detail.loc)?detail.loc.filter(v=>typeof v==='number'||typeof v==='string'&&/^[A-Za-z0-9_.-]{1,60}$/.test(v)):[],type:typeof detail.type==='string'&&/^[a-z0-9_.-]{1,80}$/i.test(detail.type)?detail.type:undefined})):undefined;
          }catch{/* Provider response bodies stay out of diagnostics. */}
          throw Object.assign(new Error('trace_payload_rejected'),{status:422,validation});
        }
        return response;
      }});})();return this.client;
  }
  private exportSnapshot(client?:Exporter):Promise<boolean>{
    if(this.unavailable)return Promise.resolve(false);
    try{
      const snapshot=structuredClone(this.runs);
      this.queue=this.queue.catch(()=>false).then(async()=>{
        if(this.unavailable)return false;
        let timeout:ReturnType<typeof setTimeout>|undefined;
        try{
          const send=async()=>{
            const transport=client||await this.exporter();
            // An import which finishes after the deadline must not send late.
            if(this.unavailable)return false;
            const runCreates=snapshot.filter(run=>!this.published.has(run.id!)),runUpdates=snapshot.filter(run=>this.published.has(run.id!));
            await transport.batchIngestRuns({runCreates,runUpdates});
            for(const run of runCreates)this.published.add(run.id!);return true;
          };
          return await Promise.race([send(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('trace_export_timeout')),3000)})]);
        }catch(error){
          this.unavailable=true;
          attempt(()=>{const status=(error as {status?:unknown})?.status;console.warn('chat_tracing_unavailable',{project:this.config.project,traceId:this.root.id,errorName:error instanceof Error&&/^[A-Za-z]+Error$/.test(error.name)?error.name:'Error',...(typeof status==='number'?{status}:{}),...((error as {validation?:unknown})?.validation?{validation:(error as {validation:unknown}).validation}:{})})},undefined);
          return false;
        }finally{if(timeout!==undefined)clearTimeout(timeout)}
      });return this.queue;
    }catch{this.unavailable=true;return Promise.resolve(false)}
  }
  // Progress never blocks the answer. Later snapshots patch stable run IDs.
  publish(client?:Exporter){return attempt(()=>this.finished?Promise.resolve(false):this.exportSnapshot(client),Promise.resolve(false))}
  async flush(client?:Exporter){
    return attempt(()=>{
      if(this.finished)return Promise.resolve(false);this.finished=true;const now=Date.now();this.root.end_time??=now;this.root.extra!.metadata.background_completed_ms=now-Number(this.root.start_time);
      for(const run of this.runs)if(!run.end_time){run.end_time=now;run.error='step_interrupted'}
      return this.exportSnapshot(client);
    },Promise.resolve(false));
  }
}
export function createChatTrace(env:TracingEnv,context:Context,random:()=>number=Math.random):ChatTrace|undefined{
  try{const config=tracingConfig(env);if(!config||random()>=config.rate)return;return new ChatTrace(env,context,config)}catch{return}
}

export function traceStep(env:TracingEnv|undefined,name:string,type:'chain'|'llm'|'retriever'|'tool'='chain',metadata:Fields={}){return attempt(()=>env?.CHAT_TRACE_PARENT?.start(name,type,metadata)||env?.CHAT_TRACE?.start(name,type,metadata),undefined)}
