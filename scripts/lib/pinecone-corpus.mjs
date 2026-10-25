import {createHash} from 'node:crypto';
import indexSpec from '../../infra/pinecone/chat-index.json' with {type:'json'};

export const pineconeSchema = indexSpec.schema;

// E5 embeds only 507 tokens. A conservative UTF-8 byte ceiling avoids silent
// truncation in Greek, formulas and technical passages without shipping a large
// tokenizer to the Worker. Pinecone rejects unexpected overlength inputs too.
// Original larger reviewed chunks remain intact in D1 for answer context.
export function embeddingPassages(text, maxBytes=440) {
  const points=Array.from(text), result=[];
  for(let start=0;start<points.length;){
    let end=start,bytes=0;
    while(end<points.length){const n=Buffer.byteLength(points[end]);if(bytes+n>maxBytes)break;bytes+=n;end++}
    if(end===start)throw new Error('Embedding passage cannot fit a character');
    if(end<points.length){
      for(let at=end-1;at>start+Math.floor((end-start)*.6);at--){if(/\s/u.test(points[at])){end=at+1;break}}
    }
    const body=points.slice(start,end).join('').trim();if(body)result.push(body);
    if(end===points.length)break;
    // Small overlap keeps facts crossing a boundary discoverable.
    let next=end,overlap=0;
    while(next>start+1 && overlap+Buffer.byteLength(points[next-1])<=40){next--;overlap+=Buffer.byteLength(points[next])}
    start=next;
  }
  return result;
}

export function pineconeCorpus(chunks,version) {
  const parents=chunks.map((chunk,i)=>({id:createHash('sha256').update(JSON.stringify(chunk)).digest('hex'),rowid:i+1,...chunk}));
  if(new Set(parents.map(row=>row.id)).size!==parents.length)throw new Error('Duplicate reviewed corpus chunk');
  const groups=Map.groupBy(parents,parent=>parent.url);
  for(const group of groups.values())for(const [i,parent]of group.entries()){
    if(parent.metadata)parent.metadata={...parent.metadata,
      ...(i?{previous_parent_id:group[i-1].id}:{}),...(i+1<group.length?{next_parent_id:group[i+1].id}:{}),
      corpus_version:version,content_sha256:createHash('sha256').update(parent.body).digest('hex')};
  }
  const records=parents.flatMap(parent=>{
    const passages=embeddingPassages(parent.body);
    return passages.map((body,i)=>({
      _id:`${parent.id}-${String(i).padStart(4,'0')}`,
      ...parent.metadata,title:parent.title,body,parent_id:parent.id,source_url:parent.url,
      language:parent.metadata?.language||(parent.url.startsWith('/el/')?'el':'en'),
      passage_index:i,passage_count:passages.length,
    }));
  });
  return {schema:2,version,namespace:`site-${version.slice(0,24)}`,indexSchema:pineconeSchema,parents,records};
}
