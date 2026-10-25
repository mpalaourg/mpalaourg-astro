import {readFile,writeFile} from 'node:fs/promises';
import {putPagesSecret} from './lib/pages-secret.mjs';
import {configurePineconeHost} from './lib/chat-environments.mjs';

// The credential is read by the process solely for authentication and piped to
// Wrangler stdin. It is never an argument, logged output or temporary file.
async function configure(){
  const flags=process.argv.slice(2);
  const environment=flags.length===0?'development':flags.length===2&&flags[0]==='--environment'?flags[1]:'';
  if(!['development','production'].includes(environment))throw new Error('Choose --environment development or --environment production.');
  if(environment==='production'&&!process.env.PINECONE_API_KEY)throw new Error('Add PINECONE_API_KEY to .env first.');
  const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  const output=JSON.parse(await readFile(`.chat/pinecone-connection-${environment}.json`,'utf8'));
  const host=output.PINECONE_INDEX_HOST;
  const spec=JSON.parse(await readFile('infra/pinecone/chat-index.json','utf8'));
  if(output.environment!==environment||output.index!==spec.environments[environment].name)throw new Error('Connection output does not match the selected environment.');
  if(!/^[a-z0-9-]+\.svc\.[a-z0-9.-]+\.pinecone\.io$/.test(host)||!/^[a-z0-9-]+$/.test(config.name))throw new Error('Invalid public connection output or Pages project name.');
  const updated=configurePineconeHost(config,environment,host);
  await writeFile('wrangler.jsonc',JSON.stringify(updated,null,2)+'\n');
  if(environment==='production')await putPagesSecret('PINECONE_API_KEY',process.env.PINECONE_API_KEY,config.name);
  console.log(`Configured the public Pinecone host for ${environment}. ${environment==='production'?'The Pages production API key was updated.':'The production index host and secrets were not changed.'} No deployment was triggered.`);
}
configure().catch(error=>{console.error(error.message);process.exitCode=1});
