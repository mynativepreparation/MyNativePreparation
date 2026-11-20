import { describe, expect, it } from 'vitest';
import { colors, type ColorTokens, type ThemeName } from './tokens';

// WCAG 2.x relative luminance and contrast ratio.
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Key = keyof ColorTokens;

// [foreground, background, minimum ratio, what it is used for]
const PAIRS: [Key, Key, number, string][] = [
  // normal text: 4.5
  ['text', 'surface', 4.5, 'main text'],
  ['textMuted', 'surface', 4.5, 'secondary text'],
  ['accent', 'surface', 4.5, 'links and active nav labels'],
  ['onAccent', 'accent', 4.5, 'text on primary button'],
  ['danger', 'surface', 4.5, 'error text'],
  ['success', 'surface', 4.5, 'success text'],
  // control outlines, icons, non-text parts: 3
  ['border', 'surface', 3, 'control outline, empty stars, toggle knob'],
  ['accent', 'surface', 3, 'icons, progress fill, toggle knob on'],
  ['danger', 'surface', 3, 'error outline'],
  ['star', 'surface', 3, 'earned stars in the Test result'],
];

describe('WCAG contrast of the design tokens', () => {
  (['light', 'dark'] as ThemeName[]).forEach((theme) => {
    PAIRS.forEach(([fg, bg, min, use]) => {
      it(`${theme}: ${fg} on ${bg} >= ${min}:1 (${use})`, () => {
        const ratio = contrastRatio(colors[theme][fg], colors[theme][bg]);
        expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
      });
    });
  });

  it('computes known reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});
