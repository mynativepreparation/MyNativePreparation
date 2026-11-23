import { newId } from '../content/ids';
import { IMAGE_HEIGHT_RANGE, IMAGE_WIDTH_RANGE, type Block, type ImageAlign } from '../content/types';
import { PARAGRAPH_GAP } from './chapterText';
import type { Chapter } from './chapters';

// The Content of a chapter as the window shows it once pictures sit INSIDE the text (P10 T11o step O1, DECISIONS Q26 d).
// The files stay flat (docs/CONTENT-FORMAT.md): the body of a chapter is a list of blocks in reading order. For the window the body is cut at
// every picture (an `image` block) into SLOTS and PICTURES: slot, picture, slot, picture, ..., slot. There is always one more slot than
// pictures, so there is always a text box before and after every picture (the slot may be empty).
//  - A slot is the text blocks between two pictures, one after the other, a blank line between them (like `chapterText`).
//    Its key is `START_SLOT` for the first slot and the id of the picture in front of it for every other slot, so a key survives typing.
//  - Editing a slot touches only that slot: the first text block of the slot keeps its place, id and other fields and gets the text, the other
//    text blocks of the slot are removed, empty text removes them all, and a slot with no text block yet gets a new block (right after the
//    picture in front of it, or after the first subtitle for the first slot).
//  - Blocks that are neither text nor pictures (extra subtitles) are never touched and stay where they are.
// Pure functions: no DOM, no storage. Nothing is changed in place; the input is never modified, and an unchanged result is the SAME object.

/** Key of the text slot in front of the first picture. */
export const START_SLOT = 'start';

export type ContentItem = { kind: 'slot'; key: string; text: string } | { kind: 'picture'; block: Block };

/** Where one slot lives in the body. */
interface SlotSpan {
  key: string;
  /** Index of the first block after the picture in front of this slot (0 for the first slot). */
  from: number;
  /** Index of the picture that ends this slot (the body length for the last slot). */
  to: number;
  /** Indexes of the text blocks inside the slot. */
  texts: number[];
}

function spansOf(body: readonly Block[]): SlotSpan[] {
  const spans: SlotSpan[] = [];
  let current: SlotSpan = { key: START_SLOT, from: 0, to: body.length, texts: [] };
  body.forEach((block, index) => {
    if (block.type === 'image') {
      current.to = index;
      spans.push(current);
      current = { key: block.id, from: index + 1, to: body.length, texts: [] };
    } else if (block.type === 'text') {
      current.texts.push(index);
    }
  });
  spans.push(current);
  return spans;
}

function textOf(body: readonly Block[], span: SlotSpan): string {
  return span.texts.map((index) => body[index]?.text ?? '').join(PARAGRAPH_GAP);
}

/** Where a NEW text block of an empty slot goes: after the picture in front of it, or (first slot) after the first subtitle. */
function newTextIndex(body: readonly Block[], span: SlotSpan): number {
  if (span.key !== START_SLOT) return span.from;
  for (let index = span.from; index < span.to; index += 1) {
    if (body[index]?.type === 'subtitle') return index + 1;
  }
  return span.from;
}

/** The content of a chapter in reading order: slot, picture, slot, ..., slot. Always an odd number of items, at least one. */
export function chapterToItems(chapter: Chapter): ContentItem[] {
  const body = chapter.body;
  const items: ContentItem[] = [];
  for (const span of spansOf(body)) {
    items.push({ kind: 'slot', key: span.key, text: textOf(body, span) });
    const picture = body[span.to];
    if (picture !== undefined) items.push({ kind: 'picture', block: picture });
  }
  return items;
}

/** The chapter with the text of ONE slot replaced. An unknown key or an unchanged text returns the very same chapter. */
export function applySlotText(chapter: Chapter, key: string, text: string): Chapter {
  const body = chapter.body;
  const span = spansOf(body).find((candidate) => candidate.key === key);
  if (span === undefined || textOf(body, span) === text) return chapter;

  const first = span.texts[0];
  if (first === undefined) {
    const next = [...body];
    next.splice(newTextIndex(body, span), 0, { id: newId('blk'), type: 'text', text });
    return { title: chapter.title, body: next };
  }
  const removed = new Set(text === '' ? span.texts : span.texts.slice(1));
  const next = body.flatMap((block, index) => {
    if (removed.has(index)) return [];
    return index === first && text !== '' ? [{ ...block, text }] : [block];
  });
  return { title: chapter.title, body: next };
}

export interface PictureSplit {
  /** The text of the slot in front of the cursor (stays in the slot). */
  before: string;
  /** The text after the cursor (goes into the slot behind the new picture). */
  after: string;
}

/**
 * Puts `image` into the slot `key` at the cursor: the slot keeps `split.before`, the picture follows, and `split.after` becomes a new text
 * block behind it (with the font of the slot's first text block). Empty halves make no block. A picture block whose id is already in the
 * chapter, a block that is not an image and an unknown key change nothing.
 */
export function insertPicture(chapter: Chapter, key: string, split: PictureSplit, image: Block): Chapter {
  if (image.type !== 'image' || chapter.body.some((block) => block.id === image.id)) return chapter;
  const span = spansOf(chapter.body).find((candidate) => candidate.key === key);
  if (span === undefined) return chapter;
  const firstIndex = span.texts[0];
  const original = firstIndex === undefined ? undefined : chapter.body[firstIndex];

  const trimmed = applySlotText(chapter, key, split.before);
  const trimmedSpan = spansOf(trimmed.body).find((candidate) => candidate.key === key);
  if (trimmedSpan === undefined) return chapter;
  const lastText = trimmedSpan.texts[trimmedSpan.texts.length - 1];
  const at = lastText === undefined ? newTextIndex(trimmed.body, trimmedSpan) : lastText + 1;

  const inserted: Block[] = [image];
  if (split.after !== '') {
    const after: Block = { id: newId('blk'), type: 'text', text: split.after };
    if (original?.font !== undefined) after.font = original.font;
    inserted.push(after);
  }
  const next = [...trimmed.body];
  next.splice(at, 0, ...inserted);
  return { title: chapter.title, body: next };
}

export interface PicturePatch {
  alt?: string;
  /** `null` removes the field (the picture is centred again). */
  align?: ImageAlign | null;
  /** Whole percent of the column width. `null` removes the field (natural size). A number outside the allowed range is brought into it. */
  width?: number | null;
  /** Whole percent of the natural height. `null` removes the field (keep the proportions). */
  height?: number | null;
}

function clampWhole(value: number, range: { min: number; max: number }): number {
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

/** The chapter with some fields of ONE picture changed. Unknown ids, ids of other blocks and changes that change nothing return the same chapter. */
export function updatePicture(chapter: Chapter, id: string, patch: PicturePatch): Chapter {
  const at = chapter.body.findIndex((block) => block.id === id && block.type === 'image');
  const block = chapter.body[at];
  if (block === undefined) return chapter;

  const next: Block = { ...block };
  if (patch.alt !== undefined) next.alt = patch.alt;
  if (patch.align === null) delete next.align;
  else if (patch.align !== undefined) next.align = patch.align;
  if (patch.width === null) delete next.width;
  else if (patch.width !== undefined && Number.isFinite(patch.width)) next.width = clampWhole(patch.width, IMAGE_WIDTH_RANGE);
  if (patch.height === null) delete next.height;
  else if (patch.height !== undefined && Number.isFinite(patch.height)) next.height = clampWhole(patch.height, IMAGE_HEIGHT_RANGE);

  const same =
    next.alt === block.alt && next.align === block.align && next.width === block.width && next.height === block.height;
  if (same) return chapter;
  return { title: chapter.title, body: chapter.body.map((existing, index) => (index === at ? next : existing)) };
}

/** The chapter without ONE picture. The slots in front of and behind it become one slot (their texts are joined by a blank line). */
export function removePicture(chapter: Chapter, id: string): Chapter {
  const at = chapter.body.findIndex((block) => block.id === id && block.type === 'image');
  if (at < 0) return chapter;
  return { title: chapter.title, body: chapter.body.filter((_, index) => index !== at) };
}
