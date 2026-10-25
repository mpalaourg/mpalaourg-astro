import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import {backgroundFacts,backgroundEnv} from './helpers/chat-background.mjs';
async function moduleAt(path) {
 const built=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});
 return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
}
const {ownerBackgroundSources}=await moduleAt('src/lib/chat/owner-background.ts');
const {validateAnswer}=await moduleAt('src/lib/chat/policy.ts');
const {citationPapers,citationCountSources}=await moduleAt('src/lib/chat/citation-counts.ts');
const nativeFetch=globalThis.fetch;afterEach(()=>{globalThis.fetch=nativeFetch;});

test('owner background answers EN/EL personal questions without fabricated page citations',()=>{
 for(const [q,lang,expected] of [
  ['Which schools did he attend?','en',/Example Primary School.*Example Middle School.*Example High School/],
  ['Σε ποιο σχολείο πήγε;','el',/Δημοτικό.*Γυμνάσιο.*Λύκειο/],
  ['Where does he live and when did he move?','en',/Sample City in 2018/],
  ['Από ποιο χωριό κατάγεται;','el',/Δοκιμαστικό Χωριό.*Δοκιμαστικό Βουνό/],
  ['Which teams does he support?','en',/Example FC.*Example Racing/],
  ['Ποια ομάδα υποστηρίζει;','el',/Δοκιμαστική Ομάδα.*Δοκιμαστική Αγωνιστική/],
 ]){
  const sources=ownerBackgroundSources(lang,backgroundEnv.CHAT_OWNER_BACKGROUND_B64);assert.match(sources.map(s=>s.body).join(' '),expected);
  assert.ok(sources.every(s=>s.kind==='owner-background'&&s.url===''));
  assert.deepEqual(validateAnswer({allowed:true,sourceIds:[1],answer:lang==='el'?'Υποστηρίζει τη Δοκιμαστική Ομάδα.':'He supports Example FC.'},sources,lang).sources,[]);
 }
 assert.equal(ownerBackgroundSources('en',backgroundEnv.CHAT_OWNER_BACKGROUND_B64).length,4, 'all configured facts reach the model without a question keyword gate');
});

test('background requires server configuration and rejects malformed or oversized secrets without defaults',()=>{
 const encode=value=>Buffer.from(JSON.stringify(value),'utf8').toString('base64');
 for(const value of [undefined,'not-base64',encode({en:'not an array'}),encode([{en:'missing translation'}]),encode([{en:'x',el:'y',url:'/fake/'}]),encode([{en:'x'.repeat(1201),el:'y'}]),'x'.repeat(24001)])assert.deepEqual(ownerBackgroundSources('en',value),[]);
 assert.deepEqual(ownerBackgroundSources('el',encode(backgroundFacts)).map(row=>row.body),backgroundFacts.map(fact=>fact.el));
});

test('citation selection handles named papers, follow-ups and explicit evidence boundaries',async()=>{
 assert.deepEqual(await citationCountSources(undefined,['unknown'],[]),[]);
 assert.deepEqual(await citationCountSources(undefined,['icmr2022'],['/media/files/resume_en.pdf']),[]);
 for(const p of citationPapers){const md=await readFile(`src/content/publications/${p.slug}.md`,'utf8');assert.ok(md.includes(p.doi)&&md.includes(p.title));}
});

test('live citation evidence is dated, attributed, bounded to reviewed papers and preserves zero',async()=>{
 const requests=[];globalThis.fetch=async url=>{requests.push(String(url));return Response.json({citationCount:0,year:2022});};
 const rows=await citationCountSources(undefined,['icmr2022'],[],'el');
 assert.equal(requests.length,1);assert.match(requests[0],/api\.semanticscholar\.org\/graph\/v1\/paper\/DOI:/);
 assert.equal(rows[0].url,'/el/publications/');assert.match(rows[0].body,/Semantic Scholar citation count: 0\. Checked at: \d{4}-/);
 globalThis.fetch=async()=>Response.json({year:2022});
 const missing=await citationCountSources(undefined,['icmr2022'],[]);
 assert.match(missing[0].body,/unavailable.*Do not invent a number or use zero/);
});

test('expired citation evidence is explicitly older and never silently presented as current',async()=>{
 const DB={prepare(query){return{bind(){return this},async first(){return query.includes('expires_at >')?null:{data:JSON.stringify({citationCount:12,source:'Semantic Scholar',cachedAt:'2026-09-01T10:00:00Z'})};}}}};
 globalThis.fetch=async()=>new Response('',{status:503});
 const rows=await citationCountSources(DB,['ism2021'],[]);
 assert.match(rows[0].body,/citation count: 12/);
 assert.match(rows[0].body,/2026-09-01.*expired cached.*older count, not current/);
});
