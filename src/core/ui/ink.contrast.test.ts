import { describe, expect, it } from 'vitest';
import { COLOR_IDS } from '../content/richStyles';
import { colors, cssVarName, type ColorTokens, type ThemeName } from './tokens';

// P10 T11k: the 8 text colours of the rich-text styles (Q26). Every one must be readable on the page in light AND dark mode,
// and also inside a box that is tinted with the same colour (the box CSS uses at most a 14% tint, see modules/reader/RichStyles.css).

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `share` of the foreground colour laid over the background (what `color-mix(in srgb, fg 14%, transparent)` looks like on the page). */
function tint(foreground: string, background: string, share: number): string {
  const f = rgb(foreground);
  const b = rgb(background);
  const mixed = f.map((v, i) => Math.round(v * share + b[i] * (1 - share)));
  return '#' + mixed.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const INK_KEYS = (Object.keys(colors.light) as (keyof ColorTokens)[]).filter((key) => key.startsWith('ink'));

const toKey = (id: string): keyof ColorTokens => ('ink' + id.charAt(0).toUpperCase() + id.slice(1)) as keyof ColorTokens;

describe('ink colour tokens', () => {
  it('there is one token per colour id of the content format, and nothing else', () => {
    expect([...INK_KEYS].sort()).toEqual(COLOR_IDS.map(toKey).sort());
  });

  it('turns into the CSS variable names the reader stylesheet uses', () => {
    expect(COLOR_IDS.map((id) => cssVarName(toKey(id)))).toEqual(COLOR_IDS.map((id) => `--np-color-ink-${id}`));
  });

  it('has a different light and dark value for every colour', () => {
    for (const key of INK_KEYS) expect(colors.light[key], key).not.toBe(colors.dark[key]);
  });

  (['light', 'dark'] as ThemeName[]).forEach((theme) => {
    COLOR_IDS.forEach((id) => {
      const key = toKey(id);
      const palette = colors[theme];

      it(`${theme}: ${key} on the page is at least 4.5:1`, () => {
        const value = ratio(palette[key], palette.surface);
        expect(value, `${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });

      it(`${theme}: ${key} inside its own 14% tinted box is at least 4.5:1`, () => {
        const value = ratio(palette[key], tint(palette[key], palette.surface, 0.14));
        expect(value, `${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });
    });

    it(`${theme}: the normal text colour stays readable inside a 14% tinted box of every ink colour`, () => {
      const palette = colors[theme];
      for (const id of COLOR_IDS) {
        const value = ratio(palette.text, tint(palette[toKey(id)], palette.surface, 0.14));
        expect(value, `${id} ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
