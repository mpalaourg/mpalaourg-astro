import {safeChatImage} from './images';
import { parseChatMarkdown } from './markdown-source';
import type { Nodes } from 'mdast';
import { bareChatLinks, safeChatLink, externalChatDestination } from './links';

type Tag = 'p' | 'strong' | 'em' | 'code' | 'pre' | 'ul' | 'ol' | 'li' | 'blockquote' | 'h3' | 'h4' | 'hr' | 'br' | 'span' | 'div' | 'a' | 'img';
export type ChatMarkup = string | { tag: Tag; children: ChatMarkup[]; href?: string; src?:string; alt?:string; start?: number; math?: { value: string; display: boolean } };
export const CHAT_MATH_OPTIONS = { trust: false, strict: 'ignore', throwOnError: true, maxExpand: 100, maxSize: 10, output: 'htmlAndMathml' } as const;
let mathModule: typeof import('katex') | undefined;
let mathLoading: Promise<typeof import('katex')> | undefined;
const mathCache = new Map<string, HTMLElement>();

function renderMath(element: HTMLElement, value: string, display: boolean) {
  element.className = display ? 'chat-math chat-math-display' : 'chat-math';
  element.textContent = value;
  if (value.length > 1000) { element.classList.add('chat-math-fallback'); return; }
  const key = `${display}:${value}`;
  const paint = (module: typeof import('katex')) => {
    const cached = mathCache.get(key);
    if (cached) { element.replaceChildren(...Array.from(cached.childNodes, node => node.cloneNode(true))); return; }
    try {
      module.default.render(value, element, { ...CHAT_MATH_OPTIONS, displayMode: display });
      mathCache.set(key, element.cloneNode(true) as HTMLElement);
      if (mathCache.size > 32) mathCache.delete(mathCache.keys().next().value!);
    } catch { element.textContent = value; element.classList.add('chat-math-fallback'); }
  };
  if (mathModule) { paint(mathModule); return; }
  // The site-wide bubble should not load a math renderer until it needs one.
  mathLoading ||= import('katex').then(module => { mathModule = module; return module; }).catch(error => { mathLoading = undefined; throw error; });
  void mathLoading.then(module => { if (element.isConnected) paint(module); }).catch(() => { element.classList.add('chat-math-fallback'); });
}

// Parse CommonMark into a fixed presentation vocabulary, never model HTML.
// Only validated web links become anchors. Navigation is guarded by SiteChat.
export function chatMarkup(value: string): ChatMarkup[] {
  const source = value.slice(0, 3200);
  const tree = parseChatMarkdown(source);
  const definitions = new Map(tree.children.flatMap(node => node.type === 'definition' ? [[node.identifier.toLowerCase(), node.url] as const] : []));
  let imageCount=0;
  const link = (url: string, children: ChatMarkup[]): ChatMarkup[] => {
    const href = safeChatLink(url);
    return href ? [{ tag: 'a', href, children }] : children;
  };
  function convert(node: Nodes, depth = 0, insideLink = false): ChatMarkup[] {
    if (depth > 24) return [];
    const children = () => 'children' in node ? node.children.flatMap(child => convert(child, depth + 1, insideLink || node.type === 'link' || node.type === 'linkReference')) : [];
    const element = (tag: Tag, content = children()): ChatMarkup[] => [{ tag, children: content }];
    switch (node.type) {
      case 'root': return children();
      case 'text': return insideLink ? [node.value] : bareChatLinks(node.value).flatMap(part => part.href ? link(part.href, [part.text]) : [part.text]);
      case 'paragraph': return element('p');
      case 'strong': return element('strong');
      case 'emphasis': return element('em');
      case 'inlineCode': return element('code', [node.value]);
      case 'code': return element('pre', [{ tag: 'code', children: [node.value] }]);
      case 'math': case 'inlineMath': return [{ tag: node.type === 'math' ? 'div' : 'span', children: [node.value], math: { value: node.value, display: node.type === 'math' } }];
      case 'list': return [{ tag: node.ordered ? 'ol' : 'ul', children: children(), ...(node.ordered && node.start && node.start > 0 ? { start: node.start } : {}) }];
      case 'listItem': return element('li');
      case 'blockquote': return element('blockquote');
      case 'heading': return element(node.depth <= 2 ? 'h3' : 'h4');
      case 'thematicBreak': return element('hr', []);
      case 'break': return element('br', []);
      case 'link': return link(node.url, children());
      case 'linkReference': return link(definitions.get(node.identifier.toLowerCase()) || '', children());
      case 'image': case 'imageReference': {
        const url=node.type==='image'?node.url:definitions.get(node.identifier.toLowerCase())||'';
        const src=safeChatImage(url);return !insideLink&&src&&node.alt?.trim()&&imageCount++<2?[{tag:'img',src,alt:node.alt,children:[]}]:node.alt?[node.alt]:[];
      }
      case 'html': return [node.value];
      case 'definition': return [];
      default: return [];
    }
  }
  try { return convert(tree); }
  catch { return [{ tag: 'p', children: [source] }]; }
}

export function renderChatMarkdown(target: HTMLElement, value: string) {
  function append(parent: Node, nodes: ChatMarkup[]) {
    for (const node of nodes) {
      if (typeof node === 'string') { parent.appendChild(document.createTextNode(node)); continue; }
      if(node.tag==='img'&&node.src){
        const frame=document.createElement('a');frame.className='chat-image-link';frame.setAttribute('href',node.src);frame.setAttribute('target','_blank');frame.setAttribute('rel','noopener noreferrer');
        const image=document.createElement('img');image.className='chat-reply-image';image.setAttribute('src',node.src);image.setAttribute('alt',node.alt||'');image.setAttribute('loading','lazy');image.setAttribute('decoding','async');image.setAttribute('referrerpolicy','no-referrer');
        image.addEventListener('error',()=>{frame.classList.add('is-unavailable');image.remove();});
        const caption=document.createElement('span');caption.className='chat-image-caption';caption.setAttribute('aria-hidden','true');caption.textContent=node.alt||'';
        frame.appendChild(image);frame.appendChild(caption);parent.appendChild(frame);continue;
      }
      const element = document.createElement(node.tag);
      if (node.tag === 'ol' && node.start) element.setAttribute('start', String(node.start));
      if (node.tag === 'a' && node.href) {
        if (externalChatDestination(node.href)) {
          // Keep the outbound URL inert until acknowledged, including browser
          // context-menu and drag navigation. Continue supplies the real link.
          element.setAttribute('data-chat-href', node.href);
          element.setAttribute('role', 'link'); element.setAttribute('tabindex', '0');
          element.setAttribute('title', node.href);
        } else element.setAttribute('href', node.href);
        element.setAttribute('rel', 'noopener noreferrer');
      }
      if (node.math) {
        renderMath(element, node.math.value, node.math.display);
        parent.appendChild(element); continue;
      }
      append(element, node.children); parent.appendChild(element);
    }
  }
  const content = document.createDocumentFragment(); append(content, chatMarkup(value)); target.replaceChildren(content);
}

// Keep readable structure while removing inline/heading/quote Markdown syntax.
export function chatPlainText(value: string): string {
  function serialize(nodes: ChatMarkup[], indent = ''): string {
    return nodes.map(node => {
      if (typeof node === 'string') return node;
      if (node.math) return node.math.value + (node.math.display ? '\n\n' : '');
      if (node.tag === 'ul' || node.tag === 'ol') {
        let number = node.start || 1;
        return '\n' + node.children.map(item => {
          const marker = node.tag === 'ol' ? `${number++}. ` : '• ';
          if (typeof item === 'string') return indent + marker + item;
          const content = serialize(item.children, indent + '  ').trim();
          return indent + marker + content;
        }).join('\n') + '\n\n';
      }
      if(node.tag==='img'&&node.src)return `${node.alt||'Image'} (${node.src})`;
      if (node.tag === 'br') return '\n';
      if (node.tag === 'hr') return '\n\n';
      const content = serialize(node.children, indent);
      if (node.tag === 'a' && node.href) return safeChatLink(content) === node.href ? content : `${content} (${node.href})`;
      return ['p', 'h3', 'h4', 'blockquote', 'pre'].includes(node.tag) ? content.trim() + '\n\n' : content;
    }).join('');
  }
  return serialize(chatMarkup(value)).replace(/\n{3,}/g, '\n\n').trim();
}
