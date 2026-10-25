// Only reviewed D1 metadata reaches prompts. Pinecone-returned field values are
// never used as instructions, evidence, citation destinations or ranking hints.
export type SourceMetadata={
  source_id:string;canonical_url:string;document_id:string;source_type:string;
  language:'en'|'el';format:string;topics:string[];section_path:string[];section_headings:string[];
  chunk_index:number;chunk_count:number;page_number?:number;slide_number?:number;
  published_at?:string;season?:number;related_page?:string;
};
const types=new Set(['profile','overview','guide','championship','season-review','publication','project','cv','paper','report','thesis','slides','workshop-slides']);
export function sourceMetadata(raw:unknown):SourceMetadata|undefined{
  try{
    const m=typeof raw==='string'?JSON.parse(raw):raw;
    const string=(v:unknown,max=300):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\p{Cc}\p{Cf}]/u.test(v);
    const list=(v:unknown,max:number):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(x=>string(x));
    const positive=(v:unknown)=>Number.isInteger(v)&&Number(v)>0;
    if(!m||m.metadata_version!==2||!/^([a-f0-9]{64})$/.test(m.source_id)||!string(m.canonical_url)||!m.canonical_url.startsWith('/')||m.canonical_url.startsWith('//')||
       !string(m.document_id)||!types.has(m.source_type)||!['en','el'].includes(m.language)||!['html','pdf','pptx'].includes(m.format)||
       !list(m.topics,16)||!list(m.section_path,6)||!list(m.section_headings,16)||!Number.isInteger(m.chunk_index)||m.chunk_index<0||!positive(m.chunk_count)||m.chunk_index>=m.chunk_count)return;
    return {source_id:m.source_id,canonical_url:m.canonical_url,document_id:m.document_id,source_type:m.source_type,language:m.language,format:m.format,
      topics:m.topics,section_path:m.section_path,section_headings:m.section_headings,chunk_index:m.chunk_index,chunk_count:m.chunk_count,
      ...(positive(m.page_number)?{page_number:m.page_number}:{}),...(positive(m.slide_number)?{slide_number:m.slide_number}:{}),
      ...(typeof m.published_at==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(m.published_at)?{published_at:m.published_at}:{}),
      ...(Number.isInteger(m.season)&&m.season>=1950&&m.season<=2100?{season:m.season}:{}),
      ...(string(m.related_page)&&/^\/(?!\/)/.test(m.related_page)?{related_page:m.related_page}:{})};
  }catch{return}
}
export function metadataContext(source:{metadata?:SourceMetadata}){
  const m=source.metadata;
  if(!m)return '';
  const headings=[...new Set([...m.section_path,...m.section_headings])].slice(0,3).map(h=>h.slice(0,80)).join(' > ');
  return `Type: ${m.source_type}. Language: ${m.language}. ${m.season?`Season: ${m.season}. `:''}${headings?`Sections: ${headings}. `:''}${m.page_number?`Page: ${m.page_number}. `:''}${m.slide_number?`Slide: ${m.slide_number}. `:''}`;
}
// Prefer one language version of a page, without filtering out primary files in
// another language. Explicit attachments retain exactly their selected scope.
export function preferredSourceVersions<T extends {url:string;metadata?:SourceMetadata}>(sources:T[],lang:'en'|'el'):T[]{
  const key=(source:T)=>source.metadata?.source_id||source.url.replace(/^\/el(?=\/)/,'')||'/';
  const language=(source:T)=>source.metadata?.language||(source.url.startsWith('/el/')?'el':'en');
  const chosen=new Map<string,T>();
  for(const source of sources){
    const previous=chosen.get(key(source));
    if(!previous||language(previous)!==lang&&language(source)===lang)chosen.set(key(source),source);
  }
  return sources.filter(source=>chosen.get(key(source))?.url===source.url);
}

export function evidenceMetadata(m?:SourceMetadata){
  if(!m)return undefined;
  const {source_type,language,format,document_id,topics,section_path,section_headings,page_number,slide_number,published_at,season}=m;
  return {source_type,language,format,document_id,topics,section_path,section_headings,page_number,slide_number,published_at,season};
}
