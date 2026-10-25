import { citationResponse } from '../../pages/api/citations';
import type { Source } from './policy';

// Only the site's three reviewed papers can trigger a lookup. Never use a
// visitor's arbitrary DOI/URL as a network destination or enumerate an author.
export const citationPapers = [
  { title: 'Combining Global and Local Attention with Positional Encoding for Video Summarization', doi: '10.1109/ISM52913.2021.00045', file: '/media/files/ism2021_preprint.pdf', slug: 'ism2021' },
  { title: 'Summarizing Videos using Concentrated Attention and Considering the Uniqueness and Diversity of the Video Frames', doi: '10.1145/3512527.3531404', file: '/media/files/icmr2022_preprint.pdf', slug: 'icmr2022' },
  { title: 'Explaining video summarization based on the focus of attention', doi: '10.1109/ISM55400.2022.00029', file: '/media/files/ism2022_preprint.pdf', slug: 'ism2022' },
];

export async function citationCountSources(db: D1Database | undefined, slugs: string[], attached: string[], lang: 'en' | 'el' = 'en', signal?:AbortSignal): Promise<Source[]> {
  const selected = citationPapers.filter(paper => slugs.includes(paper.slug) && (!attached.length || attached.some(url => url === paper.file || url.endsWith(`/publications/${paper.slug}/`))));
  return Promise.all(selected.map(async paper => {
    let data: { citationCount?: unknown; checkedAt?: unknown; stale?: boolean } = {};
    try { data = await (await citationResponse(paper.doi, db,signal)).json(); } catch { signal?.throwIfAborted(); /* Missing evidence is explicit below. */ }
    const dated = typeof data.checkedAt === 'string' && Number.isFinite(Date.parse(data.checkedAt));
    const available = Number.isSafeInteger(data.citationCount) && (data.citationCount as number) >= 0 && dated;
    return {
      kind: 'citation-count', title: lang === 'el' ? 'Αναφορές δημοσιεύσεων · Semantic Scholar' : 'Paper citation counts · Semantic Scholar', url: lang === 'el' ? '/el/publications/' : '/publications/',
      body: available
        ? `${paper.title}. DOI: ${paper.doi}. Semantic Scholar citation count: ${data.citationCount}. Checked at: ${data.checkedAt}. ${data.stale ? 'This is an expired cached observation because the provider is unavailable; explicitly label it as an older count, not current.' : 'This observation is cached for up to 24 hours.'} Name Semantic Scholar and give the checked date in the answer. This is not a Google Scholar count or an all-database total. It is citations received, not references listed by the paper.`
        : `${paper.title}. DOI: ${paper.doi}. A verified, dated citation count is unavailable. Do not invent a number or use zero. Briefly say the count could not be checked.`,
    };
  }));
}
