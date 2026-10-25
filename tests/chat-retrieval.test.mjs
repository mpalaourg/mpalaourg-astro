import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {backgroundEnv} from './helpers/chat-background.mjs';
const compiled = await build({entryPoints:['src/lib/chat/retrieval.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {retrieveChatSources}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
function corpus() {
  const sql=new DatabaseSync(':memory:');sql.exec('CREATE VIRTUAL TABLE chat_knowledge USING fts5(title,url UNINDEXED,body)');
  const insert=sql.prepare('INSERT INTO chat_knowledge VALUES(?,?,?)');
  insert.run('Publications','/publications/','Georgios published three research papers. PGL-SUM, CA-SUM and attention explanations.');
  insert.run('CV resume research publications','/media/files/resume_en.pdf','Research papers publications details details details');
  insert.run('CV resume research publications','/el/media/files/resume_gr.pdf','Research papers publications details details details');
  const urls=['/media/files/ism2021_preprint.pdf','/media/files/icmr2022_preprint.pdf','/media/files/ism2022_preprint.pdf'];
  for (const [i,url] of urls.entries()) {
    insert.run(`Paper ${i} Page 1`,url,`Abstract and identity: research paper ${i}.`);
    insert.run(`Paper ${i} Page 2`,url,`Proposed method architecture mechanism unique-method-${i}.`);
    insert.run(`Paper ${i} Page 3`,url,`Experiments evaluation findings datasets unique-result-${i}.`);
    for(let n=0;n<12;n++)insert.run(`Paper ${i} Page ${n+4}`,url,`research papers publications training details ${i===0?'details '.repeat(15):''} repeated hyperparameters`);
  }
  const DB={prepare(query){let args=[];return{bind(...values){args=values;return this},async all(){return{results:sql.prepare(query).all(...args)}}}}};
  return{sql,DB,urls};
}
test('publication follow-up retrieves primary method and evaluation evidence for every paper',async()=>{
  const {sql,DB,urls}=corpus();
  try{
    const sources=await retrieveChatSources(DB,'details about them? can you tell me?',[{question:'What has Georgios published?',answer:'Three papers on video summarization.',sources:[{title:'Publications',url:'/publications/'}]}],[],'en',{queries:['research methods evaluation'],sourceUrls:urls,citationPapers:[]});
    for(const [i,url]of urls.entries()){
      const body=sources.filter(s=>s.url===url).map(s=>s.body).join(' ');
      assert.match(body,new RegExp(`unique-method-${i}`));assert.match(body,new RegExp(`unique-result-${i}`));
    }
    assert.ok(sources.every(s=>!s.url.includes('resume_')), 'CVs must not crowd out primary papers');
    assert.ok(sources.reduce((n,s)=>n+s.body.length,0)<=24000);
    assert.ok(sources.length>6,'evidence for three papers must not compete for six global slots');
  }finally{sql.close();}
});
test('explicit tags keep their evidence boundary and a new subject does not inherit old publication scope',async()=>{
  const {sql,DB,urls}=corpus();
  try{
    const sources=await retrieveChatSources(DB,'Details about this paper',[{question:'What has Georgios published?',answer:'Three papers.'}],[urls[1]]);
    assert.ok(sources.length);assert.ok(sources.every(s=>s.url===urls[1]));
    sql.prepare('INSERT INTO chat_knowledge VALUES(?,?,?)').run('About','/about/','Coffee hobbies outside work.');
    const next=await retrieveChatSources(DB,'Coffee hobbies', [{question:'What has Georgios published?',answer:'Three papers.'}],[],'en',{queries:['Coffee hobbies'],sourceUrls:['/about/'],citationPapers:[]});
    assert.deepEqual(next.filter(s=>s.kind!=='owner-background').map(s=>s.url),['/about/']);
  }finally{sql.close();}
});

test('large selected documents cannot crowd owner-approved facts out of the context budget',async()=>{
 const {sql,DB}=corpus();
 try{
  sql.prepare('INSERT INTO chat_knowledge VALUES(?,?,?)').run('About','/about/','Long document '.repeat(3000));
  const sources=await retrieveChatSources(DB,'His interests',[],[],'en',{queries:['interests'],sourceUrls:['/about/'],citationPapers:[]},backgroundEnv);
  assert.equal(sources.filter(s=>s.kind==='owner-background').length,4);
  assert.match(sources.map(s=>s.body).join(' '),/Example FC/);
  assert.ok(sources.reduce((n,s)=>n+s.body.length,0)<=24000);
  const tagged=await retrieveChatSources(DB,'His interests',[],['/about/'],'en',undefined,backgroundEnv);
  assert.ok(tagged.every(s=>s.kind!=='owner-background'));
 }finally{sql.close()}
});
