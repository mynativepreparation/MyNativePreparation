import type { Block } from '../content/types';
import { newImageBlock, newTextBlock } from './model';

// Pasted content -> editor items (SPEC D3, P10 T3). No library: plain text and clipboard `text/html` (Word, Google Docs,
// web pages) are read with the browser's DOMParser. Pure functions; nothing is fetched, stored or executed.

export type PastedItem =
  | { kind: 'title' | 'subtitle' | 'text'; text: string }
  | { kind: 'image'; source: string; alt: string };

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Plain text: paragraphs are separated by one or more blank lines; single line breaks inside a paragraph are kept. */
export function parsePlainText(input: string): PastedItem[] {
  const items: PastedItem[] = [];
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');
  for (const chunk of normalized.split(/\n[ \t]*\n/)) {
    const text = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .join('\n');
    if (text !== '') items.push({ kind: 'text', text });
  }
  return items;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const SKIP_TAGS = new Set(['head', 'style', 'script', 'title', 'meta', 'link', 'template', 'noscript']);
const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'pre', 'blockquote', 'dt', 'dd', 'figcaption', 'caption']);

function blockKind(el: Element): 'title' | 'subtitle' | 'text' {
  const tag = el.tagName.toLowerCase();
  const cls = (el.getAttribute('class') ?? '').toLowerCase();
  if (tag === 'h1' || cls.includes('msotitle')) return 'title';
  if (/^h[2-6]$/.test(tag) || cls.includes('msosubtitle')) return 'subtitle';
  return 'text';
}

function imageOf(el: Element): PastedItem | null {
  const source = (el.getAttribute('src') ?? '').trim();
  if (source === '') return null;
  return { kind: 'image', source, alt: collapse(el.getAttribute('alt') ?? '') };
}

function collectImages(el: Element): PastedItem[] {
  const out: PastedItem[] = [];
  for (const img of Array.from(el.querySelectorAll('img'))) {
    const item = imageOf(img);
    if (item !== null) out.push(item);
  }
  return out;
}

function walk(node: Node, out: PastedItem[]): void {
  if (node.nodeType === TEXT_NODE) {
    const text = collapse(node.textContent ?? '');
    if (text !== '') out.push({ kind: 'text', text });
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return;
  if (tag === 'img') {
    const item = imageOf(el);
    if (item !== null) out.push(item);
    return;
  }
  if (BLOCK_TAGS.has(tag) || (tag === 'div' && el.querySelector('p, li, h1, h2, h3, h4, h5, h6, div') === null)) {
    const text = collapse(el.textContent ?? '');
    if (text !== '') out.push({ kind: blockKind(el), text });
    out.push(...collectImages(el));
    return;
  }
  for (const child of Array.from(el.childNodes)) walk(child, out);
}

/** Clipboard HTML -> items: headings -> title / subtitle, paragraphs and list items -> text, images -> image items. */
export function parseHtml(html: string): PastedItem[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: PastedItem[] = [];
  walk(doc.body, out);
  return out;
}

/**
 * Items -> blocks with new IDs. Image items need a stored path: `imageSrc(source, alt)` returns it (the editor shrinks
 * and stores the image first) or null to skip that image. Without a resolver, images are skipped.
 */
export function itemsToBlocks(
  items: readonly PastedItem[],
  imageSrc: (source: string, alt: string) => string | null = () => null,
): Block[] {
  const blocks: Block[] = [];
  for (const item of items) {
    if (item.kind === 'image') {
      const src = imageSrc(item.source, item.alt);
      if (src !== null) blocks.push(newImageBlock(src, item.alt));
    } else {
      blocks.push(newTextBlock(item.kind, item.text));
    }
  }
  return blocks;
}

// ---- HTML with bold -> text with **bold** (for the test editor, SPEC D4) ----------------------------------------------

function isBold(el: Element): boolean {
  const style = el.getAttribute('style') ?? '';
  if (/font-weight\s*:\s*(bold|bolder|[6-9]00)\b/i.test(style)) return true;
  if (/font-weight\s*:\s*(normal|lighter|[1-5]00)\b/i.test(style)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'b' || tag === 'strong';
}

function inline(node: Node, inBold: boolean): string {
  if (node.nodeType === TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ');
  if (node.nodeType !== ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return '';
  if (tag === 'br') return '\n';
  const bold = isBold(el);
  const inner = Array.from(el.childNodes)
    .map((c) => inline(c, inBold || bold))
    .join('');
  if (!bold || inBold || inner.trim() === '') return inner;
  const lead = inner.slice(0, inner.length - inner.trimStart().length);
  const trail = inner.slice(inner.trimEnd().length);
  return `${lead}**${inner.trim()}**${trail}`;
}

function lines(node: Node, out: string[]): void {
  if (node.nodeType === TEXT_NODE) {
    const t = collapse(node.textContent ?? '');
    if (t !== '') out.push(t);
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return;
  if (BLOCK_TAGS.has(tag) || (tag === 'div' && el.querySelector('p, li, h1, h2, h3, h4, h5, h6, div') === null)) {
    for (const part of inline(el, false).split('\n')) {
      const t = part.replace(/\*\*\*\*/g, '').replace(/\s+/g, ' ').trim();
      if (t !== '') out.push(t);
    }
    return;
  }
  for (const child of Array.from(el.childNodes)) lines(child, out);
}

/** Clipboard HTML -> one line per paragraph, bold runs wrapped in `**`. Feed the result to `parseTestText`. */
export function htmlToMarkedText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  lines(doc.body, out);
  return out.join('\n');
}
