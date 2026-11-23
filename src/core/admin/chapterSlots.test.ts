import { describe, expect, it } from 'vitest';
import type { Block, FontKind } from '../content/types';
import { PARAGRAPH_GAP } from './chapterText';
import {
  applySlotText,
  chapterToItems,
  insertPicture,
  removePicture,
  START_SLOT,
  updatePicture,
  type ContentItem,
} from './chapterSlots';
import type { Chapter } from './chapters';

// The Content of a chapter cut into slots and pictures (P10 T11o O1). Block ids here are short hand-made ones; ids the code makes are `blk-...`.

const text = (id: string, value: string, font?: FontKind): Block =>
  font === undefined ? { id, type: 'text', text: value } : { id, type: 'text', text: value, font };
const subtitle = (id: string, value: string): Block => ({ id, type: 'subtitle', text: value });
const pic = (id: string, extra: Partial<Block> = {}): Block => ({ id, type: 'image', src: `images/${id}.webp`, alt: '', ...extra });
const chapterOf = (...body: Block[]): Chapter => ({ title: { id: 'blk-t', type: 'title', text: 'T' }, body });

const ids = (chapter: Chapter) => chapter.body.map((block) => block.id);
const slotTexts = (items: ContentItem[]) => items.flatMap((item) => (item.kind === 'slot' ? [item.text] : []));
const kinds = (items: ContentItem[]) => items.map((item) => item.kind);

describe('chapterToItems', () => {
  it('an empty chapter has one empty start slot', () => {
    expect(chapterToItems(chapterOf())).toEqual([{ kind: 'slot', key: START_SLOT, text: '' }]);
  });

  it('text only: one slot, the text blocks joined by a blank line', () => {
    const items = chapterToItems(chapterOf(text('a', 'A'), text('b', 'B')));
    expect(items).toEqual([{ kind: 'slot', key: START_SLOT, text: `A${PARAGRAPH_GAP}B` }]);
  });

  it('pictures cut the text into slots: always slot, picture, slot, ..., slot', () => {
    const items = chapterToItems(chapterOf(text('a', 'A'), text('b', 'B'), pic('p'), text('c', 'C'), pic('q')));
    expect(kinds(items)).toEqual(['slot', 'picture', 'slot', 'picture', 'slot']);
    expect(slotTexts(items)).toEqual([`A${PARAGRAPH_GAP}B`, 'C', '']);
    expect(items.map((item) => (item.kind === 'slot' ? item.key : item.block.id))).toEqual([START_SLOT, 'p', 'p', 'q', 'q']);
  });

  it('a picture at the very start leaves an empty start slot in front of it', () => {
    const items = chapterToItems(chapterOf(pic('p'), text('a', 'A')));
    expect(kinds(items)).toEqual(['slot', 'picture', 'slot']);
    expect(slotTexts(items)).toEqual(['', 'A']);
  });

  it('subtitles are not slot text', () => {
    const items = chapterToItems(chapterOf(subtitle('s', 'Sub'), text('a', 'A'), subtitle('s2', 'More'), text('b', 'B')));
    expect(slotTexts(items)).toEqual([`A${PARAGRAPH_GAP}B`]);
  });

  it('keeps Gujarati text as it is', () => {
    expect(slotTexts(chapterToItems(chapterOf(text('a', 'ગણિતનું પ્રથમ પ્રકરણ'))))).toEqual(['ગણિતનું પ્રથમ પ્રકરણ']);
  });
});

describe('applySlotText', () => {
  it('an unchanged text or an unknown key returns the same chapter', () => {
    const chapter = chapterOf(text('a', 'A'), pic('p'), text('c', 'C'));
    expect(applySlotText(chapter, START_SLOT, 'A')).toBe(chapter);
    expect(applySlotText(chapter, 'p', 'C')).toBe(chapter);
    expect(applySlotText(chapter, 'nope', 'X')).toBe(chapter);
    expect(applySlotText(chapterOf(), START_SLOT, '')).toEqual(chapterOf());
  });

  it('changes the first text block in place (id and font kept), drops the others of that slot and leaves the rest alone', () => {
    const c = text('c', 'C');
    const chapter = chapterOf(text('a', 'A', 'serif'), text('b', 'B'), pic('p'), c);
    const result = applySlotText(chapter, START_SLOT, 'X');
    expect(ids(result)).toEqual(['a', 'p', 'c']);
    expect(result.body.map((block) => block.text)).toEqual(['X', undefined, 'C']);
    expect(result.body.map((block) => block.font)).toEqual(['serif', undefined, undefined]);
    expect(result.body[2]).toBe(c);
  });

  it('empty text removes all the text blocks of that slot only', () => {
    const chapter = chapterOf(text('a', 'A'), pic('p'), text('c', 'C'), text('d', 'D'));
    expect(ids(applySlotText(chapter, 'p', ''))).toEqual(['a', 'p']);
    expect(ids(applySlotText(chapter, START_SLOT, ''))).toEqual(['p', 'c', 'd']);
  });

  it('new text in a slot with no text block goes right after the picture in front of it', () => {
    const result = applySlotText(chapterOf(text('a', 'A'), pic('p')), 'p', 'Z');
    expect(result.body.map((block) => block.type)).toEqual(['text', 'image', 'text']);
    expect(result.body.map((block) => block.text)).toEqual(['A', undefined, 'Z']);
    expect(result.body[2]?.id).toMatch(/^blk-/);
  });

  it('new text in an empty start slot goes after the first subtitle, or first when there is none', () => {
    const withSubtitle = applySlotText(chapterOf(subtitle('s', 'Sub'), pic('p')), START_SLOT, 'Hello');
    expect(withSubtitle.body.map((block) => block.type)).toEqual(['subtitle', 'text', 'image']);
    const without = applySlotText(chapterOf(pic('p')), START_SLOT, 'Hello');
    expect(without.body.map((block) => block.type)).toEqual(['text', 'image']);
  });

  it('never changes its input', () => {
    const chapter = chapterOf(text('a', 'A'), text('b', 'B'), pic('p'));
    const before = JSON.stringify(chapter);
    applySlotText(chapter, START_SLOT, 'X');
    applySlotText(chapter, START_SLOT, '');
    expect(JSON.stringify(chapter)).toBe(before);
  });
});

describe('insertPicture', () => {
  it('splits the slot at the cursor: the first half keeps its block, the second half is a new block with the same font', () => {
    const chapter = chapterOf(text('a', 'AB', 'serif'));
    const result = insertPicture(chapter, START_SLOT, { before: 'A', after: 'B' }, pic('p'));
    expect(result.body.map((block) => block.type)).toEqual(['text', 'image', 'text']);
    expect(result.body.map((block) => block.text)).toEqual(['A', undefined, 'B']);
    expect(result.body.map((block) => block.font)).toEqual(['serif', undefined, 'serif']);
    expect(ids(result).slice(0, 2)).toEqual(['a', 'p']);
    expect(result.body[2]?.id).toMatch(/^blk-/);
    expect(slotTexts(chapterToItems(result))).toEqual(['A', 'B']);
  });

  it('a cursor at the start puts the picture first, and the text becomes the slot behind it', () => {
    const result = insertPicture(chapterOf(text('a', 'AB')), START_SLOT, { before: '', after: 'AB' }, pic('p'));
    expect(result.body.map((block) => block.type)).toEqual(['image', 'text']);
    const items = chapterToItems(result);
    expect(kinds(items)).toEqual(['slot', 'picture', 'slot']);
    expect(slotTexts(items)).toEqual(['', 'AB']);
  });

  it('a cursor at the end puts the picture last', () => {
    const result = insertPicture(chapterOf(text('a', 'AB')), START_SLOT, { before: 'AB', after: '' }, pic('p'));
    expect(ids(result)).toEqual(['a', 'p']);
  });

  it('works in a chapter with no text, with or without a subtitle', () => {
    expect(ids(insertPicture(chapterOf(), START_SLOT, { before: '', after: '' }, pic('p')))).toEqual(['p']);
    expect(ids(insertPicture(chapterOf(subtitle('s', 'Sub')), START_SLOT, { before: '', after: '' }, pic('p')))).toEqual(['s', 'p']);
  });

  it('works in a later slot (key = the picture in front of it) and leaves the earlier slots alone', () => {
    const chapter = chapterOf(text('a', 'A'), pic('p'), text('c', 'CD'));
    const result = insertPicture(chapter, 'p', { before: 'C', after: 'D' }, pic('q'));
    expect(result.body.map((block) => block.type)).toEqual(['text', 'image', 'text', 'image', 'text']);
    expect(ids(result).slice(0, 4)).toEqual(['a', 'p', 'c', 'q']);
    expect(slotTexts(chapterToItems(result))).toEqual(['A', 'C', 'D']);
  });

  it('a picture id that is already there, a block that is not a picture and an unknown key change nothing', () => {
    const chapter = chapterOf(text('a', 'AB'), pic('p'));
    expect(insertPicture(chapter, START_SLOT, { before: 'A', after: 'B' }, pic('p'))).toBe(chapter);
    expect(insertPicture(chapter, START_SLOT, { before: 'A', after: 'B' }, text('x', 'X'))).toBe(chapter);
    expect(insertPicture(chapter, 'nope', { before: 'A', after: 'B' }, pic('q'))).toBe(chapter);
  });

  it('never changes its input', () => {
    const chapter = chapterOf(text('a', 'AB'));
    const before = JSON.stringify(chapter);
    insertPicture(chapter, START_SLOT, { before: 'A', after: 'B' }, pic('p'));
    expect(JSON.stringify(chapter)).toBe(before);
  });
});

describe('updatePicture', () => {
  it('sets alt, align, width and height of that picture only', () => {
    const other = pic('q');
    const chapter = chapterOf(pic('p'), other);
    const result = updatePicture(chapter, 'p', { alt: 'A map', align: 'left', width: 40, height: 80 });
    expect(result.body.map((block) => block.alt)).toEqual(['A map', '']);
    expect(result.body.map((block) => block.align)).toEqual(['left', undefined]);
    expect(result.body.map((block) => block.width)).toEqual([40, undefined]);
    expect(result.body.map((block) => block.height)).toEqual([80, undefined]);
    expect(result.body[1]).toBe(other);
  });

  it('null removes align, width and height', () => {
    const chapter = chapterOf(pic('p', { align: 'right', width: 50, height: 120 }));
    const result = updatePicture(chapter, 'p', { align: null, width: null, height: null });
    for (const field of ['align', 'width', 'height']) {
      expect(result.body.map((block) => field in block)).toEqual([false]);
    }
  });

  it('brings a size into the allowed range and rounds it to a whole percent', () => {
    const chapter = chapterOf(pic('p'));
    const at = (width: number, height: number) => {
      const result = updatePicture(chapter, 'p', { width, height });
      return result.body.map((block) => [block.width, block.height]);
    };
    expect(at(5, 5)).toEqual([[10, 10]]);
    expect(at(400, 1000)).toEqual([[100, 300]]);
    expect(at(33.4, 99.6)).toEqual([[33, 100]]);
  });

  it('a number that is not a number is ignored', () => {
    const chapter = chapterOf(pic('p'));
    expect(updatePicture(chapter, 'p', { width: Number.NaN, height: Number.POSITIVE_INFINITY })).toBe(chapter);
  });

  it('a change that changes nothing, an unknown id and the id of a text block return the same chapter', () => {
    const chapter = chapterOf(text('a', 'A'), pic('p', { align: 'left', width: 40 }));
    expect(updatePicture(chapter, 'p', { align: 'left', width: 40 })).toBe(chapter);
    expect(updatePicture(chapter, 'nope', { width: 50 })).toBe(chapter);
    expect(updatePicture(chapter, 'a', { width: 50 })).toBe(chapter);
  });

  it('never changes its input', () => {
    const chapter = chapterOf(pic('p', { width: 40 }));
    const before = JSON.stringify(chapter);
    updatePicture(chapter, 'p', { width: 60, align: null });
    expect(JSON.stringify(chapter)).toBe(before);
  });
});

describe('removePicture', () => {
  it('removes the picture, and the slots around it become one slot', () => {
    const chapter = chapterOf(text('a', 'A'), pic('p'), text('c', 'C'));
    const result = removePicture(chapter, 'p');
    expect(ids(result)).toEqual(['a', 'c']);
    expect(chapterToItems(result)).toEqual([{ kind: 'slot', key: START_SLOT, text: `A${PARAGRAPH_GAP}C` }]);
  });

  it('an unknown id and the id of a text block return the same chapter', () => {
    const chapter = chapterOf(text('a', 'A'), pic('p'));
    expect(removePicture(chapter, 'nope')).toBe(chapter);
    expect(removePicture(chapter, 'a')).toBe(chapter);
  });

  it('inserting and removing a picture gives the same words back', () => {
    const chapter = chapterOf(text('a', 'AB'));
    const inserted = insertPicture(chapter, START_SLOT, { before: 'A', after: 'B' }, pic('p'));
    const back = removePicture(inserted, 'p');
    expect(slotTexts(chapterToItems(back))).toEqual([`A${PARAGRAPH_GAP}B`]);
  });
});
