import { fromMarkdown } from 'mdast-util-from-markdown';
import { math } from 'micromark-extension-math';
import { mathFromMarkdown } from 'mdast-util-math';
import type { Nodes } from 'mdast';
import { bareChatLinks } from './links';

// Accept common model math delimiters without touching literal code. CommonMark
// offsets also protect unclosed fences while a response is still streaming.
function mathDelimiters(source: string) {
  const ranges: { start: number; end: number }[] = [];
  const visit = (node: Nodes) => {
    if ((node.type === 'code' || node.type === 'inlineCode') && node.position) ranges.push({ start: node.position.start.offset!, end: node.position.end.offset! });
    else if ('children' in node) node.children.forEach(visit);
  };
  visit(fromMarkdown(source));
  const replace = (text: string) => text
    .replace(/(?<!\\)\$\$([^\n]+?)\$\$/g, (_, value: string) => '\n$$\n' + value + '\n$$\n')
    .replace(/(?<!\\)\\\[([\s\S]*?)\\\]/g, (_, value: string) => '\n$$\n' + value + '\n$$\n')
    .replace(/(?<!\\)\\\(([\s\S]*?)\\\)/g, (_, value: string) => '$' + value + '$')
    .replace(/(?<!\\)\$(\d[\d,.]*(?:[\t ]+\p{L}+)*[\t ]+)(?=\$\d)/gu, (_, value: string) => '\\$' + value);
  let at = 0, result = '';
  for (const range of ranges) { result += replace(source.slice(at, range.start)) + source.slice(range.start, range.end); at = range.end; }
  return result + replace(source.slice(at));
}

export function parseChatMarkdown(source: string) {
  return fromMarkdown(mathDelimiters(source), { extensions: [math()], mdastExtensions: [mathFromMarkdown()] });
}

// Code and math are inert literals. Validate prose policy independently from
// their punctuation so a comparison such as x<y is not mistaken for HTML.
export function chatProse(source: string): string {
  const text: string[] = [];
  const visit = (node: Nodes) => {
    if (['code', 'inlineCode', 'math', 'inlineMath'].includes(node.type)) return;
    if (node.type === 'image' || node.type === 'imageReference') { text.push(node.alt||''); return; }
    if (node.type === 'text' || node.type === 'html') text.push(node.value);
    else if ('children' in node) node.children.forEach(visit);
  };
  visit(parseChatMarkdown(source)); return text.join(' ');
}

export function chatLinkTargets(source: string): string[] {
  const tree = parseChatMarkdown(source);
  const definitions = new Map(tree.children.flatMap(node => node.type === 'definition' ? [[node.identifier.toLowerCase(), node.url] as const] : []));
  const urls: string[] = [];
  const visit = (node: Nodes) => {
    if (['code', 'inlineCode', 'math', 'inlineMath', 'definition'].includes(node.type)) return;
    if (node.type === 'link') { urls.push(node.url); return; }
    if (node.type === 'linkReference') { urls.push(definitions.get(node.identifier.toLowerCase()) || ''); return; }
    if (node.type === 'text') urls.push(...bareChatLinks(node.value).flatMap(part => part.href ? [part.href] : []));
    else if ('children' in node) node.children.forEach(visit);
  };
  visit(tree); return urls;
}

export function chatImageTargets(source:string):{url:string;alt:string}[]{
  const tree=parseChatMarkdown(source);
  const definitions=new Map(tree.children.flatMap(n=>n.type==='definition'?[[n.identifier.toLowerCase(),n.url] as const]:[]));
  const images:{url:string;alt:string}[]=[];
  const visit=(node:Nodes)=>{
    if(node.type==='image'){images.push({url:node.url,alt:node.alt||''});return}
    if(node.type==='imageReference'){images.push({url:definitions.get(node.identifier.toLowerCase())||'',alt:node.alt||''});return}
    if('children' in node)node.children.forEach(visit);
  };visit(tree);return images;
}
