import { addChapterAfter, moveChapter, removeChapter, type Chapter } from './chapters';

// The chapters of one part (Overview or Content) while the course window is open (P10 T11f, DECISIONS Q25).
// Pure functions on top of `chapters.ts`. The window keeps a `Chapter[]` per part. While the person TYPES nothing is tidied, so the
// chapter in front of them never jumps away; the structural actions (add, delete, move) drop an empty "start of the text" chapter,
// because it holds nothing and `joinChapters` gives the same blocks without it. Chapters are followed by identity, never by guessing.

/** A 'start of the text' chapter (no title) with no blocks: it saves as nothing. */
export function isEmptyLead(chapter: Chapter): boolean {
  return chapter.title === null && chapter.body.length === 0;
}

/** A chapter with no title text and no blocks, for example one that was added and never filled: Save leaves it out. */
export function isBlankChapter(chapter: Chapter): boolean {
  return (chapter.title === null || (chapter.title.text ?? '').trim() === '') && chapter.body.length === 0;
}

/** The chapters that are worth saving (blank ones are left out). */
export function withoutBlankChapters(chapters: readonly Chapter[]): Chapter[] {
  return chapters.filter((chapter) => !isBlankChapter(chapter));
}

/** What the window shows: a part with no chapter yet shows ONE empty "start of the text" chapter to type into. */
export function visibleChapters(chapters: readonly Chapter[]): Chapter[] {
  return chapters.length === 0 ? [{ title: null, body: [] }] : [...chapters];
}

function withoutEmptyLead(chapters: readonly Chapter[]): Chapter[] {
  return chapters.filter((chapter) => !isEmptyLead(chapter));
}

/** `index` as a position that exists in a list of `count` chapters (0 when the list is empty). */
export function clampIndex(count: number, index: number): number {
  if (!Number.isInteger(index)) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

/**
 * Replaces the chapter shown at `index` (see `visibleChapters`) by `chapter`. No tidy: an emptied chapter stays where it is.
 * A part with no chapters that is still an empty "start of the text" stays an empty list.
 */
export function updateChapterAt(chapters: readonly Chapter[], index: number, chapter: Chapter): Chapter[] {
  const shown = visibleChapters(chapters);
  if (!Number.isInteger(index) || index < 0 || index >= shown.length) return [...chapters];
  if (chapters.length === 0 && isEmptyLead(chapter)) return [];
  return shown.map((existing, position) => (position === index ? chapter : existing));
}

/** Adds an empty titled chapter after the one at `index`; `index` of the result is the new chapter. */
export function addAfter(chapters: readonly Chapter[], index: number): { chapters: Chapter[]; index: number } {
  const added = addChapterAfter(visibleChapters(chapters), index);
  const created = added.chapters[added.index];
  const next = withoutEmptyLead(added.chapters);
  const position = created === undefined ? -1 : next.indexOf(created);
  return { chapters: next, index: position < 0 ? clampIndex(next.length, next.length - 1) : position };
}

/** Deletes the chapter at `index` with everything in it; `index` of the result is the chapter that took its place (or the last one). */
export function removeAt(chapters: readonly Chapter[], index: number): { chapters: Chapter[]; index: number } {
  const next = withoutEmptyLead(removeChapter(visibleChapters(chapters), index));
  return { chapters: next, index: clampIndex(next.length, index) };
}

/** True when the chapter at `index` can move one place (`delta` -1 up, 1 down). The "start of the text" chapter never moves. */
export function canMove(shown: readonly Chapter[], index: number, delta: -1 | 1): boolean {
  const moving = shown[index];
  if (moving === undefined || moving.title === null) return false;
  const to = index + delta;
  if (to < 0 || to >= shown.length) return false;
  const hasLead = shown[0]?.title === null;
  return !(hasLead && to === 0);
}

/** Moves the chapter at `index` one place; `index` of the result is where that same chapter is now. */
export function moveBy(
  chapters: readonly Chapter[],
  index: number,
  delta: -1 | 1,
): { chapters: Chapter[]; index: number } {
  const shown = visibleChapters(chapters);
  const moving = shown[index];
  if (moving === undefined || !canMove(shown, index, delta)) return { chapters: [...chapters], index: clampIndex(shown.length, index) };
  const next = withoutEmptyLead(moveChapter(shown, index, index + delta));
  const position = next.indexOf(moving);
  return { chapters: next, index: position < 0 ? 0 : position };
}

/** The number shown to people: titled chapters are counted from 1, the "start of the text" chapter has none (0). */
export function chapterNumber(shown: readonly Chapter[], index: number): number {
  return shown.slice(0, index + 1).filter((chapter) => chapter.title !== null).length;
}
