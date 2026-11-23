// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FONT_CATALOG, FONT_IDS, isFontId, type FontInfo } from './richStyles';
import { FONT_KINDS } from './types';
import { validateBlocks } from './validate';

// P10 T11p (DECISIONS Q26 c): 16 fonts in three language groups. The font of a whole block (FONT_KINDS, types.ts) and the font of one span
// (FONT_IDS, richStyles.ts) are two lists written twice because types.ts has no imports; this file keeps them equal.

const countOf = (language: FontInfo['language']): number => FONT_CATALOG.filter((font) => font.language === language).length;

describe('the font lists', () => {
  it('the block fonts and the span fonts are the same ids in the same order', () => {
    expect([...FONT_KINDS]).toEqual([...FONT_IDS]);
  });

  it('there are 16 fonts: 7 Gujarati, 4 Hindi / Sanskrit and 5 English', () => {
    expect(FONT_CATALOG).toHaveLength(16);
    expect([countOf('gu'), countOf('hi'), countOf('en')]).toEqual([7, 4, 5]);
  });

  it('the first three ids never move (old courses store them)', () => {
    expect(FONT_IDS.slice(0, 3)).toEqual(['sans', 'serif', 'humanist']);
  });

  it('every font name is different', () => {
    const names = FONT_CATALOG.map((font) => font.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('the Gujarati fonts come first, then Hindi / Sanskrit, then English (the order of the Fonts panel)', () => {
    expect(FONT_CATALOG.map((font) => font.language)).toEqual([
      ...Array<string>(7).fill('gu'),
      ...Array<string>(4).fill('hi'),
      ...Array<string>(5).fill('en'),
    ]);
  });
});

describe('every font id works as a block font and as a span font', () => {
  it.each([...FONT_IDS])('block font "%s" is accepted by the validator and kept', (font) => {
    const result = validateBlocks({ blocks: [{ id: 'blk-aaaa0001', type: 'text', text: 'X', font }] });
    expect(result).toEqual({ ok: true, value: { blocks: [{ id: 'blk-aaaa0001', type: 'text', text: 'X', font }] } });
  });

  it.each([...FONT_IDS])('span font "%s" is a font id', (font) => {
    expect(isFontId(font)).toBe(true);
  });

  it.each(['Inter', 'atkinson-hyperlegible', 'noto-sans', 'baloo', 'comic-sans', ''])('"%s" is not a font id', (font) => {
    expect(isFontId(font)).toBe(false);
  });
});
