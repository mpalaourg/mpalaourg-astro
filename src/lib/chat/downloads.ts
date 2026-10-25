import documents from './documents.json';
import { zipSync } from 'fflate';

const publicFiles = new Map(documents.map(file => [file.url, file]));
export function replyFiles(sources: { url: string }[]) {
  return [...new Set(sources.map(source => source.url))].flatMap(url => {
    const file = publicFiles.get(url);
    return file ? [{ url, title: file.title, filename: url.split('/').at(-1)! }] : [];
  }).slice(0, 6);
}

// Only reviewed same-origin files can enter an archive. Bound memory use and
// reject redirects/error pages rather than packaging an arbitrary URL or HTML.
export async function replyZip(sources: { url: string }[], signal?: AbortSignal): Promise<Uint8Array> {
  const files = replyFiles(sources);
  if (files.length < 2) throw new Error('Multiple files required');
  const entries: Record<string, Uint8Array> = {};
  let total = 0;
  for (const file of files) {
    const response = await fetch(file.url, { credentials: 'omit', redirect: 'error', signal, cache: 'force-cache' });
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > 25 * 1024 * 1024) throw new Error('Download unavailable');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length; total += value.length;
        if (size > 25 * 1024 * 1024 || total > 64 * 1024 * 1024) throw new Error('Download too large');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel(); throw error; }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const pdf = file.filename.endsWith('.pdf');
    if (pdf ? new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-' : bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Invalid document');
    entries[file.filename] = bytes;
  }
  signal?.throwIfAborted();
  // PDFs and PPTX files are compressed already; storing avoids re-compression.
  return zipSync(entries, { level: 0 });
}
