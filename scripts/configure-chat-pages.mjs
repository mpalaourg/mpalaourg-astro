import {execFileSync} from 'node:child_process';
import {mkdtempSync,symlinkSync,rmSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {tmpdir,devNull} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export function publicChatSettings(vars){
  if(!vars||!['development','production'].includes(vars.CHAT_ENVIRONMENT))throw new Error('Declare CHAT_ENVIRONMENT in the selected deployment.');
  return Object.fromEntries(Object.entries(vars).map(([name,value])=>{
    if(!/^(?:CHAT|PINECONE|LANGSMITH)_[A-Z0-9_]+$/.test(name)||/KEY|SECRET|TOKEN|BACKGROUND/.test(name)||typeof value!=='string')throw new Error('Only public chatbot settings belong in Wrangler vars.');
    return [name,{type:'plain_text',value}];
  }));
}
function wranglerJson(args){
  // Wrangler logs stdout even for `auth token`. Discard its debug log through
  // a private temporary symlink, so credentials never enter a regular log file.
  const folder=mkdtempSync(join(tmpdir(),'chat-wrangler-auth-'));
  try{
    const log=join(folder,'discard.log');symlinkSync(devNull,log);
    return JSON.parse(execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args,'--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_LOG_PATH:log}}));
  }
  catch{throw new Error('Wrangler authentication is unavailable. Check your existing login.');}
  finally{rmSync(folder,{recursive:true,force:true});}
}
export async function configurePages(environment,apply=false){
  if(!['production','preview'].includes(environment))throw new Error('Choose --environment production or --environment preview.');
  const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  if(!/^[a-z0-9-]+$/.test(config.name))throw new Error('Invalid Pages project name.');
  const desired=publicChatSettings(config.env?.[environment]?.vars);
  const auth=wranglerJson(['auth','token']);
  if(!auth.token)throw new Error('Use a Wrangler OAuth login or scoped API token.');
  // Auth output stays in process memory; it is never printed or written to disk.
  let account=config.account_id||process.env.CLOUDFLARE_ACCOUNT_ID;
  if(!account){const user=wranglerJson(['whoami']);if(user.accounts?.length===1)account=user.accounts[0].id;}
  if(!account||!/^[a-f0-9]{32}$/.test(account))throw new Error('Select the Cloudflare account explicitly.');
  const url=`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${config.name}`;
  const api=async(method='GET',body)=>{
    const response=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok){await response.body?.cancel();throw new Error(`Cloudflare settings request failed (HTTP ${response.status}).`);}
    let result;try{result=await response.json()}catch{throw new Error('Cloudflare returned an invalid settings response.');}
    if(!result.success)throw new Error('Cloudflare settings request failed.');return result.result;
  };
  const project=await api(),current=project.deployment_configs[environment];
  const bindings=current.env_vars||{};
  const changed=Object.keys(desired).filter(name=>bindings[name]?.type!=='plain_text'||bindings[name].value!==desired[name].value);
  if(changed.some(name=>bindings[name]?.type==='secret_text'))throw new Error('A public setting conflicts with a remote secret; resolve its type before applying.');
  const required=['OPENROUTER_API_KEY','CHAT_IP_SECRET','TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','PINECONE_API_KEY'];
  if(desired.CHAT_ENABLED?.value==='true'&&required.some(name=>!bindings[name]))throw new Error('Required chat credential bindings are missing.');
  const secretNames=Object.keys(bindings).filter(name=>bindings[name]?.type==='secret_text');
  if(apply&&changed.length){
    // Pages merges individual env_vars, as Wrangler's secret commands do. Send
    // only public values; existing secret entries never enter the PATCH body.
    await api('PATCH',{deployment_configs:{[environment]:{env_vars:Object.fromEntries(changed.map(name=>[name,desired[name]])),wrangler_config_hash:current.wrangler_config_hash}}});
    const verified=(await api()).deployment_configs[environment].env_vars||{};
    if(Object.keys(desired).some(name=>verified[name]?.type!=='plain_text'||verified[name].value!==desired[name].value)||secretNames.some(name=>verified[name]?.type!=='secret_text'))throw new Error('Cloudflare configuration verification failed.');
  }
  return {environment,applied:apply,changedSettings:changed,existingSecretsPreserved:secretNames.length,deploymentTriggered:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2),valid=args.length>=2&&args.length<=3&&args[0]==='--environment'&&(args.length===2||args[2]==='--apply');
  if(!valid){console.error('Use --environment production|preview [--apply]. Default is a read-only plan.');process.exitCode=1;}
  else configurePages(args[1],args[2]==='--apply').then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
