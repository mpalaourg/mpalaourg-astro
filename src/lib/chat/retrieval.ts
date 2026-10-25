import {traceStep,type TracingEnv} from './tracing';
import {sourceMetadata,preferredSourceVersions} from './metadata';
import { searchQuery, type Source } from './policy';
import { isIndexedSource, MAX_ATTACHED_SOURCES } from './sources';
import { ownerBackgroundSources,type OwnerBackgroundEnv } from './owner-background';
import {retrievePineconeSources,pineconeQuery,retrievalSettings,type PineconeEnv} from './pinecone';

export type ChatHistory = { question: string; answer: string | null; sources?: { title: string; url: string }[] };
export type RetrievalPlan = { queries: string[]; sourceUrls: string[]; citationPapers: string[] };
const MAX_CONTEXT = 24000;

export async function chatCatalog(db: D1Database) {
  let rows:{title:string;url:string;metadata?:string}[];
  try{
    rows=(await db.prepare(`SELECT k.title,k.url,m.metadata FROM chat_knowledge k
      LEFT JOIN chat_pinecone_chunks p ON p.knowledge_rowid=k.rowid
      LEFT JOIN chat_pinecone_metadata m ON m.id=p.id GROUP BY k.url ORDER BY k.url LIMIT 200`).bind().all<{title:string;url:string;metadata:string}>()).results;
  }catch{
    rows=(await db.prepare('SELECT MIN(title) AS title,url FROM chat_knowledge GROUP BY url LIMIT 200').bind().all<{title:string;url:string}>()).results;
  }
  return rows.filter(row=>isIndexedSource(row.url)).map(row=>{
    const m=sourceMetadata(row.metadata);
    return {title:row.title.slice(0,180),url:row.url,...(m?{sourceType:m.source_type,language:m.language,documentId:m.document_id,topics:m.topics,
      ...(m.season?{season:m.season}:{}),...(m.related_page?{relatedPage:m.related_page}:{}),...(m.published_at?{publishedAt:m.published_at}:{})}:{})};
  });
}

// Search expressions are generated from literal Unicode tokens and bound as SQL
// values. A model plan can select evidence, never a table, statement or URL to fetch.
export async function retrieveChatSources(db: D1Database, question: string, history: ChatHistory[], attached: string[], lang: 'en' | 'el' = 'en', plan?: RetrievalPlan, pinecone?:PineconeEnv&OwnerBackgroundEnv&TracingEnv, deadline?:number): Promise<Source[]> {
  if (attached.length > MAX_ATTACHED_SOURCES || attached.some(url => !isIndexedSource(url))) return [];
  const {contextTopK}=retrievalSettings(pinecone);
  const background = attached.length ? [] : ownerBackgroundSources(lang,pinecone?.CHAT_OWNER_BACKGROUND_B64);
  const documentBudget = MAX_CONTEXT - background.reduce((size,row)=>size+row.body.length,0);
  const read = async (sql: string, ...values: string[]) => (await db.prepare(sql).bind(...values).all<Source>()).results.filter(source => isIndexedSource(source.url));
  const queries = plan?.queries.length ? plan.queries : [question, ...history.slice(-2).map(item => item.question)];
  const terms = queries.map(searchQuery).filter(Boolean).slice(0, 4);
  const selected = attached.length ? [...new Set(attached)] : [...new Set(plan?.sourceUrls || [])].filter(isIndexedSource).slice(0, 5);
  const bounded = (rows: Source[], budget: number) => {
    const seen = new Set<string>();
    return rows.flatMap(row => { if (seen.has(row.body) || budget <= 0) return []; seen.add(row.body); const body=row.body.slice(0,budget); budget-=body.length;return [{...row,body}]; });
  };
  const remote=await retrievePineconeSources(db,pinecone,pineconeQuery(question,queries),selected,deadline);
  if(remote.ok){
    if(selected.length){
      const rows=selected.flatMap(url=>bounded(remote.sources.filter(row=>row.url===url),Math.floor(documentBudget/selected.length)));
      return [...bounded(rows,documentBudget),...background];
    }
    const counts=new Map<string,number>();
    const diverse=preferredSourceVersions(remote.sources,lang).filter(row=>{const url=row.url.replace(/^\/el(?=\/)/,'');const n=counts.get(url)||0;if(n>=2)return false;counts.set(url,n+1);return true}).slice(0,contextTopK);
    return [...bounded(diverse,documentBudget),...background];
  }
  const fallback=traceStep(pinecone,'D1 · keyword fallback','retriever',{backend:'d1'});
  fallback?.input({queries,selected_source_urls:selected,top_k:contextTopK});
  const finish=(rows:Source[])=>{fallback?.output({sources:rows.filter(row=>!row.kind).map(row=>({title:row.title,url:row.url})),source_count:rows.length});fallback?.end({backend:'d1',source_count:rows.length});return rows};
  try{
  // D1 is a keyword fallback only when Pinecone is unavailable or failed.
  // In particular, a valid empty remote result does not run an FTS query.
  if (selected.length) {
    const groups = await Promise.all(selected.map(async url => {
      const pages = await read('SELECT title,url,body FROM chat_knowledge WHERE url=? ORDER BY rowid LIMIT 120', url);
      const budget = Math.floor(documentBudget/selected.length);
      if (pages.length < 120 && pages.reduce((n,row)=>n+row.body.length,0)<=budget) return pages;
      const relevant = (await Promise.all(terms.map(term => read('SELECT title,url,body FROM chat_knowledge WHERE chat_knowledge MATCH ? AND url=? ORDER BY bm25(chat_knowledge,3,0,1) LIMIT 6',term,url)))).flat();
      // Sample the document evenly, alongside query matches, instead of deciding
      // which headings or academic topics count as a method/result in code.
      const anchors = [0,.25,.5,.75,1].map(position=>pages[Math.floor(position*Math.max(0,pages.length-1))]).filter(Boolean);
      return bounded([...pages.slice(0,1),...relevant,...anchors,...pages],budget);
    }));
    const rows=groups.flat();
    return finish([...bounded(rows,documentBudget),...background]);
  }
  const matches = (await Promise.all(terms.map(term => read('SELECT title,url,body FROM chat_knowledge WHERE chat_knowledge MATCH ? ORDER BY bm25(chat_knowledge,3,0,1) LIMIT 24',term)))).flat();
  const perUrl=new Map<string,number>();
  const diverse=matches.filter(row=>{const url=row.url.replace(/^\/el(?=\/)/,'');const n=perUrl.get(url)||0;if(n>=2)return false;perUrl.set(url,n+1);return true;}).slice(0,contextTopK);
  return finish([...bounded(diverse,documentBudget),...background]);
  }catch(error){fallback?.end({},'d1_search_failed',undefined,error);throw error}
}
