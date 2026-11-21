import { describe, expect, it } from 'vitest';
import { hexToRgb, mix, palette } from './palette';
import type { Rgb } from './pdf/surface';

// WCAG relative luminance of an sRGB colour (channels 0..1) and the contrast ratio of two colours.
const linear = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (c: Rgb): number => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

describe('hexToRgb and mix', () => {
  it('converts #rrggbb to 0..1 channels', () => {
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    const [r, g, b] = hexToRgb('#4B5BD6');
    expect(r).toBeCloseTo(75 / 255, 6);
    expect(g).toBeCloseTo(91 / 255, 6);
    expect(b).toBeCloseTo(214 / 255, 6);
  });

  it('rejects anything that is not #rrggbb', () => {
    for (const bad of ['red', '#fff', '#12345g', '4b5bd6', '']) {
      expect(() => hexToRgb(bad), bad).toThrow(RangeError);
    }
  });

  it('mix goes from the first colour (0) to the second (1)', () => {
    const black: Rgb = [0, 0, 0];
    const white: Rgb = [1, 1, 1];
    expect(mix(black, white, 0)).toEqual([0, 0, 0]);
    expect(mix(black, white, 1)).toEqual([1, 1, 1]);
    expect(mix(black, white, 0.25)).toEqual([0.25, 0.25, 0.25]);
  });
});

describe('palette', () => {
  it('every colour is three finite channels from 0 to 1', () => {
    for (const [name, colour] of Object.entries(palette)) {
      expect(colour, name).toHaveLength(3);
      for (const channel of colour) {
        expect(Number.isFinite(channel), name).toBe(true);
        expect(channel, name).toBeGreaterThanOrEqual(0);
        expect(channel, name).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the page is white paper', () => {
    expect(palette.page).toEqual([1, 1, 1]);
  });

  it('text stays readable on the colours it is printed on (WCAG: 4.5 for text, 3 for big numbers and shapes)', () => {
    expect(contrast(palette.text, palette.page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.text, palette.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.textMuted, palette.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.textMuted, palette.tile)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.onBand, palette.band)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.onBandSoft, palette.band)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.band, palette.tile)).toBeGreaterThanOrEqual(3);
    expect(contrast(palette.star, palette.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(palette.barBest, palette.track)).toBeGreaterThanOrEqual(3);
    expect(contrast(palette.barLast, palette.track)).toBeGreaterThanOrEqual(3);
  });
});
