// Node loads the API key directly from the selected environment file. Do not
// print the environment, authorization headers, provider bodies, or credentials.
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir } from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import { build } from 'esbuild';
if (!process.env.OPENROUTER_API_KEY) { console.error('OPENROUTER_API_KEY is unavailable to this process.'); process.exit(1); }
await mkdir('.chat',{recursive:true});
const runtime=resolve('.chat/smoke-chat-runtime.mjs');
await build({stdin:{contents:"export {answerQuestion} from './src/lib/chat/server'; export {createChatTrace} from './src/lib/chat/tracing';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',packages:'external',outfile:runtime});
const {answerQuestion,createChatTrace}=await import(pathToFileURL(runtime));
const db = new DatabaseSync(':memory:');
for(const migration of ['0004_chat','0005_chat_pinecone','0006_chat_runs'])db.exec(await readFile(`migrations/${migration}.sql`,'utf8'));
db.exec(await readFile('.chat/index.sql', 'utf8'));
console.log(JSON.stringify({ preparedIndex: db.prepare('SELECT COUNT(*) AS chunks,COUNT(DISTINCT url) AS pages FROM chat_knowledge').get() }));
const DB = { prepare(query) { let args = []; return { bind(...values) { args = values; return this; }, async all() { return { results: db.prepare(query).all(...args) }; }, async first(){return db.prepare(query).get(...args)||null},async run(){return {meta:{changes:db.prepare(query).run(...args).changes}}} }; } };
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const env={...config.vars,DB,OPENROUTER_API_KEY:process.env.OPENROUTER_API_KEY,PINECONE_API_KEY:process.env.PINECONE_API_KEY,LANGSMITH_API_KEY:process.env.LANGSMITH_API_KEY,CHAT_STARTER_CACHE_ENABLED:'false'};
const question='What does Georgios work on?';
const trace=createChatTrace(env,{threadId:crypto.randomUUID(),requestId:crypto.randomUUID(),question,language:'en',persona:'baseline',hostname:'localhost',synthetic:true});
try {
  const streaming = process.argv.includes('--stream');
  let previews = 0;
  const started = Date.now(); let firstTextMs;
  const result = await answerQuestion({...env,CHAT_TRACE:trace}, question, [], 'en', streaming ? event => {
    if (event.type === 'answer' && event.answer) { previews++; firstTextMs ??= Date.now() - started; }
  } : undefined);
  trace?.result(result);
  console.log(JSON.stringify({ cacheBypassed:true,temporaryDatabase:true,liveTest: result.sources.length ? 'grounded_answer' : 'refusal', model: result.model, citations: result.sources.length, ...(streaming ? { previews, firstTextMs, totalMs: Date.now() - started } : {}) }));
  if (!result.sources.length) process.exitCode = 1;
} catch (error) { trace?.fail({stage:'synthetic_check',kind:'smoke_failed'},error);console.log(JSON.stringify({ liveTest: 'failed', reason: 'no_valid_model_response' })); process.exitCode = 1; }
finally { await trace?.flush();db.close(); }
