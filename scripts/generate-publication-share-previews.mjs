import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const chrome = process.env.CHROME_BINARY ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const publications = [
  {
    slug: 'ism2021', venue: 'ISM 2021', year: '2021',
    title: 'Combining Global and Local Attention with Positional Encoding for Video Summarization',
    summary: 'Global and local attention for video summaries.',
    image: 'featured.png', titleSize: 49,
  },
  {
    slug: 'ism2022', venue: 'ISM 2022', year: '2022',
    title: 'Explaining video summarization based on the focus of attention',
    summary: 'Shows which fragments influence a video summary.',
    image: 'featured.webp', titleSize: 52,
  },
  {
    slug: 'icmr2022', venue: 'ICMR 2022', year: '2022',
    title: 'Summarizing Videos using Concentrated Attention and Considering the Uniqueness and Diversity of the Video Frames',
    summary: 'Concentrated attention for unsupervised summaries.',
    image: 'featured.png', titleSize: 44,
  },
];

const escapeHtml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const temp = mkdtempSync(join(tmpdir(), 'publication-share-'));

try {
  for (const publication of publications) {
    const imagePath = resolve(root, 'public/publications', publication.slug, publication.image);
    const mime = publication.image.endsWith('.webp') ? 'image/webp' : 'image/png';
    const image = `data:${mime};base64,${readFileSync(imagePath).toString('base64')}`;
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
*{box-sizing:border-box} html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#f8fafc;background:#0f172a}
.sheet{position:relative;width:1200px;height:630px;overflow:hidden;background:radial-gradient(circle at 90% 10%,#1e2c48 0,#0f172a 48%,#0b1324 100%)}
.sheet:before{content:"";position:absolute;inset:0;opacity:.28;background-image:linear-gradient(#94a3b81a 1px,transparent 1px),linear-gradient(90deg,#94a3b81a 1px,transparent 1px);background-size:44px 44px}
.bar{position:absolute;left:0;top:0;width:9px;height:630px;background:#f97316}
.left{position:absolute;left:64px;top:60px;width:610px;height:510px;display:flex;flex-direction:column}
.eyebrow{font-size:18px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:#fb923c}
.title{margin-top:26px;font-size:${publication.titleSize}px;font-weight:800;line-height:1.08;letter-spacing:-.035em;max-height:320px;overflow:hidden}
.summary{margin-top:24px;font-size:23px;line-height:1.4;color:#cbd5e1;max-height:102px;overflow:hidden}
.footer{margin-top:auto;padding-top:16px;border-top:1px solid #64748b99;font-size:17px;font-weight:700;letter-spacing:.06em;color:#e2e8f0}
.artwork{position:absolute;left:704px;top:62px;width:464px;height:506px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.artwork img{display:block;width:100%;max-height:100%;object-fit:contain}
</style></head><body><div class="sheet"><div class="bar"></div><div class="left"><div class="eyebrow">Research · ${publication.venue}</div><div class="title">${escapeHtml(publication.title)}</div><div class="summary">${escapeHtml(publication.summary)}</div><div class="footer">GEORGIOS BALAOURAS · ${publication.year}</div></div><div class="artwork"><img src="${image}" alt="Research method diagram"></div></div></body></html>`;
    const input = join(temp, `${publication.slug}.html`);
    const output = resolve(root, 'public/publications', publication.slug, 'share.png');
    writeFileSync(input, html);
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--disable-background-networking', '--force-device-scale-factor=1',
      '--window-size=1200,630', `--screenshot=${output}`, `file://${input}`,
    ], { stdio: 'ignore' });
    process.stdout.write(`${output}\n`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
