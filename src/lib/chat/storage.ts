import {f1Snapshots,type ChatCitation} from './f1-results-data';
export class ChatStorageError extends Error {
  constructor(public stage: string, cause: unknown) {
    super('Chat storage failed', { cause });
    this.name = 'ChatStorageError';
  }
}

// Inspect errors internally, but never log raw messages: D1 errors may include
// SQL, bound values, questions, or provider response content.
export function storageFailureDetails(error: unknown) {
  const messages: string[] = [];
  let current = error;
  for (let i = 0; i < 4 && current; i++) {
    if (current instanceof Error) { messages.push(current.message); current = current.cause; }
    else { if (typeof current === 'string') messages.push(current); break; }
  }
  const message = messages.join(' ');
  let kind = 'unknown';
  let migration: string | undefined;
  if (/no such (?:table|column)|has no column named/i.test(message)) {
    kind = 'schema_missing';
    if (/\b(?:chat_attempts|replaces_id)\b/i.test(message)) migration='0006_chat_runs.sql';
    else if (/\b(?:context_sources|persona|model|time_zone|chat_(?:threads|messages|usage|knowledge|index_meta|visitors))\b/i.test(message)) migration = '0004_chat.sql';
  } else if (/SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(message)) kind = 'busy';
  else if (/disposed|resetting|reset because|code (?:was )?updated|invalidated|stub.*(?:closed|invalid)/i.test(message)) kind = 'runtime_reset';
  else if (/SQLITE_CORRUPT|SQLITE_NOTADB|database disk image is malformed/i.test(message)) kind = 'corrupt';
  else if (/SQLITE_FULL|database or disk is full|storage limit/i.test(message)) kind = 'storage_limit';
  else if (/SQLITE_CONSTRAINT|constraint failed/i.test(message)) kind = 'constraint';
  else if (/timed?\s*out|timeout|overloaded|temporarily unavailable|D1_ERROR.*internal error/i.test(message)) kind = 'unavailable';
  return { kind, ...(migration ? { migration } : {}) };
}

export function logStorageFailure(stage: string, error: unknown) {
  console.error('chat_storage_failure', { stage, ...storageFailureDetails(error) });
}

export function savedCitations(value: unknown): ChatCitation[] {
  if (typeof value !== 'string' || value.length > 64000) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item === 'object'
      && typeof item.title === 'string' && item.title.length <= 400
      && typeof item.url === 'string' && /^\/(?!\/)[a-z0-9/._-]*$/i.test(item.url)).slice(0, 6)
      .map(item => {const cards=/^\/(?:el\/)?formula\/$/.test(item.url)?f1Snapshots(item.f1Results):[];return {title:item.title,url:item.url,...(cards.length?{f1Results:cards}:{})};});
  } catch { return []; }
}
