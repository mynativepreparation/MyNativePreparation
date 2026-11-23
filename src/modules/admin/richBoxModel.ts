import {
  caretAt,
  clampPosition,
  emptyDoc,
  enter,
  isCollapsed,
  lineLength,
  lineText,
  PLAIN_STYLE,
  replaceRange,
  toggleBullet,
  toggleMark,
  type DocSelection,
  type EditResult,
  type MarkName,
  type RichDoc,
} from '../../core/admin/richDoc';

// What the Admin text box does with one input event (P10 T11m). Pure: no DOM, no React, never throws.
// The box cancels the browser's own edit and asks this file what the document should look like instead, so the styles of the
// letters never depend on what a browser does to its DOM. Only IME composition (Gujarati keyboards) is left to the browser;
// `reconcileText` then reads the text back from the DOM and keeps the styles of every letter that did not change.

export interface InputRequest {
  /** `InputEvent.inputType`, for example `insertText` or `deleteContentBackward`. */
  inputType: string;
  data: string | null;
  /** Title and Subtitle: one line. Enter does nothing and line breaks in text become spaces. */
  singleLine: boolean;
}

export type InputOutcome =
  | { kind: 'edit'; doc: RichDoc; selection: DocSelection }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'ignore' };

type Unit = 'char' | 'word' | 'line';

const NEWLINES = /\r\n|\r|\n/g;

/** Line breaks become single spaces. */
export function oneLine(text: string): string {
  return text.replace(NEWLINES, ' ');
}

const isHigh = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** The offset one code point before `offset` (never inside a surrogate pair). */
export function stepBack(text: string, offset: number): number {
  if (offset <= 0) return 0;
  const end = Math.min(offset, text.length);
  if (end >= 2 && isLow(text.charCodeAt(end - 1)) && isHigh(text.charCodeAt(end - 2))) return end - 2;
  return end - 1;
}

/** The offset one code point after `offset` (never inside a surrogate pair). */
export function stepForward(text: string, offset: number): number {
  if (offset >= text.length) return text.length;
  const start = Math.max(offset, 0);
  if (isHigh(text.charCodeAt(start)) && start + 1 < text.length && isLow(text.charCodeAt(start + 1))) return start + 2;
  return start + 1;
}

const isSpace = (char: string): boolean => /\s/.test(char);

function wordBack(text: string, offset: number): number {
  let at = Math.min(offset, text.length);
  while (at > 0 && isSpace(text.charAt(at - 1))) at -= 1;
  while (at > 0 && !isSpace(text.charAt(at - 1))) at -= 1;
  return at;
}

function wordForward(text: string, offset: number): number {
  let at = Math.max(offset, 0);
  while (at < text.length && isSpace(text.charAt(at))) at += 1;
  while (at < text.length && !isSpace(text.charAt(at))) at += 1;
  return at;
}

/** A caret at the very end of the document. */
export function endOf(doc: RichDoc): DocSelection {
  const index = Math.max(doc.length - 1, 0);
  const line = doc[index];
  return caretAt({ line: index, offset: line === undefined ? 0 : lineLength(line) });
}

function edit(result: EditResult): InputOutcome {
  return { kind: 'edit', doc: result.doc, selection: result.selection };
}

function deleteInput(doc: RichDoc, selection: DocSelection, backward: boolean, unit: Unit): InputOutcome {
  if (!isCollapsed(selection)) return edit(replaceRange(doc, selection, ''));
  const at = clampPosition(doc, selection.focus);
  const line = doc[at.line];
  if (line === undefined) return { kind: 'ignore' };
  const text = lineText(line);

  if (backward) {
    if (at.offset > 0) {
      const from = unit === 'word' ? wordBack(text, at.offset) : unit === 'line' ? 0 : stepBack(text, at.offset);
      return edit(replaceRange(doc, { anchor: { line: at.line, offset: from }, focus: at }, ''));
    }
    // At the start of a bullet the first Backspace only removes the bullet.
    if (line.bullet) return { kind: 'edit', doc: toggleBullet(doc, selection), selection: caretAt(at) };
    const previous = doc[at.line - 1];
    if (previous === undefined) return { kind: 'ignore' };
    return edit(replaceRange(doc, { anchor: { line: at.line - 1, offset: lineLength(previous) }, focus: at }, ''));
  }

  if (at.offset < text.length) {
    const to = unit === 'word' ? wordForward(text, at.offset) : unit === 'line' ? text.length : stepForward(text, at.offset);
    return edit(replaceRange(doc, { anchor: at, focus: { line: at.line, offset: to } }, ''));
  }
  if (doc[at.line + 1] === undefined) return { kind: 'ignore' };
  return edit(replaceRange(doc, { anchor: at, focus: { line: at.line + 1, offset: 0 } }, ''));
}

const FORMAT_MARKS = new Map<string, MarkName>([
  ['formatBold', 'bold'],
  ['formatItalic', 'italic'],
  ['formatUnderline', 'underline'],
]);

/** The answer to one `beforeinput` event (or to a paste, which is `insertFromPaste`). */
export function applyInput(doc: RichDoc, selection: DocSelection, request: InputRequest): InputOutcome {
  const source = doc.length === 0 ? emptyDoc() : doc;
  switch (request.inputType) {
    case 'insertText':
    case 'insertReplacementText':
    case 'insertFromPaste':
    case 'insertFromDrop':
    case 'insertFromYank': {
      const raw = request.data ?? '';
      const text = request.singleLine ? oneLine(raw) : raw;
      if (text === '' && isCollapsed(selection)) return { kind: 'ignore' };
      return edit(replaceRange(source, selection, text));
    }
    case 'insertParagraph':
    case 'insertLineBreak':
      return request.singleLine ? { kind: 'ignore' } : edit(enter(source, selection));
    case 'deleteContentBackward':
      return deleteInput(source, selection, true, 'char');
    case 'deleteContentForward':
      return deleteInput(source, selection, false, 'char');
    case 'deleteWordBackward':
      return deleteInput(source, selection, true, 'word');
    case 'deleteWordForward':
      return deleteInput(source, selection, false, 'word');
    case 'deleteSoftLineBackward':
    case 'deleteHardLineBackward':
      return deleteInput(source, selection, true, 'line');
    case 'deleteSoftLineForward':
    case 'deleteHardLineForward':
      return deleteInput(source, selection, false, 'line');
    case 'deleteByCut':
    case 'deleteByDrag':
    case 'deleteContent':
      return edit(replaceRange(source, selection, ''));
    case 'historyUndo':
      return { kind: 'undo' };
    case 'historyRedo':
      return { kind: 'redo' };
    default: {
      const mark = FORMAT_MARKS.get(request.inputType);
      if (mark === undefined) return { kind: 'ignore' };
      return { kind: 'edit', doc: toggleMark(source, selection, mark), selection };
    }
  }
}

/**
 * The text of every line as the browser has it now (after an IME composition). The doc is changed to say the same, and the styles of
 * every letter that did not change stay. When the browser changed the NUMBER of lines (rare), the text is kept and the styles are lost.
 */
export function reconcileText(doc: RichDoc, texts: readonly string[], singleLine: boolean): RichDoc {
  const source = doc.length === 0 ? emptyDoc() : doc;
  let lines: string[];
  if (singleLine) lines = [oneLine(texts.join(' '))];
  else lines = texts.length === 0 ? [''] : [...texts];

  if (lines.length !== source.length) {
    return lines.map((text) => ({ runs: text === '' ? [] : [{ text, ...PLAIN_STYLE }], bullet: false }));
  }

  let result = source;
  lines.forEach((text, index) => {
    const line = result[index];
    if (line === undefined) return;
    const before = lineText(line);
    if (before === text) return;
    let start = 0;
    const most = Math.min(before.length, text.length);
    while (start < most && before.charCodeAt(start) === text.charCodeAt(start)) start += 1;
    let endBefore = before.length;
    let endAfter = text.length;
    while (endBefore > start && endAfter > start && before.charCodeAt(endBefore - 1) === text.charCodeAt(endAfter - 1)) {
      endBefore -= 1;
      endAfter -= 1;
    }
    const range: DocSelection = { anchor: { line: index, offset: start }, focus: { line: index, offset: endBefore } };
    result = replaceRange(result, range, text.slice(start, endAfter)).doc;
  });
  return result;
}
