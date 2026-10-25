import {spawn} from 'node:child_process';

export async function putPagesSecret(name,value,project){
  if(!/^[A-Z][A-Z0-9_]*$/.test(name)||!value||!/^[a-z0-9-]+$/.test(project))throw new Error('Invalid secret configuration.');
  const status=await new Promise((resolve,reject)=>{
    // Secret data only travels on stdin, never argv, logs or a temporary file.
    const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','pages','secret','put',name,'--project-name',project,'--env','production'],{stdio:['pipe','ignore','ignore']});
    child.on('error',reject);child.on('close',resolve);child.stdin.on('error',()=>{});child.stdin.end(value+'\n');
  });
  if(status!==0)throw new Error('Cloudflare secret update failed. Check Wrangler login and project permissions. No credentials or provider output were logged.');
}
