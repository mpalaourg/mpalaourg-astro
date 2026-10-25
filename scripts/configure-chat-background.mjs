import {readFile,appendFile} from 'node:fs/promises';
import {putPagesSecret} from './lib/pages-secret.mjs';

async function configure(){
  const facts=JSON.parse(await readFile('.chat/owner-background.json','utf8'));
  if(!Array.isArray(facts)||!facts.length||facts.length>12||facts.some(fact=>!fact||Object.keys(fact).sort().join(',')!=='el,en'||['en','el'].some(key=>typeof fact[key]!=='string'||!fact[key].trim()||fact[key].length>1200||/[\p{Cc}\p{Cf}]/u.test(fact[key]))))throw new Error('Private background configuration has an invalid shape. No values were logged.');
  const encoded=Buffer.from(JSON.stringify(facts),'utf8').toString('base64');
  if(encoded.length>24000)throw new Error('Private background configuration is too large.');
  if(!process.env.CHAT_OWNER_BACKGROUND_B64)await appendFile('.env',`\nCHAT_OWNER_BACKGROUND_B64=${encoded}\n`,{mode:0o600});
  else if(process.env.CHAT_OWNER_BACKGROUND_B64!==encoded)throw new Error('Local background configuration already exists with different content. Update that one variable before syncing; no other .env values were read or changed.');
  const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  await putPagesSecret('CHAT_OWNER_BACKGROUND_B64',encoded,config.name);
  console.log('Approved bilingual background saved locally and as an encrypted Cloudflare Pages production secret. No background values or encoded data were printed.');
}
configure().catch(()=>{console.error('Background configuration could not be synced. Check the ignored JSON shape and Wrangler login. No values were logged.');process.exitCode=1});
