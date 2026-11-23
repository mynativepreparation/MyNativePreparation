// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { COLOR_IDS } from '../content/richStyles';
import { colors, cssVarName, type ColorTokens } from './tokens';

// P10 T11u (Q28): the pastel "colour" theme. Owner's rule: bright pastel colours everywhere, and every text on a light colour is a DARK
// shade of the SAME hue. This file is the proof: WCAG ratios, "same hue" and "darker" for every tile, and the old themes unchanged.

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

/** Hue in degrees (0-360). */
function hue(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueGap(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}

type Key = keyof ColorTokens;

const NUMBERS = [1, 2, 3, 4, 5, 6] as const;
const tintKey = (n: number) => `tint${n}` as Key;
const onTintKey = (n: number) => `onTint${n}` as Key;

const palette = colors.colour;

// [foreground, background, minimum ratio, what it is used for]
const PAIRS: [Key, Key, number, string][] = [
  ['text', 'surface', 4.5, 'main text'],
  ['textMuted', 'surface', 4.5, 'secondary text'],
  ['accent', 'surface', 4.5, 'links and active labels'],
  ['onAccent', 'accent', 4.5, 'text on a strong button'],
  ['onFill', 'fill', 4.5, 'text on a pastel button'],
  ['danger', 'surface', 4.5, 'error text'],
  ['success', 'surface', 4.5, 'success text'],
  ['border', 'surface', 3, 'control outline'],
  ['accent', 'surface', 3, 'icons, progress fill'],
  ['danger', 'surface', 3, 'error outline'],
  ['star', 'surface', 3, 'earned stars'],
  ...NUMBERS.flatMap((n): [Key, Key, number, string][] => [
    [onTintKey(n), tintKey(n), 4.5, `text on tile ${n}`],
    ['text', tintKey(n), 4.5, `main text on tile ${n}`],
    ['textMuted', tintKey(n), 4.5, `secondary text on tile ${n}`],
    ['accent', tintKey(n), 4.5, `links and icons on tile ${n}`],
    ['border', tintKey(n), 3, `outline on tile ${n}`],
  ]),
];

describe('colour theme: the tokens', () => {
  it('is a third theme with exactly the same tokens as light and dark, all written as #rrggbb', () => {
    expect(Object.keys(colors).sort()).toEqual(['colour', 'dark', 'light']);
    expect(Object.keys(palette).sort()).toEqual(Object.keys(colors.light).sort());
    expect(Object.keys(palette).sort()).toEqual(Object.keys(colors.dark).sort());
    for (const theme of Object.values(colors)) {
      for (const [key, value] of Object.entries(theme)) expect(value, key).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('turns the new tokens into CSS variable names', () => {
    expect(cssVarName('fill')).toBe('--np-color-fill');
    expect(cssVarName('onFill')).toBe('--np-color-on-fill');
    expect(cssVarName('tint3')).toBe('--np-color-tint3');
    expect(cssVarName('onTint3')).toBe('--np-color-on-tint3');
  });

  it('the page and every tile are light, the six tiles all differ from each other and from the page', () => {
    expect(luminance(palette.surface)).toBeGreaterThanOrEqual(0.8);
    const tiles = NUMBERS.map((n) => palette[tintKey(n)]);
    for (const tile of tiles) expect(luminance(tile), tile).toBeGreaterThanOrEqual(0.6);
    expect(new Set([...tiles, palette.surface]).size).toBe(7);
  });
});

describe('colour theme: contrast (WCAG)', () => {
  PAIRS.forEach(([fg, bg, min, use]) => {
    it(`${fg} on ${bg} >= ${min}:1 (${use})`, () => {
      const value = ratio(palette[fg], palette[bg]);
      expect(value, `${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
    });
  });
});

describe('colour theme: the text is a dark shade of the same hue', () => {
  const HUE_PAIRS: [Key, Key][] = [
    ['text', 'surface'],
    ['onFill', 'fill'],
    ...NUMBERS.map((n): [Key, Key] => [onTintKey(n), tintKey(n)]),
  ];

  HUE_PAIRS.forEach(([fg, bg]) => {
    it(`${fg} has the hue of ${bg} (within 15 degrees) and is darker`, () => {
      const gap = hueGap(palette[fg], palette[bg]);
      expect(gap, `${gap.toFixed(1)} degrees`).toBeLessThanOrEqual(15);
      expect(luminance(palette[fg])).toBeLessThan(luminance(palette[bg]));
    });
  });
});

describe('colour theme: the rich-text ink colours', () => {
  const toKey = (id: string): Key => ('ink' + id.charAt(0).toUpperCase() + id.slice(1)) as Key;

  COLOR_IDS.forEach((id) => {
    const key = toKey(id);

    it(`${key} on the page is at least 4.5:1`, () => {
      const value = ratio(palette[key], palette.surface);
      expect(value, `${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${key} inside its own 14% tinted box is at least 4.5:1`, () => {
      const value = ratio(palette[key], tint(palette[key], palette.surface, 0.14));
      expect(value, `${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('the normal text colour stays readable inside a 14% tinted box of every ink colour', () => {
    for (const id of COLOR_IDS) {
      const value = ratio(palette.text, tint(palette[toKey(id)], palette.surface, 0.14));
      expect(value, `${id} ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('light and dark themes are unchanged by the new tokens', () => {
  (['light', 'dark'] as const).forEach((theme) => {
    it(`${theme}: fill = accent, onFill = onAccent, every tile = surface, every tile text = text`, () => {
      const p = colors[theme];
      expect(p.fill).toBe(p.accent);
      expect(p.onFill).toBe(p.onAccent);
      for (const n of NUMBERS) {
        expect(p[tintKey(n)], tintKey(n)).toBe(p.surface);
        expect(p[onTintKey(n)], onTintKey(n)).toBe(p.text);
      }
    });
  });
});
