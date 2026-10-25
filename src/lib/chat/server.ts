import {traceStep,type TracingEnv} from './tracing';
import {withSourceImages} from './images';
import {openStarterCache,replayStarterAnswer,starterCacheIneligibility,type StarterCacheEnv} from './starter-cache';
import {starterReviewPolicy} from './starter-review-policy';
import {evidenceMetadata} from './metadata';
import { SYSTEM_PROMPT, SCOPE_PROMPT, answerLanguagePrompt, REFUSAL, CHAT_TIMING, invalidQuestionStructure, validateAnswer, previewAnswer, leaksInstructions, type Source } from './policy';
import { eventData, type ChatStreamEvent } from './stream';
import { personaPrompt, type Persona } from './personas';
import { ChatStorageError } from './storage';
import { retrieveChatSources, chatCatalog, type ChatHistory } from './retrieval';
import { continuationPrompt } from './contact';
import { citationCountSources } from './citation-counts';
import { EVIDENCE_PROMPT, evidencePlan } from './evidence-plan';
import { citationPapers } from './citation-counts';
import {decideChatRoute,decisionPrompt} from './decisions';
import type {PineconeEnv} from './pinecone';
import type {OwnerBackgroundEnv} from './owner-background';
export interface ChatEnv extends PineconeEnv,OwnerBackgroundEnv,StarterCacheEnv,TracingEnv {
  DB?: D1Database; OPENROUTER_API_KEY?: string; CHAT_IP_SECRET?: string;
  CHAT_DECISION_MODEL?: string; CHAT_DECISION_SECONDARY_MODEL?: string; CHAT_DECISION_TERTIARY_MODEL?: string; CHAT_DECISION_FALLBACK_MODEL?: string;
  CHAT_MODEL?: string; CHAT_SECONDARY_MODEL?: string; CHAT_TERTIARY_MODEL?: string; CHAT_FALLBACK_MODEL?: string; CHAT_TITLE_MODEL?: string; CHAT_ENABLED?: string;
  CHAT_REQUIRE_TURNSTILE?: string; TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string;
}
export const DEFAULT_CHAT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
export const DEFAULT_CHAT_SECONDARY_MODEL = 'google/gemma-4-31b-it:free';
export const DEFAULT_CHAT_TERTIARY_MODEL = 'openrouter/free';
export const DEFAULT_CHAT_FALLBACK_MODEL = 'z-ai/glm-5.3-flash';
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
export async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function visitorHash(secret: string, ip: string, day: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${day}:${ip}`))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4096) { await reader.cancel(); throw new Error('body'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function answerQuestion(env: ChatEnv, question: string, history: ChatHistory[], lang: 'en' | 'el', emit?: (event: ChatStreamEvent) => void, persona: Persona = 'baseline', attached: string[] = [], remainingTurns = Math.max(0, 3 - history.length)) {
  const refusal = { answer: REFUSAL[lang], sources: [], model: null as string | null };
  if (invalidQuestionStructure(question)) return refusal;
  const voice = answerLanguagePrompt(lang) + personaPrompt(persona, lang);
  const cacheSystem=starterReviewPolicy(lang,persona);
  const cacheSpan=traceStep(env,'Cache · lookup','tool');
  const cacheIneligibility=starterCacheIneligibility(env,question,lang,history.length,attached,remainingTurns);
  cacheSpan?.input({eligible:!cacheIneligibility,reason:cacheIneligibility||'eligible',question,language:lang,persona,history_turns:history.length,attachment_count:attached.length,remaining_turns:remainingTurns});
  const cache=await openStarterCache(env,question,lang,persona,history.length,attached,remainingTurns,cacheSystem);
  cacheSpan?.output({hit:!!cache?.hit,cache_key:cache?.key||null,model:cache?.hit?.model||null,reason:cache?.reason||cacheIneligibility||'index_or_policy_unavailable'});
  cacheSpan?.end({cache_hit:!!cache?.hit});env.CHAT_TRACE?.annotate({cache_hit:!!cache?.hit});
  if(cache?.hit){const replay=traceStep(env,'Cache · reveal reply','chain',{delay_ms:750});replay?.input({model:cache.hit.model,characters:cache.hit.answer.length});let chunks=0;const started=Date.now();const result=await replayStarterAnswer(cache.hit,emit?event=>{if(event.type==='answer')chunks++;emit(event)}:undefined);replay?.output({messages:[{role:'assistant',content:result.answer}],model:result.model,sources:result.sources,chunks,delay_ms:emit?750:0,duration_ms:Date.now()-started});replay?.end({chunks,delay_ms:emit?750:0});return result;}
  const deadline = Date.now() + 125000;
  let sources: Source[] = [], catalog: {title:string;url:string}[];
  try { catalog = await chatCatalog(env.DB!); }
  catch (error) { throw new ChatStorageError('retrieve_sources', error); }
  emit?.({ type: 'status', phase: 'thinking' });
  const models = [...new Set([env.CHAT_MODEL || DEFAULT_CHAT_MODEL, env.CHAT_SECONDARY_MODEL || DEFAULT_CHAT_SECONDARY_MODEL, env.CHAT_TERTIARY_MODEL || DEFAULT_CHAT_TERTIARY_MODEL, env.CHAT_FALLBACK_MODEL || DEFAULT_CHAT_FALLBACK_MODEL])];
  const decision=await decideChatRoute(env,question,history,catalog.filter(item=>attached.includes(item.url)),lang,deadline,catalog);
  const routeInstruction=decisionPrompt(decision.kind);
  const planningSystem = SCOPE_PROMPT + voice + EVIDENCE_PROMPT + routeInstruction;
  const answeringSystem = SYSTEM_PROMPT + voice + continuationPrompt(lang, persona, remainingTurns, history) + EVIDENCE_PROMPT + routeInstruction;
  let retrieved = false;
  let lastFailure:unknown;
  for (let attempt=0; attempt<models.length; attempt++) {
    const model=models[attempt];
    const system = retrieved ? answeringSystem : planningSystem;
    const started = Date.now();
    const modelSpan=traceStep(env,retrieved?'answer-model':'evidence-planning-model','llm',{requested_model:model,ls_provider:'openrouter',ls_model_name:model});
    modelSpan?.input({messages:[{role:'user',content:question}],language:lang,persona,stage:retrieved?'answer':'plan',route:decision.kind,history_turns:history.length,source_urls:sources.filter(source=>!source.kind).map(source=>source.url),sources:sources.filter(source=>!source.kind).map(source=>({title:source.title,url:source.url}))});
    let usage:unknown,responseCharacters=0;
    let resolvedModel = model;
    const recordModel = (value: unknown) => { if (typeof value === 'string' && /^[a-z0-9][a-z0-9/._:-]{0,159}$/i.test(value)) resolvedModel = value; };
    let failure = 'network_or_timeout'; let status: number | undefined;
    try {
      if (Date.now() >= deadline) throw new DOMException('Request budget exceeded','TimeoutError');
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(Math.max(1,Math.min(CHAT_TIMING.model,deadline-Date.now()))),
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://mpalaourg.dev', 'X-OpenRouter-Title': 'Georgios - Site guide' },
        body: JSON.stringify({ model, temperature: persona === 'fun' ? 0.5 : persona === 'race-engineer' ? 0.2 : 0, max_tokens: 4096, ...(emit ? { stream: true } : {}),
          // This NVIDIA endpoint rejects JSON mode. Request JSON in the prompt
          // and keep the same parser/citation validation for its output.
          ...(model === 'nvidia/nemotron-3-ultra-550b-a55b:free' ? {} : { response_format: { type: 'json_object' } }),
          provider: { require_parameters: true },
          messages: [{ role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ language: lang, stage: retrieved ? 'answer' : 'plan', retrievalAvailable: !retrieved, catalog, reviewedPapers: citationPapers.map(({title,slug,file})=>({title,slug,url:file})), selectedSourceUrls: attached, sources: sources.map((s, i) => ({ id: i + 1, ...s,metadata:evidenceMetadata(s.metadata) })), history, question }) }],
        }),
      });
      status = response.status;
      failure = 'http_error';
      if (!response.ok) throw new Error('provider');
      failure = 'invalid_response';
      let content = '';
      if (emit && response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
        let finished = false, previous = '';
        for await (const event of eventData(response.body)) {
          if (event === '[DONE]') break;
          const chunk = JSON.parse(event);
          recordModel(chunk.model);if(chunk.usage)usage=chunk.usage;
          if (chunk.error) throw new Error('provider_stream_error');
          const choice = chunk.choices?.[0];
          if (choice?.finish_reason) {
            if (choice.finish_reason !== 'stop') { failure = choice.finish_reason === 'length' ? 'truncated_output' : 'invalid_response'; throw new Error('incomplete_response'); }
            finished = true;
          }
          if (typeof choice?.delta?.content === 'string'){content += choice.delta.content;if(choice.delta.content)modelSpan?.token();}
          if (content.length > 16000) throw new Error('model_response_too_large');
          const preview = previewAnswer(content, sources, lang);
          if (preview && !leaksInstructions(preview.answer,system) && preview.answer !== previous) { previous = preview.answer; emit({ type: 'answer', answer: previous }); }
        }
        if (!finished) throw new Error('incomplete_response');
      } else {
        const data = await response.json() as { model?: unknown; choices?: { finish_reason?: string; message?: { content?: string } }[] };
        recordModel(data.model);usage=(data as {usage?:unknown}).usage;
        if (!data.choices?.[0] || data.choices[0].finish_reason === 'length') { failure = data.choices?.[0]?.finish_reason === 'length' ? 'truncated_output' : 'invalid_response'; throw new Error('incomplete_response'); }
        if(data.choices[0].finish_reason && data.choices[0].finish_reason !== 'stop')throw new Error('incomplete_response');
        content = data.choices[0].message?.content || '';
        if(typeof content !== 'string' || content.length>16000)throw new Error('model_response_too_large');
      }
      responseCharacters=content.length;
      const raw = JSON.parse(content);
      const plan = !retrieved ? evidencePlan(raw,catalog,attached) : null;
      if (plan) {
        if(decision.kind!=='factual')throw new Error('unexpected_retrieval');
        modelSpan?.output({messages:[{role:'assistant',content:JSON.stringify({queries:plan.queries,source_urls:plan.sourceUrls,citation_papers:plan.citationPapers})}]});
        modelSpan?.end({model:resolvedModel,ls_model_name:resolvedModel,kind:'retrieval_plan',http_status:status},undefined,usage);
        emit?.({type:'status',phase:'searching'});
        const retrievalSpan=traceStep(env,'retrieve-evidence','retriever');
        const citationSpan=retrievalSpan?.start('Citations · live counts','tool');citationSpan?.input({citation_papers:plan.citationPapers});
        try {
          const [rows,counts]=await Promise.all([
            retrieveChatSources(env.DB!,question,history,attached,lang,plan,{...env,CHAT_TRACE_PARENT:retrievalSpan},Math.min(deadline,Date.now()+12000)),
            citationCountSources(env.DB,plan.citationPapers,attached,lang).then(rows=>{citationSpan?.output({source_count:rows.length});citationSpan?.end();return rows}).catch(error=>{citationSpan?.end({},'citation_lookup_failed',undefined,error);throw error}),
          ]);
          sources=[...counts,...await withSourceImages(env.DB!,rows,{...env,CHAT_TRACE_PARENT:retrievalSpan})];
          retrievalSpan?.output({source_count:sources.length,sources:sources.filter(source=>!source.kind).map(source=>({title:source.title,url:source.url}))});
          retrievalSpan?.end({source_count:sources.length,source_urls:sources.map(source=>source.url)});
        } catch(error) { retrievalSpan?.end({},'retrieval_failed',undefined,error);throw new ChatStorageError('retrieve_sources',error); }
        retrieved=true; attempt--; // One extra evidence step, not another model route.
        emit?.({type:'status',phase:'thinking'}); continue;
      }
      if (typeof raw?.answer==='string' && leaksInstructions(raw.answer,system)) throw new Error('invalid_answer');
      if(decision.kind!=='factual' && raw?.kind!==decision.kind && raw?.kind!=='refusal')throw new Error('unexpected_reply_kind');
      const result = validateAnswer(raw, sources, lang, remainingTurns > 0);
      if (!result) throw new Error('invalid_answer');
      modelSpan?.output({messages:[{role:'assistant',content:result.answer}],model:resolvedModel,sources:result.sources});
      modelSpan?.end({model:resolvedModel,ls_model_name:resolvedModel,kind:raw.kind,http_status:status},undefined,usage);
      const answer={...result,model:resolvedModel};
      return answer;
    } catch (error) {
      lastFailure=error;
      if (error instanceof ChatStorageError){modelSpan?.end({failure:'storage_failure'},'storage_failure',usage,error);throw error;}
      emit?.({ type: 'answer', answer: '' });
      emit?.({ type: 'status', phase: 'thinking' });
      // Never log API keys, prompts, response bodies, messages, or visitor information.
      const errorName = error instanceof Error ? error.name : undefined;
      if (errorName === 'TimeoutError') failure = 'timeout';
      const validation=error instanceof SyntaxError?'invalid_json':error instanceof Error&&['invalid_answer','incomplete_response','model_response_too_large','unexpected_reply_kind','unexpected_retrieval'].includes(error.message)?error.message:undefined;
      modelSpan?.end({model:resolvedModel,ls_model_name:resolvedModel,failure,http_status:status,validation,response_characters:responseCharacters,error_type:errorName},validation||failure,usage,error);
      const cause = error instanceof Error ? error.cause as { code?: unknown } | undefined : undefined;
      const networkCode = typeof cause?.code === 'string' && /^[A-Z0-9_]+$/.test(cause.code) ? cause.code : undefined;
      console.warn('chat_model_attempt_failed', { model, stage:retrieved?'answer':'plan', kind: failure, validation, status, errorName, networkCode, elapsedMs: Date.now() - started, timeoutMs: CHAT_TIMING.model });
    }
  }
  throw new Error('chat_models_unavailable',{cause:lastFailure});
}
