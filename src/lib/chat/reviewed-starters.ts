import reviewed from './reviewed-starters.json';
import {CHAT_STARTERS,starterQuestion} from './starters';
import {PERSONAS,type Persona} from './personas';
import {starterReviewPolicy} from './starter-review-policy';
import {validateAnswer,type Source} from './policy';
const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export async function reviewedStarterKey(version:string,question:string,lang:'en'|'el',persona:Persona,system:string){
  const prompt=starterQuestion(question,lang);if(!prompt)return;
  const policy=await digest(system);
  if((reviewed.policyHashes as Record<string,string>)[`${lang}:${persona}`]!==policy)return;
  return 'reviewed:'+await digest(JSON.stringify({version,prompt,lang,persona,policy,review:await digest(JSON.stringify(reviewed))}));
}
export function reviewedStarterModel(question:string,lang:'en'|'el'):string|null{
  const prompt=starterQuestion(question,lang);
  const topic=reviewed.topics.find(topic=>CHAT_STARTERS[lang][topic.index]===prompt);
  return topic?.generation[lang].model||null;
}
// Original generation digests and model attribution stay pinned in the manifest.
// Editorial wording revisions and illustrations are recorded separately.
export function reviewedStarterAnswer(question:string,lang:'en'|'el',persona:Persona){
  const prompt=starterQuestion(question,lang);
  const topic=reviewed.topics.find(topic=>CHAT_STARTERS[lang][topic.index]===prompt);
  if(!topic)return;
  const text=topic.answers[lang][persona],picture=topic.illustrations[lang];
  if(!picture||persona==='concise')return text;
  const markdown=`![${picture.alt}](${picture.url})`;
  const ending=text.lastIndexOf('\n\n');
  return ending<0?`${text}\n\n${markdown}`:`${text.slice(0,ending)}\n\n${markdown}\n\n${text.slice(ending+2)}`;
}
// Called by corpus preparation, never by visitors. Hashes pin the reviewed source
// text and prompts; changed evidence/policy requires editorial review before build.
export async function prepareReviewedStarters(chunks:Source[],version:string){
  const rows:{key:string;response:{answer:string;sources:{title:string;url:string}[];model:string|null}}[]=[];
  const sourceHashes=reviewed.sourceHashes as Record<string,string>;
  const normalize=(s:string)=>s.normalize('NFC').replace(/\s+/gu,' ').trim().toLocaleLowerCase();
  for(const topic of reviewed.topics)for(const lang of ['en','el'] as const){
    const generation=topic.generation[lang];
    const edit=topic.editorialReview[lang];
    if(edit&&(edit.generatedAnswerHash!==generation.answerHash||!edit.note||!Number.isFinite(Date.parse(edit.reviewedAt))))throw new Error(`Review starter editorial provenance: ${lang}/${topic.index}`);
    if(!generation.model||generation.model==='openrouter/free'||!Number.isFinite(Date.parse(generation.generatedAt))||await digest(JSON.stringify(topic.answers[lang]))!==(edit?.answerHash||generation.answerHash))throw new Error(`Review starter generation attribution: ${lang}/${topic.index}`);
    const sources:Source[]=[];
    for(const reference of topic.evidence[lang]){
      const matching=chunks.filter(c=>c.url===reference.url);
      const body=matching.map(c=>c.body).join('\n');
      if(!matching.length||await digest(body)!==sourceHashes[reference.url]||reference.quotes.some(q=>!normalize(body).includes(normalize(q))))throw new Error(`Review starter evidence before building: ${reference.url}`);
      sources.push({title:matching[0].title.replace(/ — (Page|Slide) \d+$/,''),url:reference.url,body,images:matching.flatMap(c=>c.images||[])});
    }
    for(const {id:persona}of PERSONAS){
      const question=CHAT_STARTERS[lang][topic.index];
      const key=question&&await reviewedStarterKey(version,question,lang,persona,starterReviewPolicy(lang,persona));
      if(!key)throw new Error(`Review starter prompts before building: ${lang}/${persona}`);
      const text=reviewedStarterAnswer(question,lang,persona)!;
      const checked=validateAnswer({allowed:true,kind:'answer',answer:text,sourceIds:sources.map((_,i)=>i+1)},sources,lang,false);
      if(!checked||checked.answer!==text||text.includes('\u2014'))throw new Error(`Invalid reviewed starter answer: ${lang}/${persona}/${topic.index}`);
      rows.push({key,response:{...checked,model:reviewedStarterModel(question,lang)}});
    }
  }
  if(rows.length!==Object.values(CHAT_STARTERS).reduce((n,q)=>n+q.length,0)*PERSONAS.length||new Set(rows.map(r=>r.key)).size!==rows.length)throw new Error('Reviewed starters must cover every prompt, language and persona exactly once');
  return rows;
}
