import { parse } from 'parse5';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

export const pdfReviewSha256 = createHash('sha256').update(readFileSync(new URL('../data/chat-pdf-review.json', import.meta.url))).digest('hex');

export const allowedPage = /^(?:el\/)?(?:(?:about|projects|publications|formula)(?:\/.*)?)?index\.html$/;
const skip = new Set(['script', 'style', 'nav', 'button', 'form', 'svg', 'noscript']);
export function text(node = {}) {
  if (skip.has(node.tagName)) return '';
  const attrs = new Map((node.attrs || []).map(a => [a.name, a.value]));
  if (attrs.has('data-playful-signals') || /(?:nasa-widget|f1-race-preview|f1-race-widget|fact-widget|music-widget|quote-widget|joke-widget)/.test(attrs.get('class') || '') || attrs.get('aria-hidden') === 'true' || attrs.has('hidden')) return '';
  if (node.nodeName === '#text') return node.value;
  const content = (node.childNodes || []).map(text).join(' ').replace(/\s+/g, ' ').trim();
  const href = attrs.get('href') || '';
  // Retain published destinations so the assistant can cite real links rather
  // than guessing a URL from the anchor label. Never fetch those destinations.
  return node.tagName === 'a' && /^(?:https?:\/\/|\/(?!\/))/.test(href) ? `${content} (${href})` : content;
}
function find(node, tag) {
  if (node.tagName === tag) return node;
  for (const child of node.childNodes || []) { const found = find(child, tag); if (found) return found; }
}
function hasPendingChatIndex(node) {
  if (node.tagName === 'meta') {
    const attrs = new Map((node.attrs || []).map(attr => [attr.name, attr.value]));
    // A present but unknown review status also fails closed for retrieval.
    if (attrs.get('name')?.toLowerCase() === 'chat-index' && attrs.get('content') !== 'approved') return true;
  }
  return (node.childNodes || []).some(hasPendingChatIndex);
}
export function htmlPage(html) {
  const document = parse(html);
  if (hasPendingChatIndex(document)) return null;
  const main = find(document, 'main');
  return main ? { title: text(find(document, 'title')), body: text(main) } : null;
}
export function chunkSection(title, url, body) {
  // Every table row carries its column labels, even if a chunk starts midway
  // through a table. A naked score without its metric/dataset is poor evidence.
  body = tableEvidence(body);
  const chunks = [];
  for (let i = 0; i < body.length;) {
    let end = Math.min(i + 1800, body.length);
    if (end < body.length) {
      const paragraph = body.lastIndexOf('\n\n', end);
      if (paragraph > i) end = paragraph;
      else {
        const boundary = body.lastIndexOf(' ', end);
        if (boundary > i + 1200) end = boundary;
      }
    }
    const chunk = body.slice(i, end).trim();
    if (chunk.trim()) chunks.push({ title, url, body: chunk });
    if (end === body.length) break;
    if (body.slice(end, end + 2) === '\n\n') {
      const previous = body.lastIndexOf('\n\n', end - 1) + 2;
      // Keep short paragraph overlap, but never begin midway through a table
      // record or equation just to meet an arbitrary overlap size.
      i = previous > i && end - previous <= 300 ? previous : end + 2;
      continue;
    }
    i = Math.max(i + 1, end - 300);
    while (i < end && !/\s/.test(body[i - 1] || ' ')) i++;
  }
  return chunks;
}

export function tableEvidence(body) {
  return body.replace(/^\|[^\n]+\|[ \t]*\n\|[-: |]+\|[ \t]*\n(?:\|[^\n]*\|[ \t]*(?:\n|$))+/gm, table => {
    const rows = table.trim().split('\n').map(line => line.trim().slice(1, -1).split(/(?<!\\)\|/).map(cell => cell.trim()));
    const headers = rows[0];
    if (rows.some(row => row.length !== headers.length)) throw new Error('Misaligned reviewed document table');
    return rows.slice(2).map(row => 'Table row: ' + row.map((value, i) => `${headers[i] || `Column ${i + 1}`} = ${value || '(blank)'}`).join('; ') + '.').join('\n\n') + '\n';
  });
}

export function cleanDocumentText(value) {
  const compoundPrefixes = new Set(['self', 'multi', 'non', 'cross', 'pre', 'post', 'rnn', 'attention', 'gradient', 'feature', 'state', 'frame', 'block', 'long', 'short', 'pair']);
  return value.normalize('NFC')
    .replace(/\u00ad/g, '')
    .replace(/(\p{L}{2,})-[\t ]*\n[\t ]*(\p{Ll}{2,})/gu, (_, left, right) => compoundPrefixes.has(left.toLowerCase()) ? `${left}-${right}` : left + right)
    .replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

// Parse text only: no notes, macros, embedded files, hyperlinks, or external fetches.
const xml = new XMLParser({ preserveOrder: true, ignoreAttributes: false, processEntities: true, parseTagValue: false });
function values(nodes, tag) {
  return nodes.flatMap(node => Object.entries(node).flatMap(([key, children]) =>
    key === tag ? [children] : Array.isArray(children) ? values(children, tag) : []));
}
function xmlText(nodes) {
  return nodes.map(node => Object.entries(node).map(([key, value]) => key === '#text' ? value : Array.isArray(value) ? xmlText(value) : '').join('')).join('');
}
export function presentationSections(bytes) {
  const archive = unzipSync(bytes, { filter: file => /^(?:ppt\/slides\/slide\d+\.xml|ppt\/presentation\.xml|ppt\/_rels\/presentation\.xml\.rels)$/.test(file.name) });
  const presentation = archive['ppt/presentation.xml'], relations = archive['ppt/_rels/presentation.xml.rels'];
  if (!presentation || !relations) throw new Error('Presentation is missing its slide manifest');
  const rels = new Map();
  // Attributes belong to the same preserve-order node as its element.
  function elements(nodes, tag) {
    return nodes.flatMap(node => Object.entries(node).flatMap(([key, value]) =>
      key === tag ? [node] : Array.isArray(value) ? elements(value, tag) : []));
  }
  for (const node of elements(xml.parse(strFromU8(relations)), 'Relationship')) {
    const attrs = node[':@'];
    if (attrs?.['@_TargetMode'] !== 'External') rels.set(attrs?.['@_Id'], attrs?.['@_Target']);
  }
  return elements(xml.parse(strFromU8(presentation)), 'p:sldId').map((node, index) => {
    const target = rels.get(node[':@']?.['@_r:id']);
    if (typeof target !== 'string' || !/^(?:\/ppt\/)?slides\/slide\d+\.xml$/.test(target)) throw new Error('Unexpected presentation slide path');
    const key = target.startsWith('/') ? target.slice(1) : `ppt/${target}`;
    if (!archive[key]) throw new Error(`Missing slide ${index + 1}`);
    const paragraphs = values(xml.parse(strFromU8(archive[key])), 'a:p');
    return { label: `Slide ${index + 1}`, body: paragraphs.map(p => xmlText(values(p, 'a:t').flat())).join('\n').trim() };
  }).filter(section => section.body);
}
export async function documentSections(path) {
  const bytes = new Uint8Array(await readFile(path));
  if (path.endsWith('.pptx')) return presentationSections(bytes);
  if (!path.endsWith('.pdf')) throw new Error('Unsupported public document type');
  // Heavy layout/formula models run only during maintainer preprocessing.
  // The checked-in, source-hashed text keeps ordinary builds deterministic.
  const artifactPath = new URL(`../data/chat-pdf/${basename(path, '.pdf')}.json`, import.meta.url);
  let artifact;
  try { artifact = JSON.parse(await readFile(artifactPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`Missing PDF extraction for ${path}. Run scripts/extract-chat-pdfs.py before building.`);
  }
  return verifiedPdfSections(artifact, bytes, path);
}

export function verifiedPdfSections(artifact, bytes, path) {
  if (artifact.schema !== 1 || artifact.reviewPolicy !== 2 || artifact.reviewSha256 !== pdfReviewSha256 || artifact.extractor !== 'docling' ||
    typeof artifact.url !== 'string' || !path.replaceAll('\\', '/').endsWith(artifact.url) ||
    artifact.sourceSha256 !== createHash('sha256').update(bytes).digest('hex')) {
    throw new Error(`Stale or invalid PDF extraction for ${path}. Run scripts/extract-chat-pdfs.py before building.`);
  }
  if (!Number.isInteger(artifact.pageCount) || artifact.pageCount < 1 ||
    !Array.isArray(artifact.sections) || artifact.sections.length !== artifact.pageCount ||
    !artifact.sections.every((s, i) => s.label === `Page ${i + 1}` && typeof s.body === 'string' &&
      (s.body.trim() || artifact.blankPages?.includes(i + 1)))) {
    throw new Error(`Incomplete PDF extraction for ${path}`);
  }
  return artifact.sections.filter(s => s.body.trim()).map(s => ({ label: s.label, body: cleanDocumentText(s.body) }));
}
