import type {TracingEnv} from './tracing';
import {safeChatLink} from './links';
import type {Source} from './policy';
export type ChatImage={url:string;alt:string;width?:number;height?:number};
// Published static assets only. Never let image syntax call an API, load a
// third-party tracker, or turn URL normalization into a path traversal.
export function safeChatImage(value:string):string|null{
  const href=safeChatLink(value);if(!href||href.startsWith('#')||/%|\.\.|\\/.test(value))return null;
  try{
    const url=new URL(href,'https://mpalaourg.dev');
    if(!['mpalaourg.dev','www.mpalaourg.dev','mpalaourg.me','www.mpalaourg.me'].includes(url.hostname)||url.port||url.search||url.hash)return null;
    return /^\/(?:media|projects|publications|formula|_astro)\/[a-z0-9/_.-]+\.(?:png|jpe?g|webp|avif|gif|svg)$/i.test(url.pathname)?url.pathname:null;
  }catch{return null}
}
export function imageRecords(value:unknown):ChatImage[]{
  try{
    const rows=typeof value==='string'?JSON.parse(value):value;
    if(!Array.isArray(rows))return [];
    const seen=new Set<string>();return rows.slice(0,30).flatMap(row=>{
      const url=typeof row?.url==='string'?safeChatImage(row.url):null;
      if(!url||seen.has(url)||typeof row.alt!=='string'||!row.alt.trim()||row.alt.length>300||/[\p{Cc}\p{Cf}]/u.test(row.alt))return [];
      seen.add(url);const dimension=(n:unknown)=>Number.isInteger(n)&&Number(n)>0&&Number(n)<=20000;
      return [{url,alt:row.alt,...(dimension(row.width)?{width:row.width}:{}),...(dimension(row.height)?{height:row.height}:{})}];
    });
  }catch{return []}
}
export async function withSourceImages(db:D1Database,sources:Source[],env?:TracingEnv):Promise<Source[]>{
  const urls=[...new Set(sources.filter(s=>!s.kind).map(s=>s.url))].slice(0,30);if(!urls.length)return sources;
  const span=env?.CHAT_TRACE_PARENT?.start('Sources · image metadata','tool')||env?.CHAT_TRACE?.start('Sources · image metadata','tool');span?.input({source_urls:urls});
  try{
    const rows=(await db.prepare(`SELECT source_url,images FROM chat_source_images WHERE source_url IN (${urls.map(()=>'?').join(',')})`).bind(...urls).all<{source_url:string;images:string}>()).results;
    const images=new Map(rows.map(row=>[row.source_url,imageRecords(row.images)]));
    const result=sources.map(s=>({...s,...(images.get(s.url)?.length?{images:images.get(s.url)}:{})}));span?.output({source_count:result.filter(source=>source.images?.length).length});span?.end();return result;
  }catch(error){span?.end({failure:'image_metadata_unavailable'},'image_metadata_unavailable',undefined,error);return sources}
}
