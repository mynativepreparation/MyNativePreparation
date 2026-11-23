import type { WebpEncoder } from './image';
import type { DraftImage } from './model';
import { parsePlainText, type PastedItem } from './parsePaste';
import { pasteItems, type PasteInput, type PasteResult } from './pasteToBlocks';

// Word paste that KEEPS bold, italic and underline (P10 T11e, DECISIONS Q25). `parsePaste.ts` / `pasteToBlocks.ts` stay as they were
// (they drop the marks); this is the version the chapter editor uses. Clipboard `text/html` -> items whose text carries the inline
// marks of core/content/inline.ts: `**bold**`, `*italic*`, `__underline__`.
//  - headings stay plain title / subtitle text (titles and subtitles do not use marks);
//  - a list item becomes a "- " line, consecutive list items become ONE text block;
//  - a line break inside a paragraph stays a line break;
//  - characters that would be read as a mark (`\ * _ =`, and a "- " at the start of a line) are escaped with a backslash, so the
//    pasted text shows exactly what it said in the document;
//  - spaces at the edge of a styled piece are moved outside the marks (a mark may not open or close next to a space).
// Pure apart from the injected encoder (pictures are handled by `pasteItems`): never throws, nothing is fetched or stored.

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const SKIP_TAGS = new Set(['head', 'style', 'script', 'title', 'meta', 'link', 'template', 'noscript']);
const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'pre', 'blockquote', 'dt', 'dd', 'figcaption', 'caption']);
const CONTAINER_TAGS = new Set([
  'div', 'ul', 'ol', 'dl', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'form', 'body', 'html',
]);
const NESTED_BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, div, ul, ol';

interface Style {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface Piece extends Style {
  text: string;
}

const NO_MARKS: Style = { bold: false, italic: false, underline: false };

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function boldOf(el: Element): boolean {
  const style = el.getAttribute('style') ?? '';
  if (/font-weight\s*:\s*(bold|bolder|[6-9]00)\b/i.test(style)) return true;
  if (/font-weight\s*:\s*(normal|lighter|[1-5]00)\b/i.test(style)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'b' || tag === 'strong';
}

function italicOf(el: Element): boolean {
  const style = el.getAttribute('style') ?? '';
  if (/font-style\s*:\s*(italic|oblique)\b/i.test(style)) return true;
  if (/font-style\s*:\s*normal\b/i.test(style)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'i' || tag === 'em';
}

function underlineOf(el: Element): boolean {
  const style = el.getAttribute('style') ?? '';
  if (/text-decoration[^;]*\bunderline\b/i.test(style)) return true;
  if (/text-decoration[^;]*\bnone\b/i.test(style)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'u' || tag === 'ins';
}

/** The styled pieces of text inside `node`, in order. A line break is a piece with the text "\n". Pictures are skipped here. */
function collect(node: Node, inherited: Style, out: Piece[]): void {
  if (node.nodeType === TEXT_NODE) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ');
    if (text !== '') out.push({ text, ...inherited });
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag) || tag === 'img') return;
  if (tag === 'br') {
    out.push({ text: '\n', ...inherited });
    return;
  }
  const style: Style = {
    bold: inherited.bold || boldOf(el),
    italic: inherited.italic || italicOf(el),
    underline: inherited.underline || underlineOf(el),
  };
  for (const child of Array.from(el.childNodes)) collect(child, style, out);
}

/** Escapes what the inline parser would read as a mark. A single `_` or `=` is never a mark, so only doubled ones are escaped. */
function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\*/g, '\\*').replace(/__/g, '\\_\\_').replace(/==/g, '\\=\\=');
}

/** One line of pieces -> text with marks. Same-style neighbours are merged; edge spaces go outside the marks. */
function serializeLine(pieces: readonly Piece[]): string {
  const merged: Piece[] = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.bold === piece.bold && last.italic === piece.italic && last.underline === piece.underline) {
      last.text += piece.text;
    } else {
      merged.push({ ...piece });
    }
  }
  let out = '';
  for (const piece of merged) {
    const core = piece.text.trim();
    if (core === '') {
      out += piece.text;
      continue;
    }
    const lead = piece.text.slice(0, piece.text.length - piece.text.trimStart().length);
    const trail = piece.text.slice(piece.text.trimEnd().length);
    const open = `${piece.bold ? '**' : ''}${piece.italic ? '*' : ''}${piece.underline ? '__' : ''}`;
    const close = `${piece.underline ? '__' : ''}${piece.italic ? '*' : ''}${piece.bold ? '**' : ''}`;
    out += `${lead}${open}${escapeText(core)}${close}${trail}`;
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

/** Pieces -> the non-empty lines of marked text. A "- " at the start of a line is escaped (a real bullet is added by the caller). */
function toLines(pieces: readonly Piece[]): string[] {
  let current: Piece[] = [];
  const lines: Piece[][] = [current];
  for (const piece of pieces) {
    piece.text.split('\n').forEach((part, index) => {
      if (index > 0) {
        current = [];
        lines.push(current);
      }
      if (part !== '') current.push({ ...piece, text: part });
    });
  }
  return lines
    .map(serializeLine)
    .filter((line) => line !== '')
    .map((line) => (line.startsWith('- ') ? `\\${line}` : line));
}

function headingKind(el: Element): 'title' | 'subtitle' | 'text' {
  const tag = el.tagName.toLowerCase();
  const cls = (el.getAttribute('class') ?? '').toLowerCase();
  if (tag === 'h1' || cls.includes('msotitle')) return 'title';
  if (/^h[2-6]$/.test(tag) || cls.includes('msosubtitle')) return 'subtitle';
  return 'text';
}

function imageItems(el: Element): PastedItem[] {
  const out: PastedItem[] = [];
  for (const img of Array.from(el.querySelectorAll('img'))) {
    const source = (img.getAttribute('src') ?? '').trim();
    if (source !== '') out.push({ kind: 'image', source, alt: collapse(img.getAttribute('alt') ?? '') });
  }
  return out;
}

/** True for text nodes and for elements that only hold inline content: they are gathered into one paragraph. */
function isInline(node: Node): boolean {
  if (node.nodeType === TEXT_NODE) return true;
  if (node.nodeType !== ELEMENT_NODE) return false;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag) || tag === 'br') return true;
  if (tag === 'img' || BLOCK_TAGS.has(tag) || CONTAINER_TAGS.has(tag)) return false;
  return el.querySelector(NESTED_BLOCKS) === null && el.querySelector('img') === null;
}

function walkChildren(parent: Node, out: PastedItem[]): void {
  let pieces: Piece[] = [];
  const flush = () => {
    const lines = toLines(pieces);
    pieces = [];
    if (lines.length > 0) out.push({ kind: 'text', text: lines.join('\n') });
  };
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType !== ELEMENT_NODE && child.nodeType !== TEXT_NODE) continue; // comments and the like
    if (isInline(child)) {
      collect(child, NO_MARKS, pieces);
    } else {
      flush();
      walk(child as Element, out);
    }
  }
  flush();
}

function walk(el: Element, out: PastedItem[]): void {
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return;
  if (tag === 'img') {
    const source = (el.getAttribute('src') ?? '').trim();
    if (source !== '') out.push({ kind: 'image', source, alt: collapse(el.getAttribute('alt') ?? '') });
    return;
  }
  const hasBlocks = el.querySelector(NESTED_BLOCKS) !== null;
  const leaf = (BLOCK_TAGS.has(tag) && !(tag === 'li' && hasBlocks)) || (tag === 'div' && !hasBlocks);
  if (!leaf) {
    walkChildren(el, out);
    return;
  }

  const kind = headingKind(el);
  if (kind === 'text') {
    const pieces: Piece[] = [];
    collect(el, NO_MARKS, pieces);
    const lines = toLines(pieces);
    const first = lines[0];
    if (first !== undefined && tag === 'li') lines[0] = `- ${first}`;
    if (lines.length > 0) out.push({ kind: 'text', text: lines.join('\n') });
  } else {
    const text = collapse(el.textContent ?? '');
    if (text !== '') out.push({ kind, text });
  }
  out.push(...imageItems(el));
}

/** Consecutive list items ("- ..." items) become one text item with one bullet per line. */
function mergeBullets(items: readonly PastedItem[]): PastedItem[] {
  const merged: PastedItem[] = [];
  for (const item of items) {
    const last = merged[merged.length - 1];
    if (
      item.kind === 'text' &&
      item.text.startsWith('- ') &&
      last !== undefined &&
      last.kind === 'text' &&
      last.text.startsWith('- ')
    ) {
      merged[merged.length - 1] = { kind: 'text', text: `${last.text}\n${item.text}` };
    } else {
      merged.push(item);
    }
  }
  return merged;
}

/** Clipboard HTML -> items: headings -> title / subtitle (plain), paragraphs -> text with marks, list items -> "- " lines, pictures -> image items. */
export function parseHtmlMarked(html: string): PastedItem[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: PastedItem[] = [];
  walkChildren(doc.body, out);
  return mergeBullets(out);
}

function itemsOf(input: PasteInput): PastedItem[] {
  if (input.html.trim() !== '') {
    const fromHtml = parseHtmlMarked(input.html);
    if (fromHtml.length > 0) return fromHtml;
  }
  return parsePlainText(input.text);
}

/** Like `pasteToBlocks`, but bold, italic and underline of the pasted document are kept as marks in the text blocks. */
export function pasteToMarkedBlocks(
  input: PasteInput,
  existing: readonly DraftImage[],
  encodeWebp: WebpEncoder,
): Promise<PasteResult> {
  return pasteItems(itemsOf(input), existing, encodeWebp);
}
