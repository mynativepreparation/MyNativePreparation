// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COLOR_IDS,
  FONT_IDS,
  LETTER_BOX_IDS,
  PARAGRAPH_BOX_IDS,
  SIZE_IDS,
  WORD_BOX_IDS,
  type LetterBoxId,
  type ParagraphBoxId,
  type WordBoxId,
} from '../../core/content/richStyles';
import { colors, cssVarName, type ColorTokens } from '../../core/ui/tokens';
import { fontClass, inkClass, letterBoxClass, paragraphBoxClass, sizeClass, spanClassNames, wordBoxClass } from './richClasses';

// P10 T11k: the style ids of the course files become CSS class names (richClasses.ts). These tests prove two things:
// the names are what the stylesheets expect, and EVERY id of the catalog has a rule, so a new id can never silently draw nothing.
// The CSS is read with fs (Vitest returns an empty string for a CSS import) and comments are removed first.

function readCss(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every class name that appears in a selector (the part before a "{") of the stylesheet. */
function selectorClasses(css: string): Set<string> {
  const names = new Set<string>();
  for (const prelude of css.matchAll(/([^{}]+)\{/g)) {
    for (const name of prelude[1].matchAll(/\.([A-Za-z_][\w-]*)/g)) names.add(name[1]);
  }
  return names;
}

// The rich styles live in core/content (moved in T11n C1, the Admin window uses them too); reader/RichStyles.css is only an @import stub.
const richCss = readCss('../../core/content/RichStyles.css');
const richClasses = selectorClasses(richCss);
const blockClasses = selectorClasses(readCss('./BlockView.css'));

function expectRules(className: string, defined: Set<string>, id: string): void {
  for (const name of className.split(' ')) {
    expect(defined.has(name), `no CSS rule for .${name} (style id "${id}")`).toBe(true);
  }
}

describe('class names', () => {
  it('colour, size and font ids give np-ink-, np-size- and np-font- classes', () => {
    expect(inkClass('red')).toBe('np-ink-red');
    expect(inkClass('purple')).toBe('np-ink-purple');
    expect(sizeClass('xl')).toBe('np-size-xl');
    expect(fontClass('humanist')).toBe('np-font-humanist');
  });

  it('a letter box id gives the base class, the shape and the tone', () => {
    expect(letterBoxClass('l-circle-dark')).toBe('np-lbox np-lbox-circle np-lbox-dark');
    expect(letterBoxClass('l-diamond-light')).toBe('np-lbox np-lbox-diamond np-lbox-light');
    expect(letterBoxClass('l-round-dark')).toBe('np-lbox np-lbox-round np-lbox-dark');
  });

  it('an id that is not a letter box gives only the base class (never a made-up shape)', () => {
    expect(letterBoxClass('l-triangle-dark' as LetterBoxId)).toBe('np-lbox');
    expect(letterBoxClass('' as LetterBoxId)).toBe('np-lbox');
  });

  it('a word box id gives np-wbox and its own name without the "w-" prefix', () => {
    expect(wordBoxClass('w-pill-dark')).toBe('np-wbox np-wbox-pill-dark');
    expect(wordBoxClass('w-underline')).toBe('np-wbox np-wbox-underline');
  });

  it('a paragraph box id gives np-pbox and its own name without the "p-" prefix', () => {
    expect(paragraphBoxClass('p-dashed')).toBe('np-pbox np-pbox-dashed');
    expect(paragraphBoxClass('p-box-light')).toBe('np-pbox np-pbox-box-light');
  });
});

describe('spanClassNames', () => {
  it('a span without any style has no classes', () => {
    expect(spanClassNames({})).toEqual([]);
  });

  it('colour, font and size come in that order', () => {
    expect(spanClassNames({ size: 'l', font: 'serif', color: 'blue' })).toEqual(['np-ink-blue', 'np-font-serif', 'np-size-l']);
  });

  it('a WORD box is a class of the span', () => {
    expect(spanClassNames({ color: 'green', box: 'w-pill-dark' })).toEqual(['np-ink-green', 'np-wbox np-wbox-pill-dark']);
  });

  it('a LETTER box is never a class of the span (it goes on every single letter instead)', () => {
    expect(spanClassNames({ box: 'l-circle-dark' })).toEqual([]);
    expect(spanClassNames({ color: 'red', box: 'l-square-light' })).toEqual(['np-ink-red']);
  });
});

describe('every id of the catalog has a CSS rule', () => {
  it.each(COLOR_IDS)('colour %s', (id) => {
    expectRules(inkClass(id), richClasses, id);
  });

  it.each(SIZE_IDS)('size %s', (id) => {
    expectRules(sizeClass(id), richClasses, id);
  });

  it.each(FONT_IDS)('font %s', (id) => {
    expectRules(fontClass(id), blockClasses, id);
  });

  it.each(LETTER_BOX_IDS)('letter box %s (base, shape and tone)', (id) => {
    expectRules(letterBoxClass(id), richClasses, id);
  });

  it.each(WORD_BOX_IDS)('word box %s', (id: WordBoxId) => {
    expectRules(wordBoxClass(id), richClasses, id);
  });

  it.each(PARAGRAPH_BOX_IDS)('paragraph box %s', (id: ParagraphBoxId) => {
    expectRules(paragraphBoxClass(id), richClasses, id);
  });
});

describe('RichStyles.css uses theme tokens only', () => {
  it('has no fixed colour (no #hex, rgb() or hsl())', () => {
    expect(richCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(richCss).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });

  it.each(COLOR_IDS)('the rule of colour %s points at its own ink token, which has a light AND a dark value', (id) => {
    const key = `ink${id[0].toUpperCase()}${id.slice(1)}` as keyof ColorTokens;
    expect(colors.light[key], `light value of ${key}`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(colors.dark[key], `dark value of ${key}`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(colors.light[key]).not.toBe(colors.dark[key]);

    const start = richCss.indexOf(`.${inkClass(id)} {`);
    expect(start, `rule .${inkClass(id)} is missing`).toBeGreaterThanOrEqual(0);
    const rule = richCss.slice(start, richCss.indexOf('}', start));
    expect(rule).toContain(`var(${cssVarName(key)})`);
  });
});
