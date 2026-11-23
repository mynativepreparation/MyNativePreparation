import { describe, expect, it } from 'vitest';
import { isId } from '../content/ids';
import type { Block } from '../content/types';
import {
  addChapterAfter,
  joinChapters,
  moveChapter,
  newTitleBlock,
  removeChapter,
  insertImageAt,
  splitChapters,
  type Chapter,
} from './chapters';

const title = (id: string, text = id): Block => ({ id, type: 'title', text });
const subtitle = (id: string, text = id): Block => ({ id, type: 'subtitle', text });
const text = (id: string, body = id): Block => ({ id, type: 'text', text: body });
const image = (id: string): Block => ({ id, type: 'image', src: `images/${id}.webp`, alt: '' });

const ids = (blocks: readonly Block[]): string[] => blocks.map((block) => block.id);
const titles = (chapters: readonly Chapter[]): (string | null)[] =>
  chapters.map((chapter) => (chapter.title === null ? null : chapter.title.id));

describe('splitChapters', () => {
  it('gives no chapters for an empty list', () => {
    expect(splitChapters([])).toEqual([]);
  });

  it('starts a new chapter at every title block', () => {
    const chapters = splitChapters([title('t1'), text('a'), image('i1'), title('t2'), subtitle('s'), text('b')]);
    expect(titles(chapters)).toEqual(['t1', 't2']);
    expect(chapters.map((chapter) => ids(chapter.body))).toEqual([['a', 'i1'], ['s', 'b']]);
  });

  it('puts blocks before the first title into a lead chapter without a title', () => {
    const chapters = splitChapters([text('a'), image('i1'), title('t1'), text('b')]);
    expect(titles(chapters)).toEqual([null, 't1']);
    expect(chapters.map((chapter) => ids(chapter.body))).toEqual([['a', 'i1'], ['b']]);
  });

  it('has no lead chapter when the list starts with a title', () => {
    expect(titles(splitChapters([title('t1'), text('a')]))).toEqual(['t1']);
  });

  it('keeps a chapter with only a title (empty body) and two titles in a row', () => {
    const chapters = splitChapters([title('t1'), title('t2'), text('a'), title('t3')]);
    expect(titles(chapters)).toEqual(['t1', 't2', 't3']);
    expect(chapters.map((chapter) => chapter.body.length)).toEqual([0, 1, 0]);
  });

  it('works for a list without any title (one lead chapter)', () => {
    const chapters = splitChapters([text('a'), text('b')]);
    expect(titles(chapters)).toEqual([null]);
    expect(ids(chapters.map((chapter) => chapter.body).flat())).toEqual(['a', 'b']);
  });

  it('never puts a title block into a body', () => {
    const chapters = splitChapters([text('a'), title('t1'), text('b'), title('t2')]);
    for (const chapter of chapters) {
      expect(chapter.body.map((block) => block.type)).not.toContain('title');
    }
  });

  it('does not change the list it was given and does not share its body arrays', () => {
    const input = [title('t1'), text('a')];
    const chapters = splitChapters(input);
    chapters.map((chapter) => chapter.body.push(text('x')));
    expect(ids(input)).toEqual(['t1', 'a']);
  });
});

describe('joinChapters', () => {
  const shapes: [string, Block[]][] = [
    ['empty', []],
    ['title only', [title('t1')]],
    ['lead and chapters', [text('a'), title('t1'), subtitle('s1'), text('b'), image('i1'), title('t2'), text('c')]],
    ['two titles in a row', [title('t1'), title('t2'), text('a')]],
    ['no title at all', [text('a'), image('i1')]],
    ['font and Gujarati text survive', [{ id: 't1', type: 'title', text: 'પ્રકરણ ૧', font: 'serif' }, { id: 'a', type: 'text', text: 'આ એક **ચકાસણી** છે.', font: 'humanist' }]],
  ];

  it.each(shapes)('is the exact inverse of splitChapters: %s', (_label, blocks) => {
    expect(joinChapters(splitChapters(blocks))).toEqual(blocks);
  });

  it('keeps every block id (same ids, same order)', () => {
    const blocks = [text('a'), title('t1'), text('b'), title('t2'), image('i1')];
    expect(ids(joinChapters(splitChapters(blocks)))).toEqual(ids(blocks));
  });

  it('writes the chapters in their new order', () => {
    const chapters = splitChapters([title('t1'), text('a'), title('t2'), text('b')]);
    const reversed = [chapters[1], chapters[0]].flatMap((chapter) => (chapter === undefined ? [] : [chapter]));
    expect(ids(joinChapters(reversed))).toEqual(['t2', 'b', 't1', 'a']);
  });
});

describe('addChapterAfter', () => {
  const base = (): Chapter[] => splitChapters([title('t1'), text('a'), title('t2'), text('b')]);

  it('inserts an empty, titled chapter after the given one and returns its position', () => {
    const result = addChapterAfter(base(), 0);
    expect(result.index).toBe(1);
    expect(result.chapters).toHaveLength(3);
    expect(titles(result.chapters).map((id) => (id === 't1' || id === 't2' ? id : 'new'))).toEqual(['t1', 'new', 't2']);
    expect(result.chapters.map((chapter) => chapter.body.length)).toEqual([1, 0, 1]);
  });

  it('gives the new chapter a title block with a new id, type title and empty text', () => {
    const result = addChapterAfter(base(), 1);
    const added = result.chapters.map((chapter) => chapter.title).filter((block) => block !== null && !['t1', 't2'].includes(block.id));
    expect(added.map((block) => block?.type)).toEqual(['title']);
    expect(added.map((block) => block?.text)).toEqual(['']);
    expect(added.map((block) => isId('blk', block?.id))).toEqual([true]);
  });

  it.each([[-1], [2], [99], [1.5], [Number.NaN]])('adds at the end for the invalid position %s', (index) => {
    const result = addChapterAfter(base(), index);
    expect(result.index).toBe(2);
    expect(result.chapters).toHaveLength(3);
  });

  it('works on an empty list', () => {
    const result = addChapterAfter([], 0);
    expect(result.index).toBe(0);
    expect(result.chapters).toHaveLength(1);
  });

  it('keeps the lead chapter first (the new chapter comes after it)', () => {
    const withLead = splitChapters([text('a'), title('t1')]);
    const result = addChapterAfter(withLead, 0);
    expect(result.index).toBe(1);
    expect(result.chapters.map((chapter) => chapter.title === null)).toEqual([true, false, false]);
  });

  it('does not change the list it was given', () => {
    const input = base();
    addChapterAfter(input, 0);
    expect(input).toHaveLength(2);
  });

  it('survives a join and split: the added chapter is still its own chapter', () => {
    const result = addChapterAfter(base(), 0);
    expect(splitChapters(joinChapters(result.chapters))).toHaveLength(3);
  });
});

describe('newTitleBlock', () => {
  it('makes a new empty title each time', () => {
    const a = newTitleBlock();
    const b = newTitleBlock();
    expect([a.type, a.text]).toEqual(['title', '']);
    expect(a.id).not.toBe(b.id);
  });
});

describe('removeChapter', () => {
  const base = (): Chapter[] => splitChapters([text('lead'), title('t1'), text('a'), title('t2'), text('b')]);

  it('removes the chapter with all its blocks', () => {
    expect(ids(joinChapters(removeChapter(base(), 1)))).toEqual(['lead', 't2', 'b']);
  });

  it('can remove the lead chapter', () => {
    expect(ids(joinChapters(removeChapter(base(), 0)))).toEqual(['t1', 'a', 't2', 'b']);
  });

  it('can remove the last remaining chapter', () => {
    expect(removeChapter(splitChapters([title('t1')]), 0)).toEqual([]);
  });

  it.each([[-1], [3], [1.5], [Number.NaN]])('changes nothing for the invalid position %s', (index) => {
    expect(ids(joinChapters(removeChapter(base(), index)))).toEqual(['lead', 't1', 'a', 't2', 'b']);
  });
});

describe('moveChapter', () => {
  const base = (): Chapter[] => splitChapters([title('t1'), text('a'), title('t2'), text('b'), title('t3'), text('c')]);
  const order = (chapters: readonly Chapter[]): string[] => ids(joinChapters(chapters));

  it('moves a chapter down', () => {
    expect(order(moveChapter(base(), 0, 2))).toEqual(['t2', 'b', 't3', 'c', 't1', 'a']);
  });

  it('moves a chapter up', () => {
    expect(order(moveChapter(base(), 2, 0))).toEqual(['t3', 'c', 't1', 'a', 't2', 'b']);
  });

  it('moves one step', () => {
    expect(order(moveChapter(base(), 1, 0))).toEqual(['t2', 'b', 't1', 'a', 't3', 'c']);
  });

  it('keeps every block id', () => {
    expect(order(moveChapter(base(), 0, 2)).slice().sort()).toEqual(order(base()).slice().sort());
  });

  it('changes nothing when from equals to', () => {
    expect(order(moveChapter(base(), 1, 1))).toEqual(order(base()));
  });

  it.each([[-1, 0], [0, -1], [3, 0], [0, 3], [0.5, 1], [0, Number.NaN]])('changes nothing for the invalid move %s -> %s', (from, to) => {
    expect(order(moveChapter(base(), from, to))).toEqual(order(base()));
  });

  describe('with a lead chapter', () => {
    const withLead = (): Chapter[] => splitChapters([text('lead'), title('t1'), text('a'), title('t2'), text('b')]);

    it('never moves the lead chapter', () => {
      expect(order(moveChapter(withLead(), 0, 2))).toEqual(order(withLead()));
    });

    it('never moves a chapter in front of the lead chapter', () => {
      expect(order(moveChapter(withLead(), 2, 0))).toEqual(['lead', 't2', 'b', 't1', 'a']);
    });

    it('still moves the other chapters normally', () => {
      expect(order(moveChapter(withLead(), 1, 2))).toEqual(['lead', 't2', 'b', 't1', 'a']);
    });

    it('keeps the list splitting into the same number of chapters', () => {
      expect(splitChapters(joinChapters(moveChapter(withLead(), 2, 0)))).toHaveLength(3);
    });
  });
});

describe('insertImageAt', () => {
  const body = (): Block[] => [text('a', 'Hello world'), image('i1'), text('b', 'Second')];
  const pic = image('new');
  const summary = (blocks: readonly Block[]): string[] => blocks.map((block) => (block.type === 'text' ? `${block.id}:${block.text}` : block.id));

  it('splits a text block in the middle: first half keeps the id, second half gets a new id', () => {
    const result = insertImageAt(body(), 'a', 5, pic);
    expect(result.map((block) => block.type)).toEqual(['text', 'image', 'text', 'image', 'text']);
    expect(result.map((block) => block.text ?? '')).toEqual(['Hello', '', 'world', '', 'Second']);
    const resultIds = ids(result);
    expect(resultIds[0]).toBe('a');
    expect(resultIds[1]).toBe('new');
    expect(isId('blk', resultIds[2])).toBe(true);
    expect(resultIds[2]).not.toBe('a');
  });

  it('drops the space or line break at the cut', () => {
    const lines = [text('a', 'First paragraph.\n\nSecond paragraph.')];
    const result = insertImageAt(lines, 'a', 17, pic);
    expect(result.map((block) => block.text ?? '')).toEqual(['First paragraph.', '', 'Second paragraph.']);
  });

  it('keeps marks and the font on both halves', () => {
    const marked: Block[] = [{ id: 'a', type: 'text', text: '**bold** and *italic*', font: 'serif' }];
    const result = insertImageAt(marked, 'a', 8, pic);
    expect(result.map((block) => block.font)).toEqual(['serif', undefined, 'serif']);
    expect(result.map((block) => block.text ?? '')).toEqual(['**bold**', '', 'and *italic*']);
  });

  it('puts the image BEFORE the block when the caret is at the start, block unchanged', () => {
    const result = insertImageAt(body(), 'a', 0, pic);
    expect(summary(result)).toEqual(['new', 'a:Hello world', 'i1', 'b:Second']);
  });

  it('puts the image AFTER the block when the caret is at the end', () => {
    const result = insertImageAt(body(), 'a', 11, pic);
    expect(summary(result)).toEqual(['a:Hello world', 'new', 'i1', 'b:Second']);
  });

  it('treats a caret beyond the end, a negative caret, NaN and Infinity safely', () => {
    expect(summary(insertImageAt(body(), 'a', 999, pic))).toEqual(['a:Hello world', 'new', 'i1', 'b:Second']);
    expect(summary(insertImageAt(body(), 'a', Number.POSITIVE_INFINITY, pic))).toEqual(['a:Hello world', 'new', 'i1', 'b:Second']);
    expect(summary(insertImageAt(body(), 'a', -5, pic))).toEqual(['new', 'a:Hello world', 'i1', 'b:Second']);
    expect(summary(insertImageAt(body(), 'a', Number.NaN, pic))).toEqual(['new', 'a:Hello world', 'i1', 'b:Second']);
  });

  it('treats only spaces before or after the caret as start or end (no empty text block)', () => {
    const padded = [text('a', '   Hello   ')];
    expect(summary(insertImageAt(padded, 'a', 2, pic))).toEqual(['new', 'a:   Hello   ']);
    expect(summary(insertImageAt(padded, 'a', 9, pic))).toEqual(['a:   Hello   ', 'new']);
  });

  it('never creates an empty text block', () => {
    for (let caret = -1; caret <= 13; caret += 1) {
      const result = insertImageAt(body(), 'a', caret, pic);
      const empties = result.filter((block) => block.type === 'text' && (block.text ?? '').trim() === '');
      expect(empties).toEqual([]);
    }
  });

  it('keeps all text: nothing is lost except the space at the cut', () => {
    for (let caret = 0; caret <= 11; caret += 1) {
      const result = insertImageAt(body(), 'a', caret, pic);
      const joined = result
        .filter((block) => block.id === 'a' || block.id.startsWith('blk-'))
        .map((block) => block.text ?? '')
        .join('')
        .replace(/ /g, '');
      expect(joined).toBe('Helloworld');
    }
  });

  it('does not cut a surrogate pair in half', () => {
    const emoji = [text('a', 'ab😀cd')];
    const result = insertImageAt(emoji, 'a', 3, pic);
    expect(result.map((block) => block.text ?? '')).toEqual(['ab😀', '', 'cd']);
  });

  it('splits Gujarati text', () => {
    const gujarati = [text('a', 'આ પ્રથમ ભાગ છે. આ બીજો ભાગ છે.')];
    const cut = 'આ પ્રથમ ભાગ છે.'.length;
    const result = insertImageAt(gujarati, 'a', cut, pic);
    expect(result.map((block) => block.text ?? '')).toEqual(['આ પ્રથમ ભાગ છે.', '', 'આ બીજો ભાગ છે.']);
  });

  it('puts the image after a block that is not text', () => {
    expect(summary(insertImageAt(body(), 'i1', 3, pic))).toEqual(['a:Hello world', 'i1', 'new', 'b:Second']);
  });

  it('puts the image at the end for an unknown block id', () => {
    expect(summary(insertImageAt(body(), 'zzz', 0, pic))).toEqual(['a:Hello world', 'i1', 'b:Second', 'new']);
  });

  it('works on an empty body', () => {
    expect(summary(insertImageAt([], 'a', 0, pic))).toEqual(['new']);
  });

  it('does not change the body it was given', () => {
    const input = body();
    insertImageAt(input, 'a', 5, pic);
    expect(summary(input)).toEqual(['a:Hello world', 'i1', 'b:Second']);
  });

  it('keeps the other ids exactly as they were', () => {
    const result = insertImageAt(body(), 'a', 5, pic);
    expect(result.map((block) => block.id).filter((id) => ['a', 'i1', 'b', 'new'].includes(id))).toEqual(['a', 'new', 'i1', 'b']);
  });
});
