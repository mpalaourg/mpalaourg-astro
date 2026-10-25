import {registerRun,abortRun,checkRun} from '../../../lib/chat/cancellation';
import {createChatTrace,scheduleTrace} from '../../../lib/chat/tracing';
import type { APIRoute } from 'astro';
import {validTurnstile,localChatHost,type TurnstileVerification} from '../../../lib/chat/turnstile';
import { localDayWindow, validTimeZone } from '../../../lib/chat/time';
import { CONSENT_COOKIE, CONSENT_ACCEPTED } from '../../../lib/chat/consent';
import { chatText } from '../../../lib/chat/copy';
import { LIMITS, CHAT_TIMING } from '../../../lib/chat/policy';
import { generateChatTitle } from '../../../lib/chat/title';
import { isPersona, type Persona } from '../../../lib/chat/personas';
import { ChatStorageError, logStorageFailure, storageFailureDetails, savedCitations } from '../../../lib/chat/storage';
import { answerQuestion, hash, json, readBody, visitorHash, type ChatEnv } from '../../../lib/chat/server';
import { isIndexedSource, sourceMatches, sourceSearchQuery, sourceLabel, MAX_ATTACHED_SOURCES } from '../../../lib/chat/sources';

type Thread = { id: string; title: string; archived: number; questions: number; updated_at: number; persona: Persona };
const idValid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const dayOf = (now: number) => Math.floor(now / 86400000);
const retryHeaders = (seconds: number) => ({ 'Retry-After': String(seconds) });

export const ALL: APIRoute = async ({ request, locals, cookies, url }) => {
  const lang = request.headers.get('X-Chat-Language') === 'el' ? 'el' : 'en';
  const reply = (data: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) => json(
    typeof data.error === 'string' ? { ...data, error: chatText(data.error, lang) } : data, status, headers);
  // Check BEFORE any session cookie, database work, history access, or provider call.
  if (cookies.get(CONSENT_COOKIE)?.value !== CONSENT_ACCEPTED) return reply({ error: 'Accept cookies to use the chat.', code: 'consent_required' }, 403);

  const env = (locals as { runtime?: { env: ChatEnv } }).runtime?.env as ChatEnv | undefined;
  if (!env?.DB) return reply({ error: 'The site guide is not configured yet.' }, 503);
  const db = env.DB;
  const challengeRequired = env.CHAT_REQUIRE_TURNSTILE !== 'false';
  const enabled = (!challengeRequired || (!!env.TURNSTILE_SITE_KEY && !!env.TURNSTILE_SECRET_KEY)) && env.CHAT_ENABLED === 'true' && !!env.OPENROUTER_API_KEY && !!env.CHAT_MODEL && (env.CHAT_IP_SECRET?.length || 0) >= 32;
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
  if (request.method === 'POST' && request.headers.get('origin') !== url.origin) return reply({ error: 'Request origin rejected.' }, 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Cross-site request rejected.' }, 403);
  const cookieName = url.protocol === 'https:' ? '__Host-site_chat' : 'site_chat';
  let token = cookies.get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (request.method !== 'GET') return reply({ error: 'Open the site guide before sending a request.' }, 401);
    token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  }
  cookies.set(cookieName, token, { httpOnly: true, secure: url.protocol === 'https:', sameSite: 'strict', path: '/', maxAge: 30 * 86400 });
  const owner = await hash(token);
  const now = Date.now(), day = dayOf(now);
  // CF-Connecting-IP is supplied by Cloudflare, never trust X-Forwarded-For.
  const ip = request.headers.get('CF-Connecting-IP') || (localChatHost(url.hostname) ? 'local-development' : '');
  const visitorKey = env.CHAT_IP_SECRET && ip ? await visitorHash(env.CHAT_IP_SECRET, ip, -1) : '';
  let stage = 'housekeeping';
  const suggestedZone = validTimeZone(request.headers.get('X-Chat-Time-Zone')) || validTimeZone((request as Request & { cf?: { timezone?: string } }).cf?.timezone) || 'UTC';
  try {
    if (request.method === 'GET' && url.searchParams.has('sources')) {
      stage = 'list_sources';
      const term = (url.searchParams.get('sources') || '').slice(0, 125), query = sourceSearchQuery(term);
      if (term.trim() && !query) return reply({ sources: [] });
      const [catalog, content] = await Promise.all([
        db.prepare('SELECT MIN(title) AS title,url FROM chat_knowledge GROUP BY url LIMIT 5000').all<{ title: string; url: string }>(),
        query ? db.prepare('SELECT title,url FROM chat_knowledge WHERE chat_knowledge MATCH ? ORDER BY bm25(chat_knowledge, 3, 0, 1) LIMIT 1000').bind(query).all<{ title: string; url: string }>() : Promise.resolve({ results: [] }),
      ]);
      return reply({ sources: sourceMatches([...content.results.map(source => ({ ...source, contentMatch: true })), ...catalog.results], term, lang) });
    }
    await db.batch([
      db.prepare('DELETE FROM chat_threads WHERE updated_at < ?').bind(now - 30 * 86400000),
      db.prepare('DELETE FROM chat_usage WHERE day < ?').bind(day - 2),
      db.prepare('DELETE FROM chat_attempts WHERE created_at < ?').bind(now-2*86400000),
      db.prepare('DELETE FROM chat_visitors WHERE updated_at < ?').bind(now - 48 * 3600000),
      db.prepare("UPDATE chat_messages SET status='failed',answer=? WHERE status='pending' AND created_at < ?").bind('The request was interrupted. Please ask again.', now - CHAT_TIMING.pending),
    ]);
    stage = 'visitor_profile';
    if (visitorKey) await db.prepare(`INSERT INTO chat_visitors(visitor,time_zone,updated_at) VALUES(?,?,?)
      ON CONFLICT(visitor) DO UPDATE SET updated_at=excluded.updated_at`).bind(visitorKey, suggestedZone, now).run();
    const profile = visitorKey ? await db.prepare('SELECT time_zone FROM chat_visitors WHERE visitor=?').bind(visitorKey).first<{ time_zone: string }>() : null;
    const timeZone = profile?.time_zone || suggestedZone;
    const localWindow = localDayWindow(now, timeZone);
    const visitor = visitorKey ? await visitorHash(env.CHAT_IP_SECRET!, ip, localWindow.day) : '';
    if (request.method === 'GET') {
      if (url.searchParams.has('id')) {
        const id = url.searchParams.get('id');
        if (!idValid(id)) return reply({ error: 'Invalid conversation.' }, 400);
        stage = 'read_thread';
        const thread = await db.prepare('SELECT id,title,archived,questions,updated_at,persona FROM chat_threads WHERE id=? AND owner=?').bind(id, owner).first<Thread>();
        if (!thread) return reply({ error: 'Conversation not found.' }, 404);
        stage = 'read_messages';
        const messages = await db.prepare("SELECT id,question,answer,sources,model,status,created_at,persona,context_sources FROM chat_messages WHERE thread_id=? AND status<>'superseded' ORDER BY created_at,id").bind(id).all();
        return reply({ thread, messages: messages.results.map(m => ({ ...m, answer: m.status === 'failed' && typeof m.answer === 'string' ? chatText(m.answer, lang) : m.answer, sources: savedCitations(m.sources), context_sources: savedCitations(m.context_sources) })) });
      }
      stage = 'list_threads';
      const threads = await db.prepare('SELECT id,title,archived,questions,updated_at,persona FROM chat_threads WHERE owner=? ORDER BY updated_at DESC LIMIT 50').bind(owner).all<Thread>();
      stage = 'read_usage';
      const usage = visitor ? await db.prepare('SELECT (SELECT COUNT(*) FROM chat_usage WHERE visitor=?) AS visitor, (SELECT COUNT(*) FROM chat_usage WHERE day=?) AS total').bind(visitor, day).first<{ total: number; visitor: number }>() : null;
      stage = 'read_index';
      const index = await db.prepare('SELECT version,indexed_at FROM chat_index_meta WHERE id=1').first();
      return reply({ threads: threads.results, enabled: enabled && !!index && !!visitor, remaining: Math.max(0, LIMITS.visitor - (usage?.visitor || 0)), globalRemaining: Math.max(0, LIMITS.daily - (usage?.total || 0)), limits: LIMITS, resetsAt: localWindow.resetsAt, globalResetsAt: (day + 1) * 86400000, timeZone, indexedAt: index?.indexed_at || null, turnstileSiteKey: challengeRequired ? env.TURNSTILE_SITE_KEY || null : null });
    }
    let body;
    try { body = await readBody(request); } catch { return reply({ error: 'Send a JSON request of at most 4 KB.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'Invalid request.' }, 400);
    const { action, id } = body;
    if (['create', 'ask', 'persona'].includes(action) && body.persona !== undefined && !isPersona(body.persona)) return reply({ error: 'Choose an available answer style.' }, 400);
    if (action === 'create') {
      stage = 'create_thread';
      if (!enabled || !visitor) return reply({ error: 'The site guide is currently unavailable.' }, 503);
      if (id !== undefined && !idValid(id)) return reply({ error: 'Invalid conversation.' }, 400);
      const threadId = id || crypto.randomUUID();
      const existing = await db.prepare('SELECT owner FROM chat_threads WHERE id=?').bind(threadId).first<{ owner: string }>();
      if (existing) return existing.owner === owner ? reply({ id: threadId }, 200) : reply({ error: 'Invalid conversation.' }, 400);
      const result = await db.prepare(`INSERT OR IGNORE INTO chat_threads(id,owner,title,created_at,updated_at,persona)
        SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM chat_threads WHERE owner=?) < 50
        AND (SELECT COUNT(*) FROM chat_threads) < 5000`).bind(threadId, owner, 'New conversation', now, now, body.persona || 'baseline', owner).run();
      if (!result.meta.changes) {
        const concurrent = await db.prepare('SELECT owner FROM chat_threads WHERE id=?').bind(threadId).first<{ owner: string }>();
        if (concurrent?.owner === owner) return reply({ id: threadId }, 200);
        return reply({ error: 'Conversation storage is full. Delete an old conversation and try again.' }, 429);
      }
      return reply({ id: threadId }, 201);
    }
    if (action === 'clear') {
      stage = 'clear_history';
      await db.prepare('DELETE FROM chat_threads WHERE owner=?').bind(owner).run();
      return reply({ ok: true });
    }
    if (!idValid(id)) return reply({ error: 'Invalid conversation.' }, 400);
    stage = 'lookup_thread';
    const thread = await db.prepare('SELECT id,title,archived,questions,updated_at,persona FROM chat_threads WHERE id=? AND owner=?').bind(id, owner).first<Thread>();
    if (!thread) return reply({ error: 'Conversation not found.' }, 404);
    if (action === 'cancel') {
      if (!idValid(body.requestId)) return reply({error:'Invalid request.'},400);
      const stopped=await db.prepare("UPDATE chat_messages SET status='cancelled',answer='Response stopped.',sources='[]',model=NULL WHERE id=? AND thread_id=? AND status='pending'").bind(body.requestId,id).run();
      if(stopped.meta.changes)abortRun(body.requestId);
      const message=await db.prepare('SELECT status FROM chat_messages WHERE id=? AND thread_id=?').bind(body.requestId,id).first<{status:string}>();
      if(!message)return reply({error:'Message not found.'},404);
      return reply({ok:true,status:message.status});
    }
    if (action === 'persona') {
      stage = 'change_persona';
      if (!isPersona(body.persona)) return reply({ error: 'Choose an available answer style.' }, 400);
      const result = await db.prepare(`UPDATE chat_threads SET persona=? WHERE id=? AND owner=?
        AND NOT EXISTS (SELECT 1 FROM chat_messages WHERE thread_id=? AND status='pending')`).bind(body.persona, id, owner, id).run();
      if (!result.meta.changes) return reply({ error: 'A question is already being processed. Refresh the conversation shortly.' }, 409);
      return reply({ ok: true });
    }
    if (action === 'delete') {
      stage = 'delete_thread';
      await db.prepare('DELETE FROM chat_threads WHERE id=? AND owner=?').bind(id, owner).run();
      return reply({ ok: true });
    }
    if (action === 'archive') {
      stage = 'archive_thread';
      if (typeof body.archived !== 'boolean') return reply({ error: 'Invalid archive state.' }, 400);
      await db.prepare('UPDATE chat_threads SET archived=?,updated_at=? WHERE id=? AND owner=?').bind(Number(body.archived), now, id, owner).run();
      return reply({ ok: true });
    }
    if (action === 'rename') {
      stage = 'rename_thread';
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 80) return reply({ error: 'Use a title of 1–80 characters.' }, 400);
      await db.prepare('UPDATE chat_threads SET title=?,updated_at=? WHERE id=? AND owner=?').bind(body.title.trim(), now, id, owner).run();
      return reply({ ok: true });
    }
    if (action !== 'ask') return reply({ error: 'Unknown action.' }, 400);
    if (!enabled || !visitor) return reply({ error: 'The site guide is currently unavailable.' }, 503);
    const { question, requestId, replaceMessageId } = body;
    if(replaceMessageId!==undefined&&!idValid(replaceMessageId))return reply({error:'Invalid message replacement.'},400);
    if(replaceMessageId===requestId)return reply({error:'Invalid message replacement.'},400);
    const attached = body.sourceUrls ?? [];
    if (!Array.isArray(attached) || attached.length > MAX_ATTACHED_SOURCES || attached.some(url => typeof url !== 'string' || !isIndexedSource(url)) || new Set(attached).size !== attached.length) return reply({ error: 'Choose up to five pages or files from the source menu.' }, 400);
    const persona: Persona = body.persona || thread.persona;
    if (!idValid(requestId) || typeof question !== 'string' || !question.trim() || question.length > LIMITS.question) return reply({ error: `Ask a question of 1–${LIMITS.question} characters.` }, 400);
    stage = 'check_request';
    const existing = await db.prepare('SELECT id,thread_id,status FROM chat_messages WHERE id=?').bind(requestId).first();
    if (existing) {
      if (existing.thread_id !== id) return reply({ error: 'Request ID already used.' }, 409);
      return reply({ ok: true, status: existing.status }, existing.status === 'pending' ? 202 : 200);
    }
    stage = 'validate_sources';
    const contextSources = [];
    for (const sourceUrl of attached) {
      const source = await db.prepare('SELECT title,url FROM chat_knowledge WHERE url=? LIMIT 1').bind(sourceUrl).first<{ title: string; url: string }>();
      if (!source) return reply({ error: 'That source is no longer available. Please choose it again.' }, 400);
      contextSources.push({ title: sourceLabel(source.url, source.title), url: source.url });
    }
    if (challengeRequired) {
      stage = 'bot_verification';
      if (typeof body.challengeToken !== 'string' || body.challengeToken.length > 2048 || !body.challengeToken) return reply({ error: 'Please complete the bot check before asking.' }, 403);
      const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', signal: AbortSignal.timeout(8000),
        body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!, response: body.challengeToken, remoteip: ip }),
      });
      const checked = await verification.json() as TurnstileVerification;
      if (!verification.ok || !validTurnstile(checked,url.hostname,env.TURNSTILE_SITE_KEY!,env.TURNSTILE_SECRET_KEY!)) return reply({ error: 'The bot check expired or failed. Please try again.' }, 403);
    }
    stage = 'read_index';
    if (!await db.prepare('SELECT id FROM chat_index_meta WHERE id=1').first()) return reply({ error: 'The site guide is waiting for its content index.' }, 503);
    let replacement: {status:string}|null=null;
    if(replaceMessageId){
      replacement=await db.prepare("SELECT id,status FROM chat_messages WHERE thread_id=? AND status<>'superseded' ORDER BY created_at DESC,id DESC LIMIT 1").bind(id).first<{id:string;status:string}>().then(row=>row?.id===replaceMessageId?row:null);
      if(!replacement||replacement.status==='pending')return reply({error:'Only the latest stopped or completed message can be edited.'},409);
    }
    const previousQuestions=thread.questions-(replacement?.status==='done'?1:0);
    const needsTitle = previousQuestions === 0 && thread.title === 'New conversation';
    const fallbackTitle = question.trim().replace(/\s+/g, ' ').slice(0, 64);
    // Reserve atomically. Unsuccessful runs release their reservation through
    // a status trigger; completed replacements retain their daily usage.
    try {
      stage = 'reserve_question';
      await db.batch([
        ...(replaceMessageId?[db.prepare("UPDATE chat_messages SET status='superseded' WHERE id=? AND thread_id=? AND status IN ('done','failed','cancelled') AND id=(SELECT id FROM chat_messages WHERE thread_id=? AND status<>'superseded' ORDER BY created_at DESC,id DESC LIMIT 1)").bind(replaceMessageId,id,id)]:[]),
        db.prepare('INSERT INTO chat_usage(id,thread_id,visitor,day,created_at) VALUES(?,?,?,?,?)').bind(requestId, id, visitor, day, now),
        db.prepare('INSERT INTO chat_messages(id,thread_id,question,created_at,persona,context_sources,replaces_id) VALUES(?,?,?,?,?,?,?)').bind(requestId, id, question.trim(), now, persona, JSON.stringify(contextSources),replaceMessageId||null),
        db.prepare('UPDATE chat_threads SET persona=? WHERE id=? AND owner=?').bind(persona, id, owner),
        ...(needsTitle ? [db.prepare("UPDATE chat_threads SET title=? WHERE id=? AND owner=? AND title='New conversation'").bind(fallbackTitle, id, owner)] : []),
      ]);
    } catch (error) {
      const message = String(error);
      const resetSeconds = Math.ceil(((day + 1) * 86400000 - now) / 1000);
      if (message.includes('chat_global_limit')) return reply({ error: 'The site’s 200 daily questions have been used. Please return tomorrow.' }, 429, retryHeaders(resetSeconds));
      if (message.includes('chat_visitor_limit')) return reply({ error: 'You’ve used your 10 daily questions. Please return tomorrow.' }, 429, retryHeaders(Math.ceil((localWindow.resetsAt - now) / 1000)));
      if (message.includes('chat_burst_limit')) return reply({ error: 'Please wait a minute before asking another question.' }, 429, retryHeaders(60));
      if (message.includes('chat_thread_limit')) return reply({ error: 'Start a new conversation to continue. Each chat allows four questions.' }, 409);
      if(message.includes('chat_invalid_replacement'))return reply({error:'The latest message changed. Reopen the conversation and try again.'},409);
      if (message.includes('chat_busy') || message.includes('UNIQUE')) return reply({ error: 'A question is already being processed. Refresh the conversation shortly.' }, 409);
      throw error;
    }
    const context = (locals as { runtime?: { ctx?: { waitUntil(promise: Promise<unknown>): void } } }).runtime?.ctx;
    const trace=createChatTrace(env,{threadId:id,requestId,question:question.trim(),language:body.lang==='el'?'el':'en',persona,hostname:url.hostname});
    const controller=new AbortController();
    const unregister=registerRun(requestId,controller);
    let checking=false;
    const watch=setInterval(async()=>{
      if(checking||controller.signal.aborted)return;
      checking=true;
      try{const row=await db.prepare('SELECT status FROM chat_messages WHERE id=?').bind(requestId).first<{status:string}>();if(!row||row.status!=='pending')controller.abort(new DOMException('Run stopped','AbortError'));}
      catch(error){trace?.start('D1 · run state','tool').end({stage:'watch_run'},'storage_failure',undefined,error);logStorageFailure('watch_run',error);controller.abort(new DOMException('Run state unavailable','AbortError'));}
      finally{checking=false;}
    },750);
    const tracedEnv={...env,CHAT_TRACE:trace,CHAT_ABORT_SIGNAL:controller.signal};
    let titleTask: Promise<void> = Promise.resolve();
    const generate = async (emit?: (event: import('../../../lib/chat/stream').ChatStreamEvent) => void) => {
      // The title is its own persisted task. It can finish before OR after the
      // answer, and a later question must not cancel it by touching updated_at.
      titleTask = needsTitle ? (async () => {
        let titleSave:ReturnType<NonNullable<typeof trace>['start']>|undefined;
        try {
          const pages = attached.length
            ? await db.prepare('SELECT title,body FROM chat_knowledge WHERE url=? LIMIT 3').bind(attached[0]).all<{ title: string; body: string }>()
            : {results:[]};
          const title = await generateChatTitle(tracedEnv, question.trim(), body.lang === 'el' ? 'el' : 'en', pages.results);
          if (!title || controller.signal.aborted) return; // The first-question fallback is already durable.
          // A manual rename to a different value wins; normal conversation
          // activity and concurrent chats do not suppress a generated title.
          titleSave=trace?.start('Background · save title','tool');titleSave?.input({title});
          const saved = await db.prepare('UPDATE chat_threads SET title=? WHERE id=? AND owner=? AND title=?').bind(title, id, owner, fallbackTitle).run();
          titleSave?.output({saved:!!saved.meta.changes,status:saved.meta.changes?'saved':'manual_title_preserved'});titleSave?.end();
          if (saved.meta.changes) emit?.({ type: 'title', id, title });
        } catch (error) { titleSave?.end({stage:'save_title',...storageFailureDetails(error)},'title_save_failed',undefined,error);logStorageFailure('save_title', error); }
      })() : Promise.resolve();
      context?.waitUntil(titleTask);
      const answerSpan=trace?.start('Answer pipeline','chain');
      answerSpan?.input({question:question.trim(),language:body.lang==='el'?'el':'en',persona,attachment_count:attached.length,remaining_turns:Math.max(0,LIMITS.thread-previousQuestions-1)});
      if(trace&&context)scheduleTrace(()=>trace.publish(),context);
      let saveSpan:ReturnType<NonNullable<typeof trace>['start']>|undefined;
      try {
        checkRun(tracedEnv);
        stage = 'answer_history';
        const history = await db.prepare("SELECT question,answer,sources FROM chat_messages WHERE thread_id=? AND id<>? AND status='done' ORDER BY created_at LIMIT 3").bind(id, requestId).all<{ question: string; answer: string | null; sources: string }>();
        stage = 'generate_answer';
        const answerEnv={...tracedEnv,CHAT_TRACE_PARENT:answerSpan};
        const trackedEmit=emit?((event:import('../../../lib/chat/stream').ChatStreamEvent)=>{if(event.type==='answer'&&event.answer)trace?.firstAnswer();emit(event)}):undefined;
        const result = await answerQuestion(answerEnv, question.trim(), history.results.map(item => ({ ...item, sources: savedCitations(item.sources).map(({title,url})=>({title,url})) })), body.lang === 'el' ? 'el' : 'en', trackedEmit, persona, attached, Math.max(0, LIMITS.thread - previousQuestions - 1));
        checkRun(tracedEnv);
        stage = 'save_answer';
        saveSpan=answerSpan?.start('D1 · save reply','tool');saveSpan?.input({status:'done'});
        const savedAnswer=await db.prepare("UPDATE chat_messages SET answer=?,sources=?,model=?,status='done' WHERE id=? AND status='pending'").bind(result.answer, JSON.stringify(result.sources), result.model, requestId).run();
        if(!savedAnswer.meta.changes){controller.abort(new DOMException('Run stopped','AbortError'));checkRun(tracedEnv);}
        clearInterval(watch);unregister();
        saveSpan?.output({saved:true,status:'done'});saveSpan?.end();
        answerSpan?.output({messages:[{role:'assistant',content:result.answer}],model:result.model,sources:result.sources});answerSpan?.end();
        trace?.result(result);if(trace&&context)scheduleTrace(()=>trace.publish(),context);
        if (body.stream !== true) await titleTask;
        emit?.({ type: 'done', ...result });
        return reply({ ok: true, status: 'done' });
      } catch (cause) {
        if(controller.signal.aborted){
          await db.prepare("UPDATE chat_messages SET status='cancelled',answer='Response stopped.',sources='[]',model=NULL WHERE id=? AND status='pending'").bind(requestId).run();
          answerSpan?.end({cancelled:true});trace?.annotate({cancelled:true});
          emit?.({type:'cancelled'});
          return reply({ok:true,status:'cancelled'});
        }
        const storageFailure = cause instanceof ChatStorageError || stage !== 'generate_answer';
        const failureDetails={stage:cause instanceof ChatStorageError?cause.stage:stage,kind:storageFailure?storageFailureDetails(cause).kind:'models_unavailable',http_status:502};
        saveSpan?.end(failureDetails,'save_reply_failed',undefined,cause);answerSpan?.end(failureDetails,storageFailure?'storage_failure':'provider_failure',undefined,cause);trace?.fail(failureDetails,cause);
        if(trace&&context)scheduleTrace(()=>trace.publish(),context);
        if (storageFailure) logStorageFailure(cause instanceof ChatStorageError ? cause.stage : stage, cause);
        else console.error('chat_provider_failure', { requestId });
        if (body.stream !== true) await titleTask;
        const error = 'The guide could not answer this time. Please try again later.';
        try {
          await db.prepare("UPDATE chat_messages SET answer=?,status='failed' WHERE id=? AND status='pending'").bind('The guide could not answer this time. Please try again later.', requestId).run();
        } catch (error) { logStorageFailure('save_failed_answer', error); }
        emit?.({ type: 'error', error: chatText(error, lang), recorded: true });
        return reply({ error, recorded: true }, 502);
      } finally {
        clearInterval(watch);unregister();
        if(trace)scheduleTrace(()=>Promise.allSettled([titleTask]).then(()=>trace.flush()),context);
      }
    };
    if (body.stream === true) {
      let connected = true;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const emit = (event: import('../../../lib/chat/stream').ChatStreamEvent) => {
            if (connected) try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
            catch { connected = false; }
          };
          emit({ type: 'status', phase: 'searching' });
          const answerTask = generate(emit);
          const work = Promise.all([answerTask, titleTask]).finally(() => { if (connected) try { controller.close(); } catch { connected = false; } });
          // Keep persistence running even if the visitor navigates away mid-answer.
          context?.waitUntil(work);
          return work;
        },
        cancel() { connected = false; },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'private, no-store, no-transform', 'X-Accel-Buffering': 'no' } });
    }
    return await generate();
  } catch (error) {
    const diagnostic=createChatTrace(env,{threadId:crypto.randomUUID(),requestId:crypto.randomUUID(),question:'',language:lang,persona:'baseline',hostname:url.hostname});
    diagnostic?.fail({stage,...(stage==='bot_verification'?{kind:'bot_verification_unavailable'}:storageFailureDetails(error)),http_status:503},error);
    if(diagnostic)scheduleTrace(()=>diagnostic.flush(),(locals as {runtime?:{ctx?:{waitUntil(p:Promise<unknown>):void}}}).runtime?.ctx);
    if (stage === 'bot_verification') {
      console.warn('chat_bot_check_failure');
      return reply({ error: 'The bot check expired or failed. Please try again.' }, 503);
    }
    logStorageFailure(stage, error);
    return reply({ error: 'The site guide is temporarily unavailable.' }, 503);
  }
};
