import { mkdir, writeFile } from 'node:fs/promises';

// Editorial diagrams of the implemented pipeline, without operational settings
// or synthetic benchmark/latency values. Re-run after architecture changes.
const directory = new URL('../public/projects/site-assistant/', import.meta.url);
await mkdir(directory, { recursive: true });
const ink = '#0f172a', muted = '#475569', line = '#94a3b8', accent = '#c2410c';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const text = (x, y, value, { size = 22, fill = ink, weight = 400, anchor = 'start' } = {}) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${escape(value)}</text>`;
const box = (x, y, w, h, title, rows = [], highlight = false) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${highlight ? '#fff7ed' : '#f8fafc'}" stroke="${highlight ? '#fb923c' : '#cbd5e1'}" stroke-width="1.5"/>${text(x + 20, y + 35, title, { size: 24, weight: 650 })}${rows.map((row, i) => text(x + 20, y + 66 + i * 27, row, { size: 19, fill: muted })).join('')}`;
const arrow = (path, { dashed = false, color = accent } = {}) => `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" ${dashed ? 'stroke-dasharray="6 6"' : ''} marker-end="url(#${color === accent ? 'arrow' : 'gray-arrow'})"/>`;
const rule = (path, dashed = false) => `<path d="${path}" fill="none" stroke="${line}" stroke-width="1.5" ${dashed ? 'stroke-dasharray="5 7"' : ''}/>`;
const figure = (height, title, description, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" role="img" aria-labelledby="title description">
<title id="title">${escape(title)}</title><desc id="description">${escape(description)}</desc>
<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M1 1L7 4L1 7" fill="none" stroke="${accent}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker><marker id="gray-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M1 1L7 4L1 7" fill="none" stroke="${muted}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<rect width="1200" height="${height}" rx="16" fill="#ffffff"/>
<g font-family="DejaVu Sans, sans-serif" stroke-linecap="round" stroke-linejoin="round">
${text(40, 47, title, { size: 27, weight: 650 })}
${content}
</g></svg>\n`;

await writeFile(new URL('ingestion.svg', directory), figure(570, 'From source documents to retrieval records',
  'HTML, PDF and PPTX sources are extracted before deployment, split into parent chunks and smaller passages, and stored in D1 and Pinecone with shared identities and version metadata.', [
    box(40, 95, 205, 165, 'Sources', ['HTML pages', 'PDF documents', 'PPTX slides']),
    box(310, 95, 255, 165, 'Extract text', ['HTML editorial text', 'Docling page text', 'Visible slide text']),
    box(630, 95, 245, 165, 'Parent chunks', ['Source context', 'Page / slide location', 'Source identity'], true),
    arrow('M245 178H298'), arrow('M565 178H618'),
    box(940, 95, 220, 165, 'D1 corpus', ['Canonical text', 'Citation URLs', 'Source metadata']),
    arrow('M875 178H928'),
    box(630, 340, 245, 128, 'Child passages', ['Smaller inputs', 'Linked to parent IDs']),
    arrow('M752 260V328'),
    box(940, 340, 220, 128, 'Pinecone', ['Multilingual vectors', 'BM25 title + body']),
    arrow('M875 402H928'),
    text(40, 344, 'Shared provenance', { size: 21, weight: 650 }),
    text(40, 380, 'Language · Document type · Section', { size: 19, fill: muted }),
    text(40, 411, 'Source checksum · Corpus version', { size: 19, fill: muted }),
    rule('M40 503H1160'),
    text(40, 540, 'Preparation happens before deployment; requests retrieve prepared text.', { size: 21, fill: muted }),
  ].join('\n')));

await writeFile(new URL('retrieval.svg', directory), figure(600, 'Hybrid retrieval and context assembly',
  'The same filtered query runs through dense semantic and BM25 searches. RRF combines rankings, result IDs resolve to canonical D1 text, and an optional reranker reorders those candidates before context assembly. Skipped reranking retains fusion order; search failure uses D1 keyword retrieval.', [
    box(40, 222, 160, 100, 'Query', ['Scope']),
    box(255, 110, 225, 112, 'Semantic', ['Related meaning', 'Cross-language']),
    box(255, 332, 225, 112, 'BM25 search', ['Title and body', 'Term relevance']),
    rule('M220 166V388'), arrow('M200 272H220V166H243'), arrow('M220 388H243'),
    `<path d="M480 166H510V388H480" fill="none" stroke="${accent}" stroke-width="2"/>`, arrow('M510 272H535'),
    box(547, 222, 145, 100, 'RRF', ['Rank fusion'], true),
    arrow('M692 272H723'),
    box(735, 222, 180, 100, 'D1 text', ['Canonical rows']),
    arrow('M915 272H948'),
    box(960, 222, 200, 100, 'Reranker', ['Optional']),
    arrow('M1060 322V368'),
    box(960, 380, 200, 100, 'Context', ['Selected evidence']),
    arrow('M825 322V430H948', { dashed: true }),
    text(790, 509, 'Reranker skipped: keep RRF order', { size: 18, fill: accent, anchor: 'middle' }),
    rule('M40 546H1160'),
    text(40, 579, 'Pinecone search failure → D1 keyword-only retrieval. Empty results remain empty.', { size: 20, fill: muted }),
  ].join('\n')));

await writeFile(new URL('streaming.svg', directory), figure(620, 'Streaming, validation and persistence',
  'A browser submits a question to the API, which requests model inference. Structured model chunks become answer previews. The API validates the completed output, persists it in D1, and only then sends the completed reply with citations and model attribution. Vertical spacing is schematic, not measured latency.', [
    ...[[150, 'Browser'], [450, 'Chat API'], [750, 'Model'], [1050, 'D1']].map(([x, label]) => text(x, 101, label, { size: 23, weight: 650, anchor: 'middle' })),
    ...[150, 450, 750, 1050].map(x => rule(`M${x} 119V545`, true)),
    arrow('M150 158H438', { color: muted }), text(300, 144, 'POST question', { size: 19, anchor: 'middle', fill: muted }),
    arrow('M450 213H738', { color: muted }), text(600, 199, 'Inference request', { size: 19, anchor: 'middle', fill: muted }),
    arrow('M750 268H462'), text(600, 254, 'Structured chunks', { size: 19, anchor: 'middle', fill: accent }),
    arrow('M450 323H162'), text(300, 309, 'Answer previews', { size: 19, anchor: 'middle', fill: accent }),
    `<rect x="325" y="350" width="250" height="42" rx="8" fill="#fff7ed" stroke="#fdba74"/>`,
    text(450, 378, 'Validate completed output', { size: 17, anchor: 'middle', weight: 650 }),
    arrow('M450 429H1038', { color: muted }), text(750, 415, 'Persist completed reply', { size: 19, anchor: 'middle', fill: muted }),
    arrow('M1050 479H462', { color: muted }), text(750, 465, 'Saved', { size: 19, anchor: 'middle', fill: muted }),
    arrow('M450 529H162'), text(300, 515, 'Final reply + references', { size: 18, anchor: 'middle', fill: accent }),
    rule('M40 567H1160'),
    text(40, 602, 'Schematic sequence, not a latency benchmark. Events remain scoped to their conversation.', { size: 19, fill: muted }),
  ].join('\n')));

await writeFile(new URL('tracing.svg', directory), figure(545, 'One message trace, separate units of work',
  'A message trace contains an answer-pipeline span with decision, planning, retrieval, writing and persistence stages, plus an independent title task. Saved-answer latency ends at persistence. Export to LangSmith is a separate best-effort background operation.', [
    box(420, 86, 360, 80, 'Message trace', [] ,true),
    rule('M600 166V195H365V225'), rule('M600 195H965V225'),
    box(40, 225, 650, 205, 'Answer pipeline', []),
    ...[
      [65, 292, 180, 'Decision'], [265, 292, 180, 'Plan'], [465, 292, 200, 'Retrieve'],
      [65, 357, 280, 'Write'], [365, 357, 300, 'Persist'],
    ].map(([x, y, width, label]) => `<rect x="${x}" y="${y}" width="${width}" height="43" rx="8" fill="#ffffff" stroke="#cbd5e1"/>${text(x + width / 2, y + 28, label, { size: 20, anchor: 'middle' })}`),
    box(820, 225, 340, 105, 'Independent title task', ['Tracked separately']),
    arrow('M690 390H808', { dashed: true }),
    box(820, 355, 340, 95, 'LangSmith export', ['Best-effort background work']),
    text(750, 374, 'Best-effort', { size: 17, anchor: 'middle', fill: accent }),
    rule('M40 481H1160'),
    text(40, 517, 'Reply latency ends at persistence. An export failure does not fail the answer.', { size: 20, fill: muted }),
  ].join('\n')));

console.log('Generated ingestion, retrieval, streaming and tracing figures. No remote services were called.');
