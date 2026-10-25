import documents from './documents.json';
export type ChatSource = { title: string; url: string; kind: 'page' | 'file' };
export const MAX_ATTACHED_SOURCES = 5;
const files = new Map(documents.map(document => [document.url, document.title]));
export function isIndexedSource(url: string) {
  return /^\/(?:el\/)?(?:(?:about|projects|publications|formula)(?:\/[a-z0-9_-]+)*\/)?$/i.test(url) || files.has(url);
}
export function sourceLabel(url: string, title: string) {
  return files.get(url) || title.replace(/ — (?:Page|Slide) \d+$/, '').replace(/\s*\|.*$/, '').trim();
}
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function sourceSearchQuery(value: string) {
  const tokens = value.slice(0, 125).normalize('NFC').match(/[\p{L}\p{N}]{1,64}/gu) || [];
  return [...new Set(tokens)].slice(0, 8).map(token => `"${token}"*`).join(' AND ');
}
export function sourceMatches(rows: { title: string; url: string; contentMatch?: boolean }[], query: string, lang: 'en' | 'el'): ChatSource[] {
  const tokens = normalize(query.slice(0, 125)).match(/[\p{L}\p{N}]+/gu) || [];
  const sources = new Map<string, { source: ChatSource; rank: number; order: number }>();
  for (const [order, row] of rows.entries()) {
    if (!isIndexedSource(row.url)) continue;
    const title = sourceLabel(row.url, row.title);
    const matches = (value: string) => tokens.every(token => normalize(value).includes(token));
    const rank = !tokens.length || matches(title) ? 0 : matches(row.url) ? 1 : matches(title + ' ' + row.url) ? 2 : row.contentMatch ? 3 : 4;
    if (rank === 4) continue;
    const source: ChatSource = { title, url: row.url, kind: files.has(row.url) ? 'file' : 'page' };
    const canonical = row.url.replace(/^\/el(?=\/)/, '') || '/';
    const previous = sources.get(canonical);
    if (!previous || rank < previous.rank || (rank === previous.rank && row.url.startsWith('/el/') === (lang === 'el') && previous.source.url.startsWith('/el/') !== (lang === 'el'))) sources.set(canonical, { source, rank, order });
  }
  const priority = (source: ChatSource) => source.kind === 'page' ? source.url.replace(/^\/el(?=\/)/, '').split('/').filter(Boolean).length : source.url.includes('workshop') ? 0 : source.url.includes('resume_') ? 1 : 2;
  const list = [...sources.values()].sort((a, b) => tokens.length ? a.rank - b.rank || a.order - b.order : priority(a.source) - priority(b.source) || Number(b.source.url.startsWith('/el/') === (lang === 'el')) - Number(a.source.url.startsWith('/el/') === (lang === 'el')) || a.source.title.localeCompare(b.source.title, lang)).map(item => item.source);
  // Empty suggestions show a compact mix; searches use the five best matches.
  const visible = tokens.length ? list.slice(0, 5) : [...list.filter(s => s.kind === 'page').slice(0, 3), ...list.filter(s => s.kind === 'file').slice(0, 2)];
  for (const source of list) {
    if (visible.length >= 5) break;
    if (!visible.includes(source)) visible.push(source);
  }
  return [...visible.filter(s => s.kind === 'page'), ...visible.filter(s => s.kind === 'file')];
}
// A trailing @query at the caret is an active picker, not an email address.
export function mentionAt(value: string, caret: number) {
  const match = /(?:^|\s)@([^@\n]*)$/.exec(value.slice(0, caret));
  return match ? { start: caret - match[1].length - 1, end: caret, query: match[1] } : null;
}
