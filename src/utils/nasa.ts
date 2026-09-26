export interface ApodCard {
  date: string;
  title: string;
  summary: string;
  alt: string;
  credit: string;
  mediaType: 'image' | 'video';
  imageUrl: string | null;
  fallbackImageUrl: string | null;
  pageUrl: string;
}

interface NasaApodEntry {
  date?: unknown;
  title?: unknown;
  explanation?: unknown;
  alt?: unknown;
  credit?: unknown;
  copyright?: unknown;
  media_type?: unknown;
  hdurl?: unknown;
  permalink?: unknown;
  url?: unknown;
}

const namedEntities: Record<string, string> = {
  amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

export function plainText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith('#')) {
        const hex = entity[1]?.toLowerCase() === 'x';
        const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return namedEntities[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function publicHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function cardSizedImage(url: string): string {
  const image = new URL(url);
  if (image.hostname === 'assets.science.nasa.gov') {
    image.searchParams.set('w', '960');
    image.searchParams.delete('h');
  }
  return image.href;
}

function firstThought(explanation: string): string {
  const cleaned = explanation.replace(/^Explanation\s*:\s*/i, '');
  if (cleaned.length <= 300) return cleaned;
  const breakAt = cleaned.slice(140, 310).search(/[.!?](?:\s|$)/);
  const end = breakAt >= 0 ? 140 + breakAt + 1 : cleaned.lastIndexOf(' ', 300);
  return `${cleaned.slice(0, end > 0 ? end : 300).trim()}${breakAt >= 0 ? '' : '…'}`;
}

export function normalizeApod(payload: unknown): ApodCard {
  const entry = (Array.isArray(payload) ? payload[0] : payload) as NasaApodEntry | undefined;
  if (!entry || typeof entry !== 'object' || typeof entry.date !== 'string' || typeof entry.title !== 'string') {
    throw new Error('NASA returned an invalid APOD entry');
  }
  const pageUrl = publicHttpsUrl(entry.permalink) ?? publicHttpsUrl(entry.url);
  if (!pageUrl) throw new Error('NASA returned no APOD page URL');

  const originalImage = publicHttpsUrl(entry.hdurl);
  const explanation = plainText(typeof entry.explanation === 'string' ? entry.explanation : '');
  const credit = plainText(typeof entry.credit === 'string' ? entry.credit : typeof entry.copyright === 'string' ? entry.copyright : '');

  return {
    date: entry.date,
    title: plainText(entry.title),
    summary: firstThought(explanation),
    alt: plainText(typeof entry.alt === 'string' ? entry.alt : entry.title),
    credit,
    mediaType: entry.media_type === 'video' ? 'video' : 'image',
    imageUrl: originalImage ? cardSizedImage(originalImage) : null,
    fallbackImageUrl: originalImage,
    pageUrl,
  };
}
