import documents from './documents.json';

const SITE_BASE = 'https://mpalaourg.dev';

// Only navigable web URLs. No credentials, hidden control characters or
// backslash normalization that can disguise the destination hostname.
export function safeChatLink(value: string): string | null {
  if (!value || /[\s\u0000-\u001f\u007f\\]/u.test(value) || value.length > 2048) return null;
  if (!/^https?:\/\//i.test(value) && !/^\/(?!\/)/.test(value) && !value.startsWith('#')) return null;
  try {
    const url = new URL(value, SITE_BASE);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return value.startsWith('/') || value.startsWith('#') ? value : url.href;
  } catch { return null; }
}

export function externalChatDestination(value: string, base = SITE_BASE): string | null {
  const href = safeChatLink(value);
  if (!href || href.startsWith('/') || href.startsWith('#')) return null;
  const host = new URL(href, base).hostname.toLowerCase().replace(/\.$/, '');
  return ['mpalaourg.dev', 'mpalaourg.me'].some(domain => host === domain || host.endsWith('.' + domain)) ? null : host;
}

// Bare URLs are linked only in prose, never inside literal code or math.
export function bareChatLinks(value: string): { text: string; href?: string }[] {
  const result: { text: string; href?: string }[] = [];
  let at = 0;
  for (const match of value.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    let url = match[0].replace(/[.,;:!?]+$/, '');
    while (url.endsWith(')') && (url.match(/\)/g)?.length || 0) > (url.match(/\(/g)?.length || 0)) url = url.slice(0, -1);
    while (url.endsWith(']')) url = url.slice(0, -1);
    const start = match.index!;
    if (start > at) result.push({ text: value.slice(at, start) });
    const href = safeChatLink(url);
    result.push({ text: url, ...(href ? { href } : {}) });
    at = start + url.length;
  }
  if (at < value.length) result.push({ text: value.slice(at) });
  return result;
}

const presentationPaths = new Set(documents.filter(document => document.url.endsWith('.pptx')).map(document => document.url));

// Citation titles retain the indexed physical PDF page or slide, including in saved
// conversations. Keep navigation fragments out of canonical source identities.
export function chatCitationHref(source: { title: string; url: string }): string | null {
  if (!/^\/(?!\/)[a-z0-9/._-]*$/i.test(source.url)) return null;
  if (presentationPaths.has(source.url)) {
    // Use the deployed public file even during local development: Microsoft's
    // servers cannot retrieve localhost. Canonical IDs and downloads stay local.
    const viewer = new URL('https://view.officeapps.live.com/op/embed.aspx');
    viewer.searchParams.set('src', new URL(source.url, SITE_BASE).href);
    const slide = source.title.match(/ — Slide ([1-9]\d*)$/)?.[1];
    if (slide && Number.isSafeInteger(Number(slide))) viewer.searchParams.set('wdSlideIndex', slide);
    return viewer.href;
  }
  const page = source.title.match(/ — Page ([1-9]\d*)$/)?.[1];
  return /\.pdf$/i.test(source.url) && page && Number.isSafeInteger(Number(page))
    ? `${source.url}#page=${page}` : source.url;
}

// Recover a download only from our exact viewer endpoint and known public deck.
export function officePresentationFile(href: string): string | null {
  if (!safeChatLink(href)) return null;
  try {
    const viewer = new URL(href);
    if (viewer.origin !== 'https://view.officeapps.live.com' || viewer.pathname !== '/op/embed.aspx' || viewer.searchParams.getAll('src').length !== 1) return null;
    const file = new URL(viewer.searchParams.get('src') || '');
    return file.origin === SITE_BASE && !file.search && !file.hash && !file.username && !file.password && presentationPaths.has(file.pathname) ? file.pathname : null;
  } catch { return null; }
}
