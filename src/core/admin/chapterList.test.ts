import { describe, expect, it } from 'vitest';
import type { Block } from '../content/types';
import {
  addAfter,
  canMove,
  chapterNumber,
  clampIndex,
  isBlankChapter,
  isEmptyLead,
  moveBy,
  removeAt,
  updateChapterAt,
  visibleChapters,
  withoutBlankChapters,
} from './chapterList';
import type { Chapter } from './chapters';

const block = (id: string, text: string): Block => ({ id, type: 'text', text });
const chapter = (id: string | null, ...bodyIds: string[]): Chapter => ({
  title: id === null ? null : { id, type: 'title', text: `Title ${id}` },
  body: bodyIds.map((bodyId) => block(bodyId, `Text ${bodyId}`)),
});
const emptyLead = (): Chapter => ({ title: null, body: [] });
const titles = (chapters: readonly Chapter[]) => chapters.map((c) => c.title?.id ?? null);

describe('visibleChapters and isEmptyLead', () => {
  it('shows one empty "start of the text" chapter for a part with no chapters', () => {
    expect(visibleChapters([])).toEqual([{ title: null, body: [] }]);
    expect(visibleChapters([]).map(isEmptyLead)).toEqual([true]);
  });

  it('shows the chapters as they are, as a new array', () => {
    const list = [chapter('a'), chapter('b', 'x')];
    const shown = visibleChapters(list);
    expect(shown).toEqual(list);
    expect(shown).not.toBe(list);
  });

  it('knows an empty lead from a lead with text and from a titled chapter', () => {
    expect([emptyLead(), chapter(null, 'x'), chapter('a')].map(isEmptyLead)).toEqual([true, false, false]);
  });
});

describe('clampIndex', () => {
  it('keeps an index inside the list and uses 0 for an empty list or a bad number', () => {
    expect([clampIndex(3, 1), clampIndex(3, 7), clampIndex(3, -2), clampIndex(0, 4), clampIndex(3, Number.NaN)]).toEqual([1, 2, 0, 0, 0]);
  });
});

describe('updateChapterAt', () => {
  it('replaces one chapter and leaves the others', () => {
    const list = [chapter('a'), chapter('b')];
    const typed = chapter('b', 'x');
    const next = updateChapterAt(list, 1, typed);
    expect(next).toEqual([list[0], typed]);
  });

  it('starts the list when something is typed into the empty start of a part', () => {
    const typed = chapter('a', 'x');
    expect(updateChapterAt([], 0, typed)).toEqual([typed]);
  });

  it('keeps an empty list while the start is still empty', () => {
    expect(updateChapterAt([], 0, emptyLead())).toEqual([]);
  });

  it('does not tidy while typing: an emptied start chapter stays', () => {
    const next = updateChapterAt([chapter(null, 'x'), chapter('a')], 0, emptyLead());
    expect(next.map(isEmptyLead)).toEqual([true, false]);
  });

  it('changes nothing for an index that does not exist', () => {
    const list = [chapter('a')];
    expect(updateChapterAt(list, 3, chapter('z'))).toEqual(list);
    expect(updateChapterAt(list, -1, chapter('z'))).toEqual(list);
    expect(updateChapterAt(list, 0.5, chapter('z'))).toEqual(list);
  });
});

describe('addAfter', () => {
  it('makes the first chapter of an empty part and drops the empty start', () => {
    const result = addAfter([], 0);
    expect(result.index).toBe(0);
    expect(result.chapters.map((c) => [c.title?.type, c.title?.text, c.body.length])).toEqual([['title', '', 0]]);
  });

  it('puts the new chapter right after the open one and points at it', () => {
    const list = [chapter('a'), chapter('b')];
    const result = addAfter(list, 0);
    expect(result.index).toBe(1);
    expect(result.chapters.length).toBe(3);
    expect(result.chapters.map((c) => c.title?.id)).toEqual(['a', result.chapters.map((c) => c.title?.id)[1], 'b']);
    expect(result.chapters.map((c) => c.title?.text)).toEqual(['Title a', '', 'Title b']);
  });

  it('adds at the end for an index that does not exist', () => {
    const result = addAfter([chapter('a'), chapter('b')], 9);
    expect(result.index).toBe(2);
    expect(result.chapters.length).toBe(3);
  });

  it('keeps a start chapter that has blocks', () => {
    const result = addAfter([chapter(null, 'x'), chapter('a')], 0);
    expect(result.index).toBe(1);
    expect(titles(result.chapters).length).toBe(3);
    expect(result.chapters.map((c) => c.title === null)).toEqual([true, false, false]);
  });

  it('drops an empty start chapter when other chapters exist and still points at the new one', () => {
    const result = addAfter([emptyLead(), chapter('a')], 1);
    expect(result.chapters.map((c) => c.title === null)).toEqual([false, false]);
    expect(result.index).toBe(1);
    expect(result.chapters.map((c) => c.title?.text)).toEqual(['Title a', '']);
  });

  it('does not change the list it was given', () => {
    const list = [chapter('a')];
    addAfter(list, 0);
    expect(list.length).toBe(1);
  });
});

describe('removeAt', () => {
  it('deletes the chapter and points at the one that took its place', () => {
    const result = removeAt([chapter('a'), chapter('b'), chapter('c')], 1);
    expect(titles(result.chapters)).toEqual(['a', 'c']);
    expect(result.index).toBe(1);
  });

  it('points at the new last chapter when the last one is deleted', () => {
    const result = removeAt([chapter('a'), chapter('b')], 1);
    expect(titles(result.chapters)).toEqual(['a']);
    expect(result.index).toBe(0);
  });

  it('leaves an empty list when the only chapter is deleted', () => {
    const result = removeAt([chapter('a', 'x')], 0);
    expect(result).toEqual({ chapters: [], index: 0 });
  });

  it('drops an empty start chapter that is left behind', () => {
    const result = removeAt([emptyLead(), chapter('a'), chapter('b')], 2);
    expect(titles(result.chapters)).toEqual(['a']);
    expect(result.index).toBe(0);
  });

  it('can delete the start chapter that has text', () => {
    const result = removeAt([chapter(null, 'x'), chapter('a')], 0);
    expect(titles(result.chapters)).toEqual(['a']);
    expect(result.index).toBe(0);
  });

  it('changes nothing for an index that does not exist', () => {
    const list = [chapter('a'), chapter('b')];
    expect(removeAt(list, 5).chapters).toEqual(list);
  });
});

describe('canMove and moveBy', () => {
  it('moves a chapter down and up and follows it', () => {
    const list = [chapter('a'), chapter('b'), chapter('c')];
    const down = moveBy(list, 0, 1);
    expect(titles(down.chapters)).toEqual(['b', 'a', 'c']);
    expect(down.index).toBe(1);
    const up = moveBy(down.chapters, 2, -1);
    expect(titles(up.chapters)).toEqual(['b', 'c', 'a']);
    expect(up.index).toBe(1);
  });

  it('cannot move the first chapter up or the last one down', () => {
    const list = [chapter('a'), chapter('b')];
    expect([canMove(list, 0, -1), canMove(list, 1, 1), canMove(list, 0, 1), canMove(list, 1, -1)]).toEqual([false, false, true, true]);
    expect(moveBy(list, 0, -1)).toEqual({ chapters: list, index: 0 });
  });

  it('never moves the start chapter and never puts a chapter in front of it', () => {
    const list = [chapter(null, 'x'), chapter('a'), chapter('b')];
    expect([canMove(list, 0, 1), canMove(list, 1, -1), canMove(list, 2, -1), canMove(list, 1, 1)]).toEqual([false, false, true, true]);
    const result = moveBy(list, 1, -1);
    expect(titles(result.chapters)).toEqual([null, 'a', 'b']);
    expect(result.index).toBe(1);
  });

  it('drops an empty start chapter and still points at the moved chapter', () => {
    const result = moveBy([emptyLead(), chapter('a'), chapter('b')], 2, -1);
    expect(titles(result.chapters)).toEqual(['b', 'a']);
    expect(result.index).toBe(0);
  });

  it('keeps the same chapter objects (ids and blocks are not touched)', () => {
    const a = chapter('a', 'x');
    const b = chapter('b', 'y');
    const result = moveBy([a, b], 0, 1);
    expect(result.chapters[0]).toBe(b);
    expect(result.chapters[1]).toBe(a);
  });

  it('says no for an index that does not exist', () => {
    expect(canMove([chapter('a')], 4, 1)).toBe(false);
    expect(moveBy([chapter('a')], 4, 1).chapters.length).toBe(1);
  });
});

describe('chapterNumber', () => {
  it('counts titled chapters from 1 and gives the start chapter 0', () => {
    const list = [chapter(null, 'x'), chapter('a'), chapter('b')];
    expect(list.map((_, index) => chapterNumber(list, index))).toEqual([0, 1, 2]);
  });

  it('starts at 1 when there is no start chapter', () => {
    const list = [chapter('a'), chapter('b')];
    expect(list.map((_, index) => chapterNumber(list, index))).toEqual([1, 2]);
  });
});

describe('isBlankChapter and withoutBlankChapters', () => {
  const untitled = (): Chapter => ({ title: { id: 'u', type: 'title', text: '   ' }, body: [] });

  it('calls a chapter blank only when it has no title text and no blocks', () => {
    expect([emptyLead(), untitled(), chapter('a'), chapter(null, 'x')].map(isBlankChapter)).toEqual([true, true, false, false]);
    const noText: Chapter = { title: { id: 'u', type: 'title' }, body: [] };
    expect(isBlankChapter(noText)).toBe(true);
  });

  it('keeps an untitled chapter that has text, so Save can say what is missing', () => {
    const withText: Chapter = { title: { id: 'u', type: 'title', text: '' }, body: [block('x', 'Hello')] };
    expect(isBlankChapter(withText)).toBe(false);
  });

  it('leaves the blank chapters out and keeps the order of the others', () => {
    const list = [emptyLead(), chapter('a', 'x'), untitled(), chapter('b')];
    expect(titles(withoutBlankChapters(list))).toEqual(['a', 'b']);
  });
});
