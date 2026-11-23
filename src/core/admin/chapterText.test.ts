// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Block } from '../content/types';
import { applyStrings, chapterToStrings, type ChapterStrings } from './chapterText';
import type { Chapter } from './chapters';

// P10 T11n C2c: the chapter <-> three boxes mapping must never lose a block it cannot show, and must not touch what did not change.

const title = (text: string): Block => ({ id: 'blk_title001', type: 'title', text });
const subtitle = (id: string, text: string): Block => ({ id, type: 'subtitle', text });
const text = (id: string, body: string, extra: Partial<Block> = {}): Block => ({ id, type: 'text', text: body, ...extra });
const image: Block = { id: 'blk_image001', type: 'image', src: 'images/a.webp', alt: '' };

const FULL: Chapter = {
  title: title('Head'),
  body: [subtitle('blk_sub00001', 'Sub'), text('blk_text0001', 'One', { font: 'serif' }), image, text('blk_text0002', 'Two')],
};

const ids = (chapter: Chapter): string[] => chapter.body.map((block) => block.id);
const same = (chapter: Chapter): ChapterStrings => chapterToStrings(chapter);

describe('chapterToStrings', () => {
  it('reads the title, the first subtitle and all text blocks with a blank line between them', () => {
    expect(chapterToStrings(FULL)).toEqual({ title: 'Head', subtitle: 'Sub', content: 'One\n\nTwo' });
  });

  it('gives empty strings for what is missing', () => {
    expect(chapterToStrings({ title: null, body: [] })).toEqual({ title: '', subtitle: '', content: '' });
    expect(chapterToStrings({ title: title('Only'), body: [image] })).toEqual({ title: 'Only', subtitle: '', content: '' });
  });

  it('a lead chapter (no title block) shows an empty title and its text', () => {
    expect(chapterToStrings({ title: null, body: [text('blk_text0001', 'Hello')] })).toEqual({ title: '', subtitle: '', content: 'Hello' });
  });
});

describe('applyStrings: nothing changed', () => {
  it('returns the very same chapter object', () => {
    expect(applyStrings(FULL, same(FULL))).toBe(FULL);
  });
});

describe('applyStrings: the title', () => {
  it('changes only the title block and keeps the body array as it is', () => {
    const next = applyStrings(FULL, { ...same(FULL), title: 'New head' });
    expect(next.title).toEqual({ id: 'blk_title001', type: 'title', text: 'New head' });
    expect(next.body).toBe(FULL.body);
  });

  it('keeps the title block when the title is emptied (the chapter must stay a chapter)', () => {
    const next = applyStrings(FULL, { ...same(FULL), title: '' });
    expect(next.title).toEqual({ id: 'blk_title001', type: 'title', text: '' });
  });

  it('a lead chapter gets a title block only when a title is typed', () => {
    const lead: Chapter = { title: null, body: [text('blk_text0001', 'Hello')] };
    expect(applyStrings(lead, { title: '', subtitle: '', content: 'Hello again' }).title).toBeNull();
    const titled = applyStrings(lead, { title: 'Intro', subtitle: '', content: 'Hello' });
    expect(titled.title).toMatchObject({ type: 'title', text: 'Intro' });
    expect(titled.title?.id).toMatch(/^blk-/);
    expect(titled.body).toBe(lead.body);
  });
});

describe('applyStrings: the subtitle', () => {
  it('changes the first subtitle block in place and keeps its id', () => {
    const next = applyStrings(FULL, { ...same(FULL), subtitle: 'New sub' });
    expect(ids(next)).toEqual(ids(FULL));
    expect(next.body.slice(0, 1)).toEqual([subtitle('blk_sub00001', 'New sub')]);
    expect(next.title).toBe(FULL.title);
  });

  it('removes the subtitle block when the box is emptied', () => {
    const next = applyStrings(FULL, { ...same(FULL), subtitle: '' });
    expect(ids(next)).toEqual(['blk_text0001', 'blk_image001', 'blk_text0002']);
  });

  it('adds a subtitle block at the start when there was none', () => {
    const chapter: Chapter = { title: title('Head'), body: [text('blk_text0001', 'One')] };
    const next = applyStrings(chapter, { title: 'Head', subtitle: 'Sub', content: 'One' });
    expect(next.body.map((block) => block.type)).toEqual(['subtitle', 'text']);
    expect(next.body.slice(0, 1).map((block) => block.text)).toEqual(['Sub']);
    expect(next.body.slice(0, 1).map((block) => block.id)).toEqual([expect.stringMatching(/^blk-/)]);
  });

  it('leaves a second subtitle block alone', () => {
    const chapter: Chapter = { title: title('Head'), body: [subtitle('blk_sub00001', 'A'), subtitle('blk_sub00002', 'B')] };
    const next = applyStrings(chapter, { title: 'Head', subtitle: 'A2', content: '' });
    expect(next.body).toEqual([subtitle('blk_sub00001', 'A2'), subtitle('blk_sub00002', 'B')]);
  });
});

describe('applyStrings: the content', () => {
  it('puts the whole text into the first text block (id and font kept) and removes the other text blocks, pictures stay', () => {
    const next = applyStrings(FULL, { ...same(FULL), content: 'One\n\nTwo\n\nThree' });
    expect(next.body).toEqual([subtitle('blk_sub00001', 'Sub'), text('blk_text0001', 'One\n\nTwo\n\nThree', { font: 'serif' }), image]);
  });

  it('removes every text block when the box is emptied', () => {
    const next = applyStrings(FULL, { ...same(FULL), content: '' });
    expect(next.body).toEqual([subtitle('blk_sub00001', 'Sub'), image]);
  });

  it('adds a text block right after the subtitle, before the pictures', () => {
    const chapter: Chapter = { title: title('Head'), body: [subtitle('blk_sub00001', 'Sub'), image] };
    const next = applyStrings(chapter, { title: 'Head', subtitle: 'Sub', content: 'Body' });
    expect(next.body.map((block) => block.type)).toEqual(['subtitle', 'text', 'image']);
    expect(next.body.slice(1, 2).map((block) => block.text)).toEqual(['Body']);
  });

  it('adds a text block at the very start when there is no subtitle either', () => {
    const chapter: Chapter = { title: title('Head'), body: [image] };
    const next = applyStrings(chapter, { title: 'Head', subtitle: '', content: 'Body' });
    expect(next.body.map((block) => block.type)).toEqual(['text', 'image']);
  });
});

describe('applyStrings: general rules', () => {
  const cases: ChapterStrings[] = [
    { title: 'A', subtitle: 'B', content: 'C' },
    { title: '', subtitle: '', content: '' },
    { title: 'Head', subtitle: '', content: 'x\n\ny' },
    { title: 'Head', subtitle: 'Sub', content: '' },
  ];

  it.each(cases)('the strings that were put in are the strings that come out (%#)', (strings) => {
    for (const chapter of [FULL, { title: null, body: [] } as Chapter, { title: title('T'), body: [image] } as Chapter]) {
      expect(chapterToStrings(applyStrings(chapter, strings))).toEqual(strings);
    }
  });

  it('never changes the chapter it was given', () => {
    const frozen: Chapter = Object.freeze({ title: Object.freeze(title('Head')), body: Object.freeze([...FULL.body]) as Block[] });
    expect(() => applyStrings(frozen, { title: 'X', subtitle: 'Y', content: 'Z' })).not.toThrow();
    expect(chapterToStrings(frozen)).toEqual({ title: 'Head', subtitle: 'Sub', content: 'One\n\nTwo' });
  });

  it('keeps every picture, in the same order', () => {
    const second: Block = { id: 'blk_image002', type: 'image', src: 'images/b.webp', alt: '' };
    const chapter: Chapter = { title: title('Head'), body: [image, text('blk_text0001', 'One'), second] };
    const next = applyStrings(chapter, { title: 'Head', subtitle: 'S', content: 'Changed' });
    expect(next.body.filter((block) => block.type === 'image').map((block) => block.id)).toEqual(['blk_image001', 'blk_image002']);
  });
});
