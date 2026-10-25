import {execFileSync} from 'node:child_process';
import {readdir,readFile} from 'node:fs/promises';

// Inspect Git's index (what will be committed), never local .env/.dev.vars
// values. Report only filenames, line numbers and rule names, not matches.
const paths=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const rules=[
  ['langsmith_key',/\b(?:lsv2_(?:pt|sk|tr)_[A-Za-z0-9_-]{24,}|ls__[A-Za-z0-9_-]{24,})/g],
  ['provider_key',/\bsk-(?:or-v1-|proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g],
  ['pinecone_key',/\bpcsk_[A-Za-z0-9_=.-]{25,}/g],
  ['github_token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g],
  ['aws_access_key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['private_key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ['credential_url',/https?:\/\/[^\s/<>:"'`{}\[\]]{1,100}:[^\s/@<>"'`{}\[\]]{8,100}@/g],
  ['jwt',/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/g],
];
const findings=[];
function scan(path,text){
  for(const [rule,pattern]of rules){
    pattern.lastIndex=0;
    for(const match of text.matchAll(pattern))findings.push({file:path,line:text.slice(0,match.index).split('\n').length,rule});
  }
  const literals=/(?:api[_-]?key|secret|password|auth[_-]?token|access[_-]?token|private[_-]?key|owner_background_b64)\s*["']?\s*[:=]\s*(["'])([^\r\n]{8,200}?)\1/gi;
  for(const match of text.matchAll(literals)){
    const value=match[2];
    if(/test|fixture|dummy|replace|example|your[-_]|hidden|redacted|process\.env|env\.|\$\{|secret_text/i.test(value)||/^[123]x000000/.test(value))continue;
    if(value.length>=24&&/^[A-Za-z0-9_+/=.-]+$/.test(value))findings.push({file:path,line:text.slice(0,match.index).split('\n').length,rule:'literal_credential_assignment'});
  }
  const assignments=/^(?:export\s+)?[A-Z_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|OWNER_BACKGROUND_B64)\s*=\s*([A-Za-z0-9_+/=.-]{24,})\s*$/gm;
  for(const match of text.matchAll(assignments)){
    if(/replace|example|your[-_]|test|fixture/i.test(match[1])||/^[123]x000000/.test(match[1]))continue;
    findings.push({file:path,line:text.slice(0,match.index).split('\n').length,rule:'literal_environment_credential'});
  }
}
let scanned=0;
for(const path of paths){
  const base=path.split('/').pop();
  if((/^\.env(?:\.|$)|^\.dev\.vars(?:\.|$)/.test(base)&&!['.env.example','.dev.vars.example'].includes(base))||/^(?:\.chat|\.wrangler)\//.test(path)){
    findings.push({file:path,rule:'private_file_tracked'});continue;
  }
  const bytes=execFileSync('git',['show',`:${path}`],{maxBuffer:64*1024*1024});
  scan(path,bytes.toString('utf8'));scanned++;
}
// Catch accidental client-side key literals in generated public assets too.
async function clientFiles(root){
  let entries;try{entries=await readdir(root,{withFileTypes:true})}catch(error){if(error.code==='ENOENT')return;throw error}
  for(const entry of entries){
    const path=`${root}/${entry.name}`;
    if(entry.name==='_worker.js')continue; // deployed server code, not public assets
    if(entry.isDirectory())await clientFiles(path);
    else if(/\.(?:js|mjs|map|html)$/.test(entry.name)){scan(path,await readFile(path,'utf8'));scanned++}
  }
}
await clientFiles('dist');
for(const path of ['.env','.env.local','.env.production.local','.dev.vars','.dev.vars.production','.chat/pinecone.json','.wrangler/deploy/config.json']){
  try{execFileSync('git',['check-ignore','--quiet',path],{stdio:'ignore'})}catch{findings.push({file:path,rule:'private_path_not_ignored'})}
}
if(findings.length){
  console.error(JSON.stringify({status:'review_required',findings},null,2));process.exitCode=1;
}else console.log(`Secret audit passed: ${scanned} indexed files/client assets inspected. Local secret files were not read. Pattern scanning is a safeguard, not proof that arbitrary sensitive text is absent.`);
