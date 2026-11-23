// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  boxScope,
  COLOR_IDS,
  FONT_CATALOG,
  FONT_IDS,
  isColorId,
  isFontId,
  isLetterBoxId,
  isParagraphBoxId,
  isSizeId,
  isSpanBoxId,
  isWordBoxId,
  LETTER_BOX_IDS,
  letterBoxParts,
  PARAGRAPH_BOX_IDS,
  SIZE_IDS,
  WORD_BOX_IDS,
} from './richStyles';

const ALL_LISTS: Array<[string, readonly string[]]> = [
  ['COLOR_IDS', COLOR_IDS],
  ['FONT_IDS', FONT_IDS],
  ['SIZE_IDS', SIZE_IDS],
  ['LETTER_BOX_IDS', LETTER_BOX_IDS],
  ['WORD_BOX_IDS', WORD_BOX_IDS],
  ['PARAGRAPH_BOX_IDS', PARAGRAPH_BOX_IDS],
];

describe('catalog shape (the file format depends on it, see inline.ts)', () => {
  it.each(ALL_LISTS)('%s has only ids a span can carry: a-z, 0-9 and "-"', (_name, list) => {
    list.forEach((id) => expect(id).toMatch(/^[a-z0-9-]+$/));
  });

  it.each(ALL_LISTS)('%s has no duplicates and is not empty', (_name, list) => {
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list).size).toBe(list.length);
  });

  it('the three box lists never share an id (an id has exactly one scope)', () => {
    const all = [...LETTER_BOX_IDS, ...WORD_BOX_IDS, ...PARAGRAPH_BOX_IDS];
    expect(new Set(all).size).toBe(all.length);
  });

  it('box ids start with their scope letter', () => {
    LETTER_BOX_IDS.forEach((id) => expect(id.startsWith('l-')).toBe(true));
    WORD_BOX_IDS.forEach((id) => expect(id.startsWith('w-')).toBe(true));
    PARAGRAPH_BOX_IDS.forEach((id) => expect(id.startsWith('p-')).toBe(true));
  });

  it('the font catalog lists every font id exactly once, with a proper name', () => {
    expect(FONT_CATALOG.map((f) => f.id)).toEqual([...FONT_IDS]);
    FONT_CATALOG.forEach((f) => expect(f.name.trim()).not.toBe(''));
  });

  it('the letter boxes cover circle, square, diamond and round, each in a light and a dark tone', () => {
    const parts = LETTER_BOX_IDS.map((id) => letterBoxParts(id));
    expect(parts.map((p) => p?.shape)).toEqual(['circle', 'circle', 'square', 'square', 'diamond', 'diamond', 'round', 'round']);
    expect(parts.map((p) => p?.tone)).toEqual(['light', 'dark', 'light', 'dark', 'light', 'dark', 'light', 'dark']);
  });
});

describe('guards', () => {
  it('accept every catalog id', () => {
    COLOR_IDS.forEach((id) => expect(isColorId(id)).toBe(true));
    FONT_IDS.forEach((id) => expect(isFontId(id)).toBe(true));
    SIZE_IDS.forEach((id) => expect(isSizeId(id)).toBe(true));
    LETTER_BOX_IDS.forEach((id) => expect(isLetterBoxId(id)).toBe(true));
    WORD_BOX_IDS.forEach((id) => expect(isWordBoxId(id)).toBe(true));
    PARAGRAPH_BOX_IDS.forEach((id) => expect(isParagraphBoxId(id)).toBe(true));
  });

  it.each([['Red'], ['RED'], [' red'], ['red '], [''], ['mauve'], [1], [null], [undefined], [true], [{}], [['red']]])(
    'reject %j as a colour, font, size and box',
    (value) => {
      expect(isColorId(value)).toBe(false);
      expect(isFontId(value)).toBe(false);
      expect(isSizeId(value)).toBe(false);
      expect(isLetterBoxId(value)).toBe(false);
      expect(isWordBoxId(value)).toBe(false);
      expect(isParagraphBoxId(value)).toBe(false);
      expect(isSpanBoxId(value)).toBe(false);
    },
  );

  it('a span box is a letter box or a word box, never a paragraph box', () => {
    LETTER_BOX_IDS.forEach((id) => expect(isSpanBoxId(id)).toBe(true));
    WORD_BOX_IDS.forEach((id) => expect(isSpanBoxId(id)).toBe(true));
    PARAGRAPH_BOX_IDS.forEach((id) => expect(isSpanBoxId(id)).toBe(false));
  });

  it('the guards do not accept ids of another list', () => {
    expect(isColorId('serif')).toBe(false);
    expect(isFontId('red')).toBe(false);
    expect(isSizeId('red')).toBe(false);
    expect(isLetterBoxId('w-box-light')).toBe(false);
    expect(isWordBoxId('p-box-light')).toBe(false);
    expect(isParagraphBoxId('l-circle-light')).toBe(false);
  });
});

describe('boxScope and letterBoxParts', () => {
  it('names the scope of every box id', () => {
    LETTER_BOX_IDS.forEach((id) => expect(boxScope(id)).toBe('letter'));
    WORD_BOX_IDS.forEach((id) => expect(boxScope(id)).toBe('word'));
    PARAGRAPH_BOX_IDS.forEach((id) => expect(boxScope(id)).toBe('paragraph'));
  });

  it('gives null for anything else', () => {
    expect(boxScope('red')).toBeNull();
    expect(boxScope('')).toBeNull();
    expect(boxScope(5)).toBeNull();
    expect(boxScope(undefined)).toBeNull();
  });

  it('splits a letter box id into shape and tone', () => {
    expect(letterBoxParts('l-circle-dark')).toEqual({ shape: 'circle', tone: 'dark' });
    expect(letterBoxParts('l-diamond-light')).toEqual({ shape: 'diamond', tone: 'light' });
  });

  it('gives null for ids that are not letter boxes', () => {
    expect(letterBoxParts('w-box-light')).toBeNull();
    expect(letterBoxParts('p-dashed')).toBeNull();
    expect(letterBoxParts('l-star-dark')).toBeNull();
    expect(letterBoxParts(null)).toBeNull();
  });
});
