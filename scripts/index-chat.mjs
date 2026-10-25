import {build} from 'esbuild';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import documents from '../src/lib/chat/documents.json' with { type: 'json' };
import { allowedPage, htmlPage, chunkSection, documentSections } from './lib/chat-index.mjs';
import {htmlImages} from './lib/chat-images.mjs';
import {pineconeCorpus} from './lib/pinecone-corpus.mjs';
import {sourceMetadata,htmlMetadata,chunkMetadata,METADATA_VERSION} from './lib/chat-metadata.mjs';

// Built editorial HTML and explicitly reviewed public documents only.
// Never crawl arbitrary URLs, source files, archives, credentials, or chat history.
async function* files(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.name.endsWith('.html')) yield path;
  }
}
const reviewedModule=await build({stdin:{contents:"export {prepareReviewedStarters} from './src/lib/chat/reviewed-starters.ts'; export {safeChatImage} from './src/lib/chat/images.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {prepareReviewedStarters,safeChatImage}=await import('data:text/javascript;base64,'+Buffer.from(reviewedModule.outputFiles[0].contents).toString('base64'));
const chunks = [], sources = [], imageSources=[];
function annotatedChunks(title,url,body,metadata){
  let cursor=0;
  return chunkSection(title,url,body).map(chunk=>{
    const start=body.indexOf(chunk.body,cursor);const at=start<0?cursor:start;
    cursor=at+1;
    return {...chunk,metadata:chunkMetadata(chunk.body,at,at+chunk.body.length,metadata)};
  });
}
for await (const path of files('dist')) {
  const rel = relative('dist', path);
  if (!allowedPage.test(rel)) continue;
  const html=await readFile(path,'utf8');
  const page = htmlPage(html);
  if (!page?.body) continue;
  const category = rel.includes('publications') ? 'Publications research papers δημοσιεύσεις έρευνα' : rel.includes('projects') ? 'Projects portfolio έργα' : rel.includes('formula') ? 'Formula 1 articles guides drivers constructors championship άρθρα οδηγοί πρωτάθλημα κατασκευαστές' : 'About biography experience career education σχετικά εμπειρία σπουδές';
  const url = '/' + rel.replace(/index\.html$/, '');
  const body=category+' '+page.body;
  const details=htmlMetadata(html,body);
  const images=htmlImages(html,safeChatImage);
  for(const image of images)await readFile(join('dist',image.url.slice(1)));
  if(images.length)imageSources.push({url,images});
  const source={url,title:page.title,type:'html',...details};
  const metadata={...sourceMetadata(source),source_checksum:createHash('sha256').update(page.body).digest('hex'),heading_offsets:details.heading_offsets};
  chunks.push(...annotatedChunks(page.title,url,body,metadata));
  const {heading_offsets,...publicSource}=source;sources.push(publicSource);
}
for (const source of documents) {
  if (!/^\/(?:el\/)?media\/(?:files|slides)\/[a-z0-9_-]+\.(?:pdf|pptx)$/.test(source.url)) throw new Error('Invalid public document allowlist entry');
  const sections = await documentSections(join('dist', source.url.slice(1)));
  if (!sections.length) throw new Error(`No readable text in ${source.url}`);
  const related=sources.find(s=>s.url===source.related_page);
  const metadata={...sourceMetadata(source),...(related?.doi?{doi:related.doi,authors:related.authors,work_published_at:related.published_at}:{}),section_count:sections.length,source_checksum:createHash('sha256').update(sections.map(s=>s.body).join('\n')).digest('hex')};
  for (const section of sections) {
    // Title is already an FTS column. Repeating it in every page body skews
    // relevance toward metadata instead of the document's actual content.
    const body=`${section.label}\n${section.body}`;
    const heading_offsets=[...body.matchAll(/^(#{1,6})[ \t]+(.+)$/gm)].map(m=>({level:m[1].length,label:m[2].trim(),offset:m.index}));
    const position=Number(section.label.match(/\d+$/)?.[0]);
    chunks.push(...annotatedChunks(`${source.title} — ${section.label}`,source.url,body,{...metadata,heading_offsets,
      ...(section.label.startsWith('Page ')?{page_number:position}:{slide_number:position})}));
  }
  sources.push({ ...source, type: source.url.endsWith('.pdf') ? 'pdf' : 'pptx', sections: sections.length });
}
if (!chunks.length) throw new Error('Chat index contains no public content');
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const groups=Map.groupBy(chunks,chunk=>chunk.url);
for(const group of groups.values())for(const [i,chunk]of group.entries()){
  chunk.metadata.chunk_index=i;chunk.metadata.chunk_count=group.length;
}
const version = createHash('sha256').update(JSON.stringify({metadataVersion:METADATA_VERSION,chunks})).digest('hex');
const pinecone=pineconeCorpus(chunks,version);
const reviewedStarters=await prepareReviewedStarters(chunks.map(chunk=>({...chunk,images:imageSources.find(source=>source.url===chunk.url)?.images||[]})),version);
// Replace only the public search corpus, never chat history or quota tables.
const sql = ['CREATE TABLE IF NOT EXISTS chat_source_images (source_url TEXT PRIMARY KEY, images TEXT NOT NULL);','DELETE FROM chat_source_images;',...imageSources.map(source=>`INSERT INTO chat_source_images(source_url,images) VALUES(${quote(source.url)},${quote(JSON.stringify(source.images))});`),'CREATE TABLE IF NOT EXISTS chat_starter_cache (cache_key TEXT PRIMARY KEY, response TEXT NOT NULL, created_at INTEGER NOT NULL);', 'CREATE TABLE IF NOT EXISTS chat_pinecone_metadata (id TEXT PRIMARY KEY, metadata TEXT NOT NULL);','DELETE FROM chat_pinecone_metadata;', 'DELETE FROM chat_pinecone_chunks;', 'DELETE FROM chat_knowledge;', ...pinecone.parents.flatMap(c => [
  `INSERT INTO chat_knowledge(rowid,title,url,body) VALUES (${c.rowid},${quote(c.title)},${quote(c.url)},${quote(c.body)});`,
  `INSERT INTO chat_pinecone_chunks(id,knowledge_rowid) VALUES (${quote(c.id)},${c.rowid});`,
  `INSERT INTO chat_pinecone_metadata(id,metadata) VALUES (${quote(c.id)},${quote(JSON.stringify(c.metadata))});`]),
  ...reviewedStarters.map(row=>`INSERT OR REPLACE INTO chat_starter_cache(cache_key,response,created_at) VALUES(${quote(row.key)},${quote(JSON.stringify(row.response))},${Date.now()});`),
  `INSERT OR REPLACE INTO chat_index_meta VALUES(1,${quote(version)},${quote(new Date().toISOString())});`].join('\n');
await mkdir('.chat', { recursive: true });
await writeFile('.chat/index.sql', sql);
await writeFile('.chat/sources.json', JSON.stringify({ version, chunks: chunks.length, sources }, null, 2) + '\n');
await writeFile('.chat/pinecone.json',JSON.stringify({schema:pinecone.schema,version,namespace:pinecone.namespace,indexSchema:pinecone.indexSchema,records:pinecone.records},null,2)+'\n');
console.log(`Prepared ${chunks.length} chunks from ${sources.length} public sources (${sources.filter(s => s.type === 'html').length} pages, ${documents.length} documents). Coverage: .chat/sources.json. Apply with npm run chat:index:local or chat:index:remote.`);
console.log(`Pinecone: ${pinecone.records.length} bounded embedding passages prepared in .chat/pinecone.json. No remote upload is performed by the build.`);

console.log(`Verified and prepared ${reviewedStarters.length} reviewed starter answers with citations and recorded model attribution. No model calls were made by this build.`);

console.log(`Prepared published images for ${imageSources.length} reviewed pages. Remote images and dynamic widgets are excluded.`);
