import {createHash} from 'node:crypto';
import {parse} from 'parse5';
import {text} from './chat-index.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const METADATA_VERSION=2;
export function canonicalUrl(url){return url.replace(/^\/el(?=\/)/,'')||'/'}
export function sourceMetadata(source){
  const canonical=source.canonical_url||canonicalUrl(source.url),parts=canonical.split('/').filter(Boolean);
  const format=source.type==='html'?'html':canonical.endsWith('.pdf')?'pdf':'pptx';
  const sourceType=source.source_type || (parts[0]==='formula'?(parts[1]==='racecraft'?'guide':parts[1]==='champions'?'championship':/^\d{4}-season$/.test(parts[1]||'')?'season-review':'overview'):parts[0]==='publications'?(parts.length>1?'publication':'overview'):parts[0]==='projects'?(parts.length>1?'project':'overview'):'profile');
  return {metadata_version:METADATA_VERSION,source_id:hash(canonical),canonical_url:canonical,
    document_id:source.document_id||(['projects','publications'].includes(parts[0])&&parts.length===2?parts[1]:canonical),source_title:source.title,source_type:sourceType,format,
    language:source.language||(source.url.startsWith('/el/')?'el':'en'),
    topics:source.topics||[parts[0]==='formula'?'formula1':parts[0]==='publications'?'research':parts[0]==='projects'?'projects':'biography'],
    extraction_method:format==='html'?'editorial-html':format==='pdf'?'docling-reviewed':'pptx-slide-xml',
    ...(source.doi?{doi:source.doi}:{}),...(source.authors?.length?{authors:source.authors}:{}),
    ...(source.related_page?{related_page:source.related_page}:{}),
    ...(source.published_at?{published_at:source.published_at}:{}),
    ...(/^\d{4}-season$/.test(parts[1]||'')?{season:Number(parts[1].slice(0,4))}:{}),
    ...(parts[1]==='champions'&&/^\d{4}$/.test(parts[3]||'')?{season:Number(parts[3])}:{}),
  };
}
// Read actual editorial headings/date/language; no content-based intent classifier.
export function htmlMetadata(html,body){
  const tree=parse(html);const headings=[];let language,published_at,doi;let authors=[];let topics=[];
  function walk(node,inMain=false){
    const attrs=Object.fromEntries((node.attrs||[]).map(a=>[a.name,a.value]));
    if(node.tagName==='html'&&/^(en|el)(?:-|$)/.test(attrs.lang||''))language=attrs.lang.slice(0,2);
    if(node.tagName==='meta'&&['article:published_time','datePublished'].includes(attrs.property||attrs.name)&&/^\d{4}-\d{2}-\d{2}/.test(attrs.content||''))published_at=attrs.content.slice(0,10);
    if(node.tagName==='script'&&attrs.type==='application/ld+json'){
      try{
        const value=JSON.parse((node.childNodes||[]).map(c=>c.value||'').join(''));
        const visit=v=>{if(!v||typeof v!=='object')return;
          if(v['@type']==='ScholarlyArticle'){
            authors=(Array.isArray(v.author)?v.author:[]).map(a=>a.name).filter(n=>typeof n==='string'&&n.length<150).slice(0,20);
            if(v.identifier?.propertyID==='DOI'&&typeof v.identifier.value==='string'&&/^10\.\d{4,9}\/\S+$/.test(v.identifier.value))doi=v.identifier.value;
          }
          if(typeof v.keywords==='string')topics=v.keywords.split(',').map(t=>t.trim()).filter(Boolean).slice(0,16);
          if(typeof v.datePublished==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v.datePublished))published_at=v.datePublished.slice(0,10);
          for(const child of Object.values(v))if(child&&typeof child==='object')visit(child);
        };visit(value);
      }catch{/* invalid structured data cannot create metadata */}
    }
    if(node.tagName==='main')inMain=true;
    if(inMain&&/^h[1-6]$/.test(node.tagName||'')){const label=text(node);if(label)headings.push({level:Number(node.tagName[1]),label})}
    for(const child of node.childNodes||[])walk(child,inMain);
  }
  walk(tree);let offset=0;const heading_offsets=[];
  for(const h of headings){const at=body.indexOf(h.label,offset);if(at>=0){heading_offsets.push({...h,offset:at});offset=at+h.label.length}}
  return {language,published_at,heading_offsets,...(doi?{doi}:{}),...(authors.length?{authors}:{}),...(topics.length?{topics}:{})};
}
export function chunkMetadata(body,start,end,base){
  const headings=base.heading_offsets||[];const path=[];
  for(const h of headings.filter(h=>h.offset<=start)){path.length=h.level-1;path[h.level-1]=h.label}
  const inside=headings.filter(h=>h.offset>start&&h.offset<end).map(h=>h.label);
  const {heading_offsets,...fields}=base;
  return {...fields,section_path:path.filter(Boolean),section_headings:[...new Set([...path.filter(Boolean),...inside])].slice(0,16),
    contains_math:/\$[^\n]+\$|\\\[|\\\(/.test(body),contains_table:/^Table row:|^Table [IVX\d]+;|^\|.+\|/m.test(body)};
}
