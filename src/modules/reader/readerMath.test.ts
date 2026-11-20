import { describe, expect, it } from 'vitest';
import { DEFAULT_SCALE, MAX_SCALE, MIN_SCALE, clampScale, pinchScale, splitParagraphs } from './readerMath';

describe('font scale limits', () => {
  it('uses 0.8 to 2.0 with 1.0 as the start', () => {
    expect(MIN_SCALE).toBe(0.8);
    expect(MAX_SCALE).toBe(2);
    expect(DEFAULT_SCALE).toBe(1);
  });
});

describe('clampScale', () => {
  it('keeps values inside the range', () => {
    expect(clampScale(1)).toBe(1);
    expect(clampScale(1.5)).toBe(1.5);
  });

  it('keeps the exact limits', () => {
    expect(clampScale(0.8)).toBe(0.8);
    expect(clampScale(2)).toBe(2);
  });

  it('pulls values outside the range back to the nearest limit', () => {
    expect(clampScale(0.1)).toBe(0.8);
    expect(clampScale(-3)).toBe(0.8);
    expect(clampScale(5)).toBe(2);
  });

  it('gives the default for values that are not finite numbers', () => {
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampScale(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe('pinchScale', () => {
  it('keeps the scale when the finger distance does not change', () => {
    expect(pinchScale(100, 100, 1.2)).toBeCloseTo(1.2);
  });

  it('makes the text bigger when the fingers move apart', () => {
    expect(pinchScale(100, 150, 1)).toBe(1.5);
  });

  it('makes the text smaller when the fingers move together', () => {
    expect(pinchScale(100, 90, 1)).toBeCloseTo(0.9);
  });

  it('builds on the scale the pinch started with', () => {
    expect(pinchScale(200, 250, 1.2)).toBeCloseTo(1.5);
  });

  it('never goes above 2.0 or below 0.8', () => {
    expect(pinchScale(100, 1000, 1)).toBe(2);
    expect(pinchScale(100, 10, 1)).toBe(0.8);
    expect(pinchScale(100, 0, 1)).toBe(0.8);
  });

  it('keeps the (clamped) start scale when the distances cannot be compared', () => {
    expect(pinchScale(0, 100, 1.3)).toBe(1.3);
    expect(pinchScale(-5, 100, 1.3)).toBe(1.3);
    expect(pinchScale(Number.NaN, 100, 1.3)).toBe(1.3);
    expect(pinchScale(100, Number.NaN, 1.3)).toBe(1.3);
    expect(pinchScale(100, -20, 1.3)).toBe(1.3);
    expect(pinchScale(0, 100, 9)).toBe(2);
  });

  it('gives the default when the start scale itself is broken', () => {
    expect(pinchScale(100, 150, Number.NaN)).toBe(1);
    expect(pinchScale(0, 150, Number.NaN)).toBe(1);
  });
});

describe('splitParagraphs', () => {
  it('gives [] for missing or empty text', () => {
    expect(splitParagraphs(undefined)).toEqual([]);
    expect(splitParagraphs(null)).toEqual([]);
    expect(splitParagraphs('')).toEqual([]);
    expect(splitParagraphs('  \n \n\t ')).toEqual([]);
  });

  it('keeps one paragraph as one item', () => {
    expect(splitParagraphs('Hello world')).toEqual(['Hello world']);
  });

  it('splits on a blank line', () => {
    expect(splitParagraphs('First\n\nSecond')).toEqual(['First', 'Second']);
  });

  it('keeps single line breaks inside a paragraph', () => {
    expect(splitParagraphs('Line one\nLine two\n\nNext')).toEqual(['Line one\nLine two', 'Next']);
  });

  it('treats several blank lines and lines with only spaces as one split', () => {
    expect(splitParagraphs('A\n\n\n\nB')).toEqual(['A', 'B']);
    expect(splitParagraphs('A\n   \nB')).toEqual(['A', 'B']);
  });

  it('understands Windows and old Mac line endings', () => {
    expect(splitParagraphs('A\r\n\r\nB')).toEqual(['A', 'B']);
    expect(splitParagraphs('A\r\rB')).toEqual(['A', 'B']);
    expect(splitParagraphs('A\r\nB')).toEqual(['A\nB']);
  });

  it('trims each paragraph and drops empty ones at the ends', () => {
    expect(splitParagraphs('\n\n  First  \n\n  Second\n\n')).toEqual(['First', 'Second']);
  });

  it('keeps Gujarati text unchanged', () => {
    expect(splitParagraphs('પહેલો ફકરો\n\nબીજો ફકરો')).toEqual(['પહેલો ફકરો', 'બીજો ફકરો']);
  });

  it('never treats text as HTML', () => {
    expect(splitParagraphs('<b>bold</b> & <script>x</script>')).toEqual(['<b>bold</b> & <script>x</script>']);
  });
});
