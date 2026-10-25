import {traceStep,type TracingEnv} from './tracing';
import {reviewedStarterKey,reviewedStarterModel} from './reviewed-starters';
import type {Persona} from './personas';
import {starterQuestion} from './starters';
import {isIndexedSource} from './sources';
import {invalidQuestionStructure,leaksInstructions} from './policy';
import type {ChatStreamEvent} from './stream';
export interface StarterCacheEnv extends TracingEnv {DB?:D1Database;CHAT_STARTER_CACHE_ENABLED?:string}
export type StarterAnswer={answer:string;sources:{title:string;url:string}[];model:string|null};
type CacheSlot={key:string;hit?:StarterAnswer;reason:string};
function savedAnswer(raw:unknown,system:string,expectedModel:string|null):StarterAnswer|undefined{
  try{
    const r=typeof raw==='string'?JSON.parse(raw):raw;
    if(!r||typeof r.answer!=='string'||!r.answer.trim()||r.answer.length>3200||invalidQuestionStructure(r.answer.replace(/`{3,}|~{3,}/g,''))||leaksInstructions(r.answer,system)||
       r.model!==expectedModel||!Array.isArray(r.sources)||!r.sources.length||r.sources.length>24||
       r.sources.some((s:any)=>!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>600||typeof s.url!=='string'||!isIndexedSource(s.url)))return;
    return {answer:r.answer,sources:r.sources.map((s:any)=>({title:s.title,url:s.url})),model:r.model};
  }catch{return}
}
export function starterCacheIneligibility(env:StarterCacheEnv,question:string,lang:'en'|'el',historyLength:number,attached:string[],remainingTurns:number){
  if(env.CHAT_STARTER_CACHE_ENABLED==='false')return 'disabled';if(!env.DB)return 'database_unavailable';
  if(!starterQuestion(question,lang))return 'not_a_starter';if(historyLength)return 'follow_up';if(attached.length)return 'sources_attached';if(remainingTurns!==3)return 'not_first_turn';
}
export async function openStarterCache(env:StarterCacheEnv,question:string,lang:'en'|'el',persona:Persona,historyLength:number,attached:string[],remainingTurns:number,system:string,now=Date.now()):Promise<CacheSlot|undefined>{
  if(starterCacheIneligibility(env,question,lang,historyLength,attached,remainingTurns))return;
  try{
    const meta=await env.DB!.prepare('SELECT version FROM chat_index_meta WHERE id=1').first<{version:string}>();
    if(!meta||!/^[a-f0-9]{64}$/.test(meta.version))return;
    const key=await reviewedStarterKey(meta.version,question,lang,persona,system);
    if(!key)return;
    const row=await env.DB!.prepare('SELECT response,created_at FROM chat_starter_cache WHERE cache_key=?').bind(key).first<{response:string;created_at:number}>();
    const hit=row&&row.created_at<=now&&row.response.length<=32000?savedAnswer(row.response,system,reviewedStarterModel(question,lang)):undefined;
    return {key,reason:hit?'reviewed_starter_match':row?'invalid_cached_entry':'not_cached',...(hit?{hit}:{})};
  }catch{
    // Cache/schema failure is a miss, never a failed visitor answer.
    traceStep(env,'Cache · storage failure','tool')?.end({failure:'cache_storage_unavailable'},'cache_storage_unavailable');
    console.warn('chat_starter_cache_unavailable');return;
  }
}
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export async function replayStarterAnswer(result:StarterAnswer,emit?:(event:ChatStreamEvent)=>void,sleep:(ms:number)=>Promise<void>=pause){
  if(!emit)return result;
  emit({type:'status',phase:'thinking'});
  await sleep(750);
  const words=result.answer.match(/\S+\s*|\s+/gu)||[];
  let answer='',pending='',wordCount=0,chunk=0;
  // Small word groups keep formatting intact. A fixed rhythm gives gentle
  // variation without random tests or a delayed final save after the last word.
  const groupSizes=[2,3,2,3],delays=[110,140,120,130];
  for(const [i,word]of words.entries()){
    pending+=word;wordCount++;
    if(wordCount<groupSizes[chunk%groupSizes.length]&&i+1<words.length)continue;
    answer+=pending;emit({type:'answer',answer});
    if(i+1<words.length){
      const delay=/\n\s*\n\s*$/.test(pending)?300:/[.!?;·;][”’"')\]]*\s+$/.test(pending)?220:delays[chunk%delays.length];
      await sleep(delay);
    }
    pending='';wordCount=0;chunk++;
  }
  return result;
}
