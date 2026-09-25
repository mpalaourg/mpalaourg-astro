import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const chrome = process.env.CHROME_BINARY ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const projects = [
  { slug: 'from-workflows-to-agents', year: '2026', title: 'From Workflows to Agents: Building LLM Systems in Practice', summary: 'LLM systems with workflows, agents, tools, and evaluations.', image: 'featured.webp' },
  { slug: 'thesis', year: '2020', title: 'Mobile Battery Drain Prediction', summary: 'An Android app and machine learning pipeline for studying phone energy use.', image: 'featured.png' },
  { slug: 'JPEG', year: '2020', title: 'JPEG Image Compression', summary: 'Baseline JPEG encoding and decoding, from DCT to Huffman coding.', image: 'featured.png' },
  { slug: 'bashic-shell', year: '2018', title: 'Bash-ic Shell', summary: 'A custom Unix shell implementation in C.', image: 'featured.png', imageScale: 2 },
  { slug: 'image-segmentation', year: '2019', title: 'Image Segmentation', summary: 'Graph-based segmentation with spectral clustering and normalized cuts.', image: 'featured.png', imageScale: 1.1 },
  { slug: 'optimization-algorithms', year: '2018', title: 'Optimization Algorithms', summary: 'Algorithms for finding minima of mathematical functions.', image: 'featured.webp' },
  { slug: 'pi-messenger', year: '2019', title: 'Pi Messenger', summary: 'Energy-aware messaging between Raspberry Pi Zero devices.', image: 'featured.png', imageScale: 1.45 },
];

const escapeHtml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const temp = mkdtempSync(join(tmpdir(), 'project-share-'));

try {
  for (const project of projects) {
    const imagePath = resolve(root, 'public/projects', project.slug, project.image);
    const mime = project.image.endsWith('.webp') ? 'image/webp' : 'image/png';
    const image = `data:${mime};base64,${readFileSync(imagePath).toString('base64')}`;
    const titleSize = project.title.length > 54 ? 45 : project.title.length > 30 ? 52 : 60;
    const artwork = project.slug === 'from-workflows-to-agents'
      ? `<svg viewBox="405 215 400 380" aria-hidden="true"><image href="${image}" width="1200" height="675" /></svg>`
      : `<img src="${image}" alt="">`;
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
*{box-sizing:border-box} html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#f8fafc;background:#0f172a}
.sheet{position:relative;width:1200px;height:630px;overflow:hidden;background:radial-gradient(circle at 90% 10%,#1e2c48 0,#0f172a 48%,#0b1324 100%)}
.sheet:before{content:"";position:absolute;inset:0;opacity:.28;background-image:linear-gradient(#94a3b81a 1px,transparent 1px),linear-gradient(90deg,#94a3b81a 1px,transparent 1px);background-size:44px 44px}
.bar{position:absolute;left:0;top:0;width:9px;height:630px;background:#f97316}
.left{position:absolute;left:64px;top:60px;width:610px;height:510px;display:flex;flex-direction:column}
.eyebrow{font-size:18px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:#fb923c}
.title{margin-top:26px;font-size:${titleSize}px;font-weight:800;line-height:1.08;letter-spacing:-.035em;max-height:320px;overflow:hidden}
.summary{margin-top:24px;font-size:23px;line-height:1.4;color:#cbd5e1;max-height:102px;overflow:hidden}
.footer{margin-top:auto;padding-top:16px;border-top:1px solid #64748b99;font-size:17px;font-weight:700;letter-spacing:.06em;color:#e2e8f0}
.artwork{position:absolute;left:704px;top:62px;width:464px;height:506px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.artwork img{display:block;max-width:100%;max-height:100%;object-fit:contain;transform:scale(${project.imageScale ?? 1})}
.artwork svg{display:block;width:100%;max-height:100%;mix-blend-mode:lighten}
</style></head><body><div class="sheet"><div class="bar"></div><div class="left"><div class="eyebrow">Project · ${project.year}</div><div class="title">${escapeHtml(project.title)}</div><div class="summary">${escapeHtml(project.summary)}</div><div class="footer">GEORGIOS BALAOURAS</div></div><div class="artwork">${artwork}</div></div></body></html>`;
    const input = join(temp, `${project.slug}.html`);
    const output = resolve(root, 'public/projects', project.slug, 'share.png');
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
