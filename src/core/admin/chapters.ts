import { newId } from '../content/ids';
import type { Block } from '../content/types';

// Chapters of a flat block list (P10 T11d, DECISIONS Q25). The files stay flat (`blocks: Block[]`, docs/CONTENT-FORMAT.md);
// a chapter is only a VIEW: a `title` block plus the blocks after it, up to the next `title` block.
// Blocks before the first title form a "lead" chapter without a title. A lead chapter may only sit at index 0
// (anywhere else it would merge into the chapter before it when the list is joined again), and the functions below keep it there.
// Pure functions: no DOM, no storage. Block ids are never changed, except that a split text block gives its second half a NEW id.

export interface Chapter {
  /** The chapter's title block; null only for the lead chapter. */
  title: Block | null;
  /** The blocks after the title (subtitle, text, image). Never contains a `title` block. */
  body: Block[];
}

/** Flat blocks -> chapters. A new chapter starts at each `title` block. An empty list gives no chapters. */
export function splitChapters(blocks: readonly Block[]): Chapter[] {
  const chapters: Chapter[] = [];
  let current: Chapter | null = null;
  for (const block of blocks) {
    if (block.type === 'title') {
      current = { title: block, body: [] };
      chapters.push(current);
      continue;
    }
    if (current === null) {
      current = { title: null, body: [] };
      chapters.push(current);
    }
    current.body.push(block);
  }
  return chapters;
}

/** Chapters -> the flat block list (the same blocks, the same ids). `joinChapters(splitChapters(x))` equals `x`. */
export function joinChapters(chapters: readonly Chapter[]): Block[] {
  return chapters.flatMap((chapter) => (chapter.title === null ? [...chapter.body] : [chapter.title, ...chapter.body]));
}

/** An empty title block with a new id (the editor shows it as an empty Title box; validation asks for text before Save). */
export function newTitleBlock(): Block {
  return { id: newId('blk'), type: 'title', text: '' };
}

/**
 * Adds an empty chapter AFTER the chapter at `index`. An index that is not a valid chapter position (negative, too big, not a whole
 * number) adds it at the end. Returns the new list and the position of the new chapter.
 */
export function addChapterAfter(
  chapters: readonly Chapter[],
  index: number,
): { chapters: Chapter[]; index: number } {
  const valid = Number.isInteger(index) && index >= 0 && index < chapters.length;
  const at = valid ? index + 1 : chapters.length;
  const next = [...chapters];
  next.splice(at, 0, { title: newTitleBlock(), body: [] });
  return { chapters: next, index: at };
}

/** Removes the chapter at `index` (with all its blocks). An invalid index changes nothing. */
export function removeChapter(chapters: readonly Chapter[], index: number): Chapter[] {
  if (!Number.isInteger(index) || index < 0 || index >= chapters.length) return [...chapters];
  return chapters.filter((_, position) => position !== index);
}

/**
 * Moves the chapter at `from` to position `to`. Nothing moves for an invalid position, for the lead chapter (it stays first),
 * and nothing can move in front of the lead chapter.
 */
export function moveChapter(chapters: readonly Chapter[], from: number, to: number): Chapter[] {
  const moving = chapters[from];
  const inRange = Number.isInteger(from) && Number.isInteger(to) && to >= 0 && to < chapters.length;
  if (!inRange || moving === undefined || moving.title === null) return [...chapters];

  const hasLead = chapters[0]?.title === null;
  const target = hasLead && to === 0 ? 1 : to;
  if (target === from) return [...chapters];

  const next = [...chapters];
  next.splice(from, 1);
  next.splice(target, 0, moving);
  return next;
}

/** `caret` as a safe cut position of `text`: a whole number inside the text, never between the two halves of a surrogate pair. */
function safeCaret(text: string, caret: number): number {
  const wanted = Number.isNaN(caret) ? 0 : Math.trunc(caret);
  const cut = Math.max(0, Math.min(text.length, wanted));
  if (cut > 0 && cut < text.length) {
    const before = text.charCodeAt(cut - 1);
    const after = text.charCodeAt(cut);
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) return cut + 1;
  }
  return cut;
}

/**
 * Puts `image` into a chapter body at the caret of the text block `blockId` (the caret is the textarea's `selectionStart`).
 * - caret in the middle: the text block is split in two. The first half keeps the block id, the second half gets a new id
 *   and the same `font`. Spaces and line breaks at the cut are dropped, so no half is empty or starts with a blank line.
 * - caret at the start (or only spaces before it): the image goes BEFORE the block, the block is unchanged.
 * - caret at the end (or only spaces after it): the image goes AFTER the block.
 * - `blockId` is not a text block: the image goes after that block; an unknown id puts the image at the end.
 */
export function insertImageAt(body: readonly Block[], blockId: string, caret: number, image: Block): Block[] {
  const at = body.findIndex((block) => block.id === blockId);
  const block = body[at];
  if (block === undefined) return [...body, image];

  const head = body.slice(0, at);
  const tail = body.slice(at + 1);
  if (block.type !== 'text' || block.text === undefined) return [...head, block, image, ...tail];

  const cut = safeCaret(block.text, caret);
  const first = block.text.slice(0, cut).trimEnd();
  const second = block.text.slice(cut).trimStart();
  if (first === '') return [...head, image, block, ...tail];
  if (second === '') return [...head, block, image, ...tail];

  return [...head, { ...block, text: first }, image, { ...block, id: newId('blk'), text: second }, ...tail];
}
