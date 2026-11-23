// Pure editor engine for the rich-text boxes of the Admin window (DECISIONS Q26, P10 T11l). No React, no DOM, never throws.
//
// The stored form stays ONE string per text block (marks and brace spans, see core/content/inline.ts and docs/CONTENT-FORMAT.md).
// While the person edits, that string lives as a RichDoc: a list of lines, each line a list of Runs (text + flags + optional
// colour, font, box, size) plus "is a bullet" and an optional paragraph box.
//
// Rules worth knowing:
// - Every function returns NEW objects and never changes its input. Positions that are out of range are clamped; nothing throws.
// - Positions count UTF-16 code units inside ONE line (the unit of DOM selection offsets). The contentEditable layer (T11m) may snap
//   to letter boundaries before it calls in here.
// - docToText() writes the form that docFromText() reads back as the same doc, with two normalisations: a line without any visible text
//   (and not a bullet) is not stored, and spaces at the edge of a styled run are written OUTSIDE its marks (inside its span), because
//   a mark never opens in front of a space and never closes after one.
// - A paragraph box on a bullet line starts a NEW list in the stored text (inline.ts), so put it on the first item of a list only.

import { parseRichText, type Run } from '../content/inline';
import type { ColorId, FontId, ParagraphBoxId, SizeId, SpanBoxId } from '../content/richStyles';

export type MarkName = 'bold' | 'italic' | 'underline' | 'highlight';

/** Fixed order: marks are opened in this order and closed in the reverse order. */
export const MARK_NAMES: readonly MarkName[] = ['bold', 'italic', 'underline', 'highlight'];

/** What a Run looks like without its text. */
export type RunStyle = Omit<Run, 'text'>;

/** No mark, no colour, no font, no box, no size. Never change this object. */
export const PLAIN_STYLE: RunStyle = { bold: false, italic: false, underline: false, highlight: false };

export interface DocLine {
  runs: Run[];
  bullet: boolean;
  /** Box around the whole paragraph (stored as the line prefix `{{x=...}}`). */
  box?: ParagraphBoxId;
}

/** At least one line. Treat it as read-only: every function here returns a new doc. */
export type RichDoc = DocLine[];

export interface DocPosition {
  line: number;
  /** UTF-16 code units from the start of the line. */
  offset: number;
}

/** `anchor` is where the selection started, `focus` where it ends; focus may come before anchor. */
export interface DocSelection {
  anchor: DocPosition;
  focus: DocPosition;
}

/** A selection put in order and clamped: `start` is never after `end`. */
export interface DocRange {
  start: DocPosition;
  end: DocPosition;
}

export interface EditResult {
  doc: RichDoc;
  /** A caret (anchor = focus) behind what was written. */
  selection: DocSelection;
}

/** What to change on the selected text. A key that is left out stays as it is; `null` removes a colour / font / box / size. */
export interface StylePatch {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  highlight?: boolean;
  color?: ColorId | null;
  font?: FontId | null;
  box?: SpanBoxId | null;
  size?: SizeId | null;
}

export type MarkState = 'all' | 'some' | 'none';

// ---------------------------------------------------------------------------------------------------------------------
// Runs

function copyStyle(style: RunStyle): RunStyle {
  const copy: RunStyle = { bold: style.bold, italic: style.italic, underline: style.underline, highlight: style.highlight };
  if (style.color !== undefined) copy.color = style.color;
  if (style.font !== undefined) copy.font = style.font;
  if (style.box !== undefined) copy.box = style.box;
  if (style.size !== undefined) copy.size = style.size;
  return copy;
}

function runOf(text: string, style: RunStyle): Run {
  return { text, ...copyStyle(style) };
}

function sameFlags(a: RunStyle, b: RunStyle): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.highlight === b.highlight;
}

function sameStyle(a: RunStyle, b: RunStyle): boolean {
  return sameFlags(a, b) && a.color === b.color && a.font === b.font && a.box === b.box && a.size === b.size;
}

/** Copies the runs, drops empty ones and joins neighbours that look the same. */
export function mergeRuns(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (run.text === '') continue;
    const last = out[out.length - 1];
    if (last !== undefined && sameStyle(last, run)) last.text += run.text;
    else out.push(runOf(run.text, run));
  }
  return out;
}

/** The part of the runs from character `start` up to (not including) `end`. */
export function sliceRuns(runs: readonly Run[], start: number, end: number): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const run of runs) {
    const from = at;
    const to = at + run.text.length;
    at = to;
    const a = Math.max(start, from);
    const b = Math.min(end, to);
    if (b > a) out.push(runOf(run.text.slice(a - from, b - from), run));
  }
  return out;
}

/** Like the runs, but the characters from `start` to `end` are changed by `change`. */
function mapRunsInRange(runs: readonly Run[], start: number, end: number, change: (run: Run) => Run): Run[] {
  if (end <= start) return mergeRuns(runs);
  const out: Run[] = [];
  let at = 0;
  for (const run of runs) {
    const from = at;
    const to = at + run.text.length;
    at = to;
    const a = Math.max(start, from);
    const b = Math.min(end, to);
    if (b <= a) {
      out.push(run);
      continue;
    }
    if (a > from) out.push(runOf(run.text.slice(0, a - from), run));
    out.push(change(runOf(run.text.slice(a - from, b - from), run)));
    if (b < to) out.push(runOf(run.text.slice(b - from), run));
  }
  return mergeRuns(out);
}

// ---------------------------------------------------------------------------------------------------------------------
// Lines and docs

export function lineText(line: DocLine): string {
  return line.runs.map((run) => run.text).join('');
}

export function lineLength(line: DocLine): number {
  return line.runs.reduce((sum, run) => sum + run.text.length, 0);
}

function makeLine(runs: readonly Run[], bullet: boolean, box?: ParagraphBoxId): DocLine {
  const line: DocLine = { runs: mergeRuns(runs), bullet };
  if (box !== undefined) line.box = box;
  return line;
}

function withRuns(line: DocLine, runs: readonly Run[]): DocLine {
  return makeLine(runs, line.bullet, line.box);
}

/** A doc with one empty paragraph: what an empty box shows. */
export function emptyDoc(): RichDoc {
  return [{ runs: [], bullet: false }];
}

/** All lines of the doc as plain text, lines joined by "\n" (the text a plain text box would hold). */
export function flatText(doc: RichDoc): string {
  return doc.map(lineText).join('\n');
}

/** The stored string -> a doc (never empty). Unknown or broken marks stay plain text, exactly as the reader shows them. */
export function docFromText(text: string): RichDoc {
  const lines: DocLine[] = [];
  for (const block of parseRichText(text)) {
    if (block.type === 'paragraph') {
      lines.push(makeLine(block.runs, false, block.box));
    } else {
      block.items.forEach((item, index) => {
        lines.push(makeLine(item, true, index === 0 ? block.box : undefined));
      });
    }
  }
  return lines.length === 0 ? emptyDoc() : lines;
}

// ---------------------------------------------------------------------------------------------------------------------
// Writing the stored string

const MARK_TOKEN: Record<MarkName, string> = { bold: '**', italic: '*', underline: '__', highlight: '==' };

/** Backslash in front of every character that could be read as a mark or a span. */
function escapeText(text: string): string {
  return text.replace(/[\\*_={}]/g, '\\$&');
}

/** `{c=red;f=serif;x=l-circle-dark;s=l|` or '' when the run has no span style. */
function spanHeader(style: RunStyle): string {
  const parts: string[] = [];
  if (style.color !== undefined) parts.push(`c=${style.color}`);
  if (style.font !== undefined) parts.push(`f=${style.font}`);
  if (style.box !== undefined) parts.push(`x=${style.box}`);
  if (style.size !== undefined) parts.push(`s=${style.size}`);
  return parts.length === 0 ? '' : `{${parts.join(';')}|`;
}

/** The mark characters between two neighbouring pieces of text: first the marks that end, then the ones that start. */
function transition(from: RunStyle, to: RunStyle): string {
  let out = '';
  for (const mark of [...MARK_NAMES].reverse()) {
    if (from[mark] && !to[mark]) out += MARK_TOKEN[mark];
  }
  for (const mark of MARK_NAMES) {
    if (!from[mark] && to[mark]) out += MARK_TOKEN[mark];
  }
  return out;
}

interface Segment {
  text: string;
  /** Only the four flags matter here. */
  marks: RunStyle;
  header: string;
}

/**
 * Cuts the runs into pieces that can be written: the spaces at the edges of a run get no marks (a mark never touches a space),
 * a run that is only spaces gets no marks, and neighbours with the same marks and span are joined.
 */
function toSegments(runs: readonly Run[]): Segment[] {
  const segments: Segment[] = [];
  const add = (text: string, marks: RunStyle, header: string) => {
    if (text === '') return;
    const last = segments[segments.length - 1];
    if (last !== undefined && last.header === header && sameFlags(last.marks, marks)) last.text += text;
    else segments.push({ text, marks, header });
  };
  for (const run of runs) {
    const header = spanHeader(run);
    const core = run.text.trim();
    if (core === '') {
      add(run.text, PLAIN_STYLE, header);
      continue;
    }
    const lead = run.text.length - run.text.trimStart().length;
    const trail = run.text.length - lead - core.length;
    add(run.text.slice(0, lead), PLAIN_STYLE, header);
    add(core, run, header);
    add(run.text.slice(run.text.length - trail), PLAIN_STYLE, header);
  }
  return segments;
}

/**
 * One line of runs -> the stored text. Marks are written only where they start or end (so `*a***b**` and not `*a**` `*b*`),
 * and no mark stays open across the edge of a span. Reading it with parseInline() gives the same runs back.
 */
export function serializeRuns(runs: readonly Run[]): string {
  let out = '';
  let openHeader = '';
  let marks: RunStyle = PLAIN_STYLE;
  for (const segment of toSegments(runs)) {
    if (segment.header !== openHeader) {
      out += transition(marks, PLAIN_STYLE);
      marks = PLAIN_STYLE;
      if (openHeader !== '') out += '}';
      out += segment.header;
      openHeader = segment.header;
    }
    out += transition(marks, segment.marks) + escapeText(segment.text);
    marks = segment.marks;
  }
  out += transition(marks, PLAIN_STYLE);
  if (openHeader !== '') out += '}';
  return out;
}

/** The stored text of one line, or null when the line is not stored (no visible text and not a bullet). */
function serializeLine(line: DocLine): string | null {
  if (!line.bullet && lineText(line).trim() === '') return null;
  const inline = serializeRuns(line.runs);
  // A text that starts with "- " would be read as a bullet.
  const body = !line.bullet && inline.startsWith('- ') ? `\\${inline}` : inline;
  const prefix = line.box === undefined ? '' : `{{x=${line.box}}}`;
  return `${prefix}${line.bullet ? '- ' : ''}${body}`;
}

/** A doc -> the string that is stored in the course file. */
export function docToText(doc: RichDoc): string {
  return doc
    .map(serializeLine)
    .filter((line): line is string => line !== null)
    .join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------
// Positions

export function clampPosition(doc: RichDoc, position: DocPosition): DocPosition {
  if (doc.length === 0) return { line: 0, offset: 0 };
  const line = Math.min(Math.max(Math.trunc(position.line) || 0, 0), doc.length - 1);
  const target = doc[line];
  const longest = target === undefined ? 0 : lineLength(target);
  const offset = Math.min(Math.max(Math.trunc(position.offset) || 0, 0), longest);
  return { line, offset };
}

/** Negative when `a` is before `b`, 0 when they are the same place, positive when `a` is after `b`. */
export function comparePositions(a: DocPosition, b: DocPosition): number {
  return a.line - b.line || a.offset - b.offset;
}

export function caretAt(position: DocPosition): DocSelection {
  return { anchor: position, focus: position };
}

export function isCollapsed(selection: DocSelection): boolean {
  return comparePositions(selection.anchor, selection.focus) === 0;
}

/** The selection in order (start before end) and clamped to the doc. */
export function rangeOf(doc: RichDoc, selection: DocSelection): DocRange {
  const anchor = clampPosition(doc, selection.anchor);
  const focus = clampPosition(doc, selection.focus);
  return comparePositions(anchor, focus) <= 0 ? { start: anchor, end: focus } : { start: focus, end: anchor };
}

/** The place as one number in `flatText(doc)` (lines joined by one "\n" character). */
export function positionToFlat(doc: RichDoc, position: DocPosition): number {
  const place = clampPosition(doc, position);
  const before = doc.slice(0, place.line).reduce((sum, line) => sum + lineLength(line) + 1, 0);
  return before + place.offset;
}

/** The place of a number in `flatText(doc)`; the "\n" itself belongs to the end of its line. Too small or too big is clamped. */
export function flatToPosition(doc: RichDoc, index: number): DocPosition {
  let rest = Math.max(Math.trunc(index) || 0, 0);
  for (let i = 0; i < doc.length; i++) {
    const line = doc[i];
    if (line === undefined) break;
    const length = lineLength(line);
    if (rest <= length) return { line: i, offset: rest };
    rest -= length + 1;
  }
  return clampPosition(doc, { line: doc.length - 1, offset: Number.MAX_SAFE_INTEGER });
}

interface LineSpan {
  index: number;
  from: number;
  to: number;
}

/** For every line the range touches: which characters of it are inside the range. */
function spansOf(doc: RichDoc, range: DocRange): LineSpan[] {
  const spans: LineSpan[] = [];
  for (let i = range.start.line; i <= range.end.line; i++) {
    const line = doc[i];
    if (line === undefined) continue;
    spans.push({
      index: i,
      from: i === range.start.line ? range.start.offset : 0,
      to: i === range.end.line ? range.end.offset : lineLength(line),
    });
  }
  return spans;
}

/** The lines a paragraph command (bullet, box) acts on. A selection that ends at the very start of a line does not include that line. */
function commandLines(range: DocRange): Set<number> {
  const last = range.end.line > range.start.line && range.end.offset === 0 ? range.end.line - 1 : range.end.line;
  const lines = new Set<number>();
  for (let i = range.start.line; i <= last; i++) lines.add(i);
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------------
// What the selection looks like (for the toolbar)

function selectedRuns(doc: RichDoc, range: DocRange): Run[] {
  return spansOf(doc, range).flatMap((span) => {
    const line = doc[span.index];
    return line === undefined ? [] : sliceRuns(line.runs, span.from, span.to);
  });
}

/** The style of the character before the place (typed text takes it over); at the start of a line, of the character after it. */
export function styleAt(doc: RichDoc, position: DocPosition): RunStyle {
  const place = clampPosition(doc, position);
  const line = doc[place.line];
  if (line === undefined) return PLAIN_STYLE;
  const before = place.offset > 0 ? sliceRuns(line.runs, place.offset - 1, place.offset)[0] : undefined;
  const after = sliceRuns(line.runs, place.offset, place.offset + 1)[0];
  const found = before ?? after;
  return found === undefined ? PLAIN_STYLE : copyStyle(found);
}

/** One style per selected run; for a caret (or an empty selection) the style at the caret. */
function selectionStyles(doc: RichDoc, selection: DocSelection): RunStyle[] {
  const range = rangeOf(doc, selection);
  const runs = selectedRuns(doc, range);
  return runs.length === 0 ? [styleAt(doc, range.start)] : runs;
}

/** Is the mark on for all, some or none of the selected text (for a caret: the text before it)? */
export function markState(doc: RichDoc, selection: DocSelection, mark: MarkName): MarkState {
  const styles = selectionStyles(doc, selection);
  const on = styles.filter((style) => style[mark]).length;
  if (on === 0) return 'none';
  return on === styles.length ? 'all' : 'some';
}

function commonValue<T>(styles: readonly RunStyle[], pick: (style: RunStyle) => T): T | 'mixed' {
  const first = styles[0];
  if (first === undefined) return pick(PLAIN_STYLE);
  const value = pick(first);
  return styles.every((style) => pick(style) === value) ? value : 'mixed';
}

/** The one colour of the selection, `undefined` when it has none, `'mixed'` when it differs. Same for font, box and size. */
export function colorOf(doc: RichDoc, selection: DocSelection): ColorId | undefined | 'mixed' {
  return commonValue(selectionStyles(doc, selection), (style) => style.color);
}

export function fontOf(doc: RichDoc, selection: DocSelection): FontId | undefined | 'mixed' {
  return commonValue(selectionStyles(doc, selection), (style) => style.font);
}

export function boxOf(doc: RichDoc, selection: DocSelection): SpanBoxId | undefined | 'mixed' {
  return commonValue(selectionStyles(doc, selection), (style) => style.box);
}

export function sizeOf(doc: RichDoc, selection: DocSelection): SizeId | undefined | 'mixed' {
  return commonValue(selectionStyles(doc, selection), (style) => style.size);
}

// ---------------------------------------------------------------------------------------------------------------------
// Changing the style

function patchRun(run: Run, patch: StylePatch): Run {
  const style: RunStyle = {
    bold: patch.bold ?? run.bold,
    italic: patch.italic ?? run.italic,
    underline: patch.underline ?? run.underline,
    highlight: patch.highlight ?? run.highlight,
  };
  const color = patch.color === undefined ? run.color : (patch.color ?? undefined);
  const font = patch.font === undefined ? run.font : (patch.font ?? undefined);
  const box = patch.box === undefined ? run.box : (patch.box ?? undefined);
  const size = patch.size === undefined ? run.size : (patch.size ?? undefined);
  if (color !== undefined) style.color = color;
  if (font !== undefined) style.font = font;
  if (box !== undefined) style.box = box;
  if (size !== undefined) style.size = size;
  return runOf(run.text, style);
}

/** Changes the style of the selected text. A caret changes nothing (the caller keeps its own "next typed text" style). */
export function applyStyle(doc: RichDoc, selection: DocSelection, patch: StylePatch): RichDoc {
  const spans = new Map(spansOf(doc, rangeOf(doc, selection)).map((span) => [span.index, span] as const));
  return doc.map((line, index) => {
    const span = spans.get(index);
    if (span === undefined || span.to <= span.from) return line;
    return withRuns(
      line,
      mapRunsInRange(line.runs, span.from, span.to, (run) => patchRun(run, patch)),
    );
  });
}

/** Bold, italic, underline or highlight: off when the whole selection has it, otherwise on for the whole selection. */
export function toggleMark(doc: RichDoc, selection: DocSelection, mark: MarkName): RichDoc {
  const patch: StylePatch = {};
  patch[mark] = markState(doc, selection, mark) !== 'all';
  return applyStyle(doc, selection, patch);
}

/** Removes every mark, colour, font, box and size from the selected text. */
export function clearStyle(doc: RichDoc, selection: DocSelection): RichDoc {
  return applyStyle(doc, selection, {
    bold: false,
    italic: false,
    underline: false,
    highlight: false,
    color: null,
    font: null,
    box: null,
    size: null,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Changing lines

/** Bullets on for the touched lines, or off when all of them already are bullets. */
export function toggleBullet(doc: RichDoc, selection: DocSelection): RichDoc {
  const lines = commandLines(rangeOf(doc, selection));
  const turnOn = [...lines].some((index) => {
    const line = doc[index];
    return line !== undefined && !line.bullet;
  });
  return doc.map((line, index) => (lines.has(index) ? makeLine(line.runs, turnOn, line.box) : line));
}

/** Sets (or, with null, removes) the paragraph box of the touched lines. */
export function setLineBox(doc: RichDoc, selection: DocSelection, box: ParagraphBoxId | null): RichDoc {
  const lines = commandLines(rangeOf(doc, selection));
  return doc.map((line, index) => (lines.has(index) ? makeLine(line.runs, line.bullet, box ?? undefined) : line));
}

// ---------------------------------------------------------------------------------------------------------------------
// Typing, pasting, deleting

/**
 * Replaces the selected text by `text` (which may hold line breaks; plain text only). The new text takes `style`, or by default the
 * style of the character before the selection. The first line keeps its bullet and box, new lines are bullets when it is one.
 * With an empty `text` this deletes the selection (lines that were cut in half are joined).
 */
export function replaceRange(doc: RichDoc, selection: DocSelection, text: string, style?: RunStyle): EditResult {
  const source = doc.length === 0 ? emptyDoc() : doc;
  const range = rangeOf(source, selection);
  const first = source[range.start.line];
  const last = source[range.end.line];
  if (first === undefined || last === undefined) return { doc: source, selection: caretAt({ line: 0, offset: 0 }) };

  const inherit = style ?? styleAt(source, range.start);
  const head = sliceRuns(first.runs, 0, range.start.offset);
  const tail = sliceRuns(last.runs, range.end.offset, Number.POSITIVE_INFINITY);
  const pieces = text.split(/\r\n|\r|\n/);

  const lines: DocLine[] = [];
  pieces.forEach((piece, i) => {
    const runs: Run[] = [
      ...(i === 0 ? head : []),
      ...(piece === '' ? [] : [runOf(piece, inherit)]),
      ...(i === pieces.length - 1 ? tail : []),
    ];
    lines.push(i === 0 ? makeLine(runs, first.bullet, first.box) : makeLine(runs, first.bullet));
  });

  const headLength = head.reduce((sum, run) => sum + run.text.length, 0);
  const lastPiece = pieces.slice(-1).join('');
  const caret = {
    line: range.start.line + pieces.length - 1,
    offset: (pieces.length === 1 ? headLength : 0) + lastPiece.length,
  };
  return {
    doc: [...source.slice(0, range.start.line), ...lines, ...source.slice(range.end.line + 1)],
    selection: caretAt(caret),
  };
}

/** The Enter key: splits the line at the caret (a selection is deleted first). Enter in an EMPTY bullet turns it into a normal line. */
export function enter(doc: RichDoc, selection: DocSelection): EditResult {
  const source = doc.length === 0 ? emptyDoc() : doc;
  const range = rangeOf(source, selection);
  const line = source[range.start.line];
  if (line !== undefined && comparePositions(range.start, range.end) === 0 && line.bullet && lineLength(line) === 0) {
    return {
      doc: source.map((item, index) => (index === range.start.line ? makeLine([], false) : item)),
      selection: caretAt({ line: range.start.line, offset: 0 }),
    };
  }
  return replaceRange(source, selection, '\n');
}
