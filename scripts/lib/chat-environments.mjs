// Public deployment configuration only. Credentials never enter this helper.
export function configurePineconeHost(config,environment,host){
  if(!['development','production'].includes(environment))throw new Error('Invalid chat environment.');
  if(typeof host!=='string'||!/^[a-z0-9-]+\.svc\.[a-z0-9.-]+\.pinecone\.io$/.test(host))throw new Error('Invalid Pinecone host.');
  const updated=structuredClone(config);
  const targets=[updated.vars,...Object.values(updated.env||{}).map(section=>section.vars)];
  if(targets.some(vars=>!vars||!['development','production'].includes(vars.CHAT_ENVIRONMENT)))throw new Error('Every deployment must declare CHAT_ENVIRONMENT.');
  if(!targets.some(vars=>vars.CHAT_ENVIRONMENT===environment))throw new Error('The selected environment is not configured.');
  if(targets.some(vars=>vars.CHAT_ENVIRONMENT!==environment&&vars.PINECONE_INDEX_HOST?.replace(/^https:\/\//,'').replace(/\/$/,'')===host))throw new Error('Development and production must use different index hosts.');
  for(const vars of targets)if(vars.CHAT_ENVIRONMENT===environment)vars.PINECONE_INDEX_HOST=host;
  return updated;
}
