import type { PictureSplit } from './chapterSlots';
import {
  docToText,
  emptyDoc,
  flatToPosition,
  lineLength,
  mergeRuns,
  positionToFlat,
  sliceRuns,
  type DocLine,
  type DocPosition,
  type DocSelection,
  type RichDoc,
} from './richDoc';

// Cutting a rich box in two at the caret (P10 T11o step O3). A picture added from the toolbar goes INTO the text: the box keeps what is in
// front of the caret, the picture follows, and what is behind the caret becomes the text box after the picture. The doc is cut as a RichDoc
// (not as the stored string), so a bold or coloured word that is cut in two stays bold or coloured in both halves.
// Pure functions: no DOM, no storage. The input doc is never changed.

export interface DocHalves {
  before: RichDoc;
  after: RichDoc;
}

function endPosition(doc: RichDoc): DocPosition {
  const last = doc[doc.length - 1];
  return last === undefined ? { line: 0, offset: 0 } : { line: doc.length - 1, offset: lineLength(last) };
}

/**
 * The place where a picture goes: the END of the selection (a caret is its own end, and it does not matter in which direction the
 * selection was made). Nothing known about the selection (`null`) means the end of the doc. A place outside the doc is brought into it.
 */
export function pictureCaret(doc: RichDoc, selection: DocSelection | null): DocPosition {
  if (selection === null) return endPosition(doc);
  const anchor = positionToFlat(doc, selection.anchor);
  const focus = positionToFlat(doc, selection.focus);
  return flatToPosition(doc, Math.max(anchor, focus));
}

function halfLine(line: DocLine, runs: DocLine['runs']): DocLine {
  const half: DocLine = { runs: mergeRuns(runs), bullet: line.bullet };
  if (line.box !== undefined) half.box = line.box;
  return half;
}

/**
 * The doc in two at `caret`. A half of the cut line with no text is left out (no empty bullet is written), and a half with no line at all
 * is an empty doc. The paragraph box and the bullet of the cut line stay on both halves.
 */
export function splitDoc(doc: RichDoc, caret: DocPosition): DocHalves {
  const lines = doc.length === 0 ? emptyDoc() : doc;
  const index = Math.min(Math.max(caret.line, 0), lines.length - 1);
  const here = lines[index];
  if (here === undefined) return { before: lines, after: emptyDoc() };
  const offset = Math.min(Math.max(caret.offset, 0), lineLength(here));
  const head = sliceRuns(here.runs, 0, offset);
  const tail = sliceRuns(here.runs, offset, Number.POSITIVE_INFINITY);
  const before = [...lines.slice(0, index), ...(head.length > 0 ? [halfLine(here, head)] : [])];
  const after = [...(tail.length > 0 ? [halfLine(here, tail)] : []), ...lines.slice(index + 1)];
  return { before: before.length > 0 ? before : emptyDoc(), after: after.length > 0 ? after : emptyDoc() };
}

/** The two stored strings for `insertPicture` (core/admin/chapterSlots.ts): the doc cut at the end of `selection`. */
export function splitDocText(doc: RichDoc, selection: DocSelection | null): PictureSplit {
  const halves = splitDoc(doc, pictureCaret(doc, selection));
  return { before: docToText(halves.before), after: docToText(halves.after) };
}
