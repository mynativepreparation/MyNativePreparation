// Inline formatting inside a text block (DECISIONS Q25 + Q26, docs/CONTENT-FORMAT.md). Pure functions: no React, no DOM, never throw.
//
//   **bold**   *italic*   __underline__   ==highlight==     (they may be combined and nested: ***both***)
//   {c=red;f=serif;x=l-circle-dark;s=l|text}                a span: colour, font, box and size ids from core/content/richStyles.ts
//   {{x=p-dashed}}text                                      a line (paragraph) in a box; also in front of "- " (starts a new list with that box)
//   a line that starts with "- " is a bullet
//   a backslash before \ * _ = - { } | shows that character as plain text
//
// A mark only opens when the character after it is not a space and only closes when the character before it is not a space,
// so "2 * 3 * 4" stays plain. A mark that is never closed stays plain text. A single "_" or "=" is never a mark.
// A span only counts when ALL its ids are in the catalog, no key is repeated and a closing "}" follows; otherwise every
// character of it stays plain text (nothing is lost). An empty span "{c=red|}" stays plain text too.

import {
  isColorId,
  isFontId,
  isParagraphBoxId,
  isSizeId,
  isSpanBoxId,
  type ColorId,
  type FontId,
  type ParagraphBoxId,
  type SizeId,
  type SpanBoxId,
} from './richStyles';

/** The look one brace span gives its text. A key that is not set is not present at all. */
export interface SpanStyle {
  color?: ColorId;
  font?: FontId;
  /** A letter box (around EACH letter) or a word box (around the whole marked text). */
  box?: SpanBoxId;
  size?: SizeId;
}

export interface Run extends SpanStyle {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  highlight: boolean;
}

export type RichBlock =
  | { type: 'paragraph'; runs: Run[]; box?: ParagraphBoxId }
  | { type: 'list'; items: Run[][]; box?: ParagraphBoxId };

type Mark = 'bold' | 'italic' | 'underline' | 'highlight';

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'mark'; mark: Mark; raw: string; role: 'open' | 'close' | 'literal' }
  | { kind: 'span'; side: 'open' | 'close'; raw: string; live: boolean; style: SpanStyle };

const ESCAPABLE = new Set(['\\', '*', '_', '=', '-', '{', '}', '|']);
const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch);

const SPAN_HEADER = /^[a-z]=[a-z0-9-]+(;[a-z]=[a-z0-9-]+)*$/;

/**
 * Reads `c=red;f=serif|` that starts right after the "{" at `start`. Returns the style and the index of the "|",
 * or null when it is not a valid span opening (unknown key or id, repeated key, no "|", odd characters).
 */
function parseSpanHeader(line: string, start: number): { style: SpanStyle; end: number } | null {
  const bar = line.indexOf('|', start + 1);
  if (bar === -1) return null;
  const header = line.slice(start + 1, bar);
  if (!SPAN_HEADER.test(header)) return null;

  const style: SpanStyle = {};
  const seen = new Set<string>();
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (seen.has(key)) return null;
    seen.add(key);
    if (key === 'c') {
      if (!isColorId(value)) return null;
      style.color = value;
    } else if (key === 'f') {
      if (!isFontId(value)) return null;
      style.font = value;
    } else if (key === 'x') {
      if (!isSpanBoxId(value)) return null;
      style.box = value;
    } else if (key === 's') {
      if (!isSizeId(value)) return null;
      style.size = value;
    } else {
      return null;
    }
  }
  return { style, end: bar };
}

/** Cuts the line into plain text pieces, mark candidates and span candidates. Escapes become plain text here. */
function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer !== '') tokens.push({ kind: 'text', text: buffer });
    buffer = '';
  };
  const addMark = (mark: Mark, raw: string) => {
    flush();
    tokens.push({ kind: 'mark', mark, raw, role: 'literal' });
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '\\' && next !== undefined && ESCAPABLE.has(next)) {
      buffer += next;
      i += 1;
    } else if (ch === '*' && next === '*') {
      addMark('bold', '**');
      i += 1;
    } else if (ch === '*') {
      addMark('italic', '*');
    } else if (ch === '_' && next === '_') {
      addMark('underline', '__');
      i += 1;
    } else if (ch === '=' && next === '=') {
      addMark('highlight', '==');
      i += 1;
    } else if (ch === '{') {
      const header = parseSpanHeader(line, i);
      if (header === null) {
        buffer += ch;
      } else {
        flush();
        tokens.push({ kind: 'span', side: 'open', raw: line.slice(i, header.end + 1), live: false, style: header.style });
        i = header.end;
      }
    } else if (ch === '}') {
      flush();
      tokens.push({ kind: 'span', side: 'close', raw: '}', live: false, style: {} });
    } else {
      buffer += ch;
    }
  }
  flush();
  return tokens;
}

function firstChar(token: Token | undefined): string | undefined {
  if (token === undefined) return undefined;
  return token.kind === 'text' ? token.text[0] : token.raw[0];
}

function lastChar(token: Token | undefined): string | undefined {
  if (token === undefined) return undefined;
  const s = token.kind === 'text' ? token.text : token.raw;
  return s[s.length - 1];
}

/** Matches every "}" with the nearest open span. A stray "}", an unclosed span and an empty span stay plain text. */
function resolveSpans(tokens: Token[]): void {
  const stack: number[] = [];
  tokens.forEach((token, i) => {
    if (token.kind !== 'span') return;
    if (token.side === 'open') {
      stack.push(i);
      return;
    }
    const openAt = stack.pop();
    if (openAt === undefined) return;
    const opener = tokens[openAt];
    if (opener.kind !== 'span') return;
    if (openAt === i - 1) return; // nothing between "{c=red|" and "}": both stay plain
    opener.live = true;
    token.live = true;
  });
}

/** Decides which marks really open and close; everything else (unclosed, empty, space-flanked) stays literal. */
function resolveMarks(tokens: Token[]): void {
  const open: Partial<Record<Mark, number>> = {};
  tokens.forEach((token, i) => {
    if (token.kind !== 'mark') return;
    const canOpen = !isSpace(firstChar(tokens[i + 1]));
    const canClose = !isSpace(lastChar(tokens[i - 1]));
    const openAt = open[token.mark];
    if (openAt !== undefined && canClose) {
      if (openAt === i - 1) {
        // Nothing between the two marks ("****"): both stay plain.
        const opener = tokens[openAt];
        if (opener.kind === 'mark') opener.role = 'literal';
      } else {
        token.role = 'close';
      }
      delete open[token.mark];
    } else if (openAt === undefined && canOpen) {
      token.role = 'open';
      open[token.mark] = i;
    }
  });
  // A mark that never closed goes back to plain text.
  (Object.keys(open) as Mark[]).forEach((mark) => {
    const at = open[mark];
    const token = at === undefined ? undefined : tokens[at];
    if (token !== undefined && token.kind === 'mark') token.role = 'literal';
  });
}

/** Open spans from the outside in: a key set by an inner span wins over the same key of an outer span. */
function mergeStyles(spans: SpanStyle[]): SpanStyle {
  const out: SpanStyle = {};
  for (const span of spans) {
    if (span.color !== undefined) out.color = span.color;
    if (span.font !== undefined) out.font = span.font;
    if (span.box !== undefined) out.box = span.box;
    if (span.size !== undefined) out.size = span.size;
  }
  return out;
}

/** One line of text -> runs with their flags and span styles. Adjacent pieces that look the same are merged; no run is empty. */
export function parseInline(line: string): Run[] {
  const tokens = tokenize(line);
  resolveSpans(tokens);
  resolveMarks(tokens);

  const flags: Record<Mark, boolean> = { bold: false, italic: false, underline: false, highlight: false };
  const spans: SpanStyle[] = [];
  const runs: Run[] = [];
  const push = (text: string) => {
    if (text === '') return;
    const style = mergeStyles(spans);
    const last = runs[runs.length - 1];
    if (
      last !== undefined &&
      last.bold === flags.bold &&
      last.italic === flags.italic &&
      last.underline === flags.underline &&
      last.highlight === flags.highlight &&
      last.color === style.color &&
      last.font === style.font &&
      last.box === style.box &&
      last.size === style.size
    ) {
      last.text += text;
    } else {
      runs.push({ text, ...flags, ...style });
    }
  };

  for (const token of tokens) {
    if (token.kind === 'text') {
      push(token.text);
    } else if (token.kind === 'mark') {
      if (token.role === 'literal') push(token.raw);
      else flags[token.mark] = token.role === 'open';
    } else if (!token.live) {
      push(token.raw);
    } else if (token.side === 'open') {
      spans.push(token.style);
    } else {
      spans.pop();
    }
  }
  return runs;
}

const BULLET = /^- (.*)$/;
const PARAGRAPH_PREFIX = /^\{\{x=([a-z0-9-]+)\}\}/;

/**
 * A whole text block -> paragraphs and bullet lists. Every non-empty line is its own paragraph; consecutive "- " lines make one
 * list; empty lines only separate. Accepts \n and \r\n.
 * A line may start with `{{x=<paragraph box id>}}`: the paragraph gets that box. In front of a "- " line it starts a NEW list that
 * has the box. An unknown box id leaves the prefix as plain text. A prefix with nothing after it is dropped like an empty line.
 */
export function parseRichText(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;

    let rest = line;
    let box: ParagraphBoxId | undefined;
    const prefix = PARAGRAPH_PREFIX.exec(line);
    if (prefix !== null) {
      const id = prefix[1];
      if (isParagraphBoxId(id)) {
        box = id;
        rest = line.slice(prefix[0].length);
        if (rest.trim() === '') continue;
      }
    }

    const bullet = BULLET.exec(rest);
    if (bullet !== null) {
      const items = parseInline(bullet[1]);
      const last = blocks[blocks.length - 1];
      if (last !== undefined && last.type === 'list' && box === undefined) last.items.push(items);
      else blocks.push(box === undefined ? { type: 'list', items: [items] } : { type: 'list', items: [items], box });
    } else {
      const runs = parseInline(rest);
      blocks.push(box === undefined ? { type: 'paragraph', runs } : { type: 'paragraph', runs, box });
    }
  }
  return blocks;
}

/** The text without any marks (for previews, search and screen-reader labels). Bullets become "- " lines again. */
export function plainText(text: string): string {
  return parseRichText(text)
    .map((block) =>
      block.type === 'paragraph'
        ? block.runs.map((r) => r.text).join('')
        : block.items.map((item) => `- ${item.map((r) => r.text).join('')}`).join('\n'),
    )
    .join('\n');
}
