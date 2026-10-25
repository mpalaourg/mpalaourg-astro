export type CancellableEnv = { CHAT_ABORT_SIGNAL?: AbortSignal };
export function runSignal(env:CancellableEnv|undefined,timeout:number) {
  const timer=AbortSignal.timeout(Math.max(1,timeout));
  return env?.CHAT_ABORT_SIGNAL?AbortSignal.any([env?.CHAT_ABORT_SIGNAL,timer]):timer;
}
export function checkRun(env:CancellableEnv|undefined){env?.CHAT_ABORT_SIGNAL?.throwIfAborted()}
export function runPause(ms:number,signal?:AbortSignal){
  return new Promise<void>((resolve,reject)=>{
    if(signal?.aborted){reject(signal.reason);return}
    const finish=()=>{signal?.removeEventListener('abort',abort);resolve()};
    const timer=setTimeout(finish,ms);
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal?.reason)};
    signal?.addEventListener('abort',abort,{once:true});
  });
}
// Immediate signalling within one isolate; D1 polling covers different workers.
const active=new Map<string,AbortController>();
export function registerRun(id:string,controller:AbortController){active.set(id,controller);return()=>{if(active.get(id)===controller)active.delete(id)}}
export function abortRun(id:string){active.get(id)?.abort(new DOMException('Run cancelled','AbortError'))}
