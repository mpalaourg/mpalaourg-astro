import type {ChatCitation} from './f1-results-data';
// Both upstream model events and our browser response use SSE over fetch.
export async function* eventData(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', data: string[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 65536) throw new Error('stream_event_too_large');
      if (done && buffer && !buffer.endsWith('\n')) buffer += '\n';
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
        if (!line) { if (data.length) { yield data.join('\n'); data = []; } }
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.join('\n').length > 65536) throw new Error('stream_event_too_large');
      if (done) { if (data.length) yield data.join('\n'); break; }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export type ChatStreamEvent =
  | { type: 'cancelled' }
  | { type: 'title'; id: string; title: string }
  | { type: 'status'; phase: 'searching' | 'thinking' }
  | { type: 'answer'; answer: string }
  | { type: 'done'; answer: string; sources: ChatCitation[]; model: string | null }
  | { type: 'error'; error: string; recorded: boolean };
