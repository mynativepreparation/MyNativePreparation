import { describe, expect, it } from 'vitest';
import { isGujaratiCodePoint, splitRuns } from './runs';

const joined = (text: string) =>
  splitRuns(text)
    .map((run) => run.text)
    .join('');

describe('splitRuns', () => {
  it('returns no runs for an empty string', () => {
    expect(splitRuns('')).toEqual([]);
  });

  it('passes every string through unchanged (runs joined again equal the input)', () => {
    const samples = [
      'Std 10 ગણિત - Test 1: પરિણામ 8/10 (80%)',
      'ક્ષ જ્ઞ ત્ર શ્ર દ્ય દ્વ ક્ર',
      'ર્ક ર્મ ધર્મ કર્મ સર્વ ગર્વ',
      'કા કિ કી કુ કૂ કૃ કે કૈ કો કૌ',
      'અં અઃ અઁ કં કઃ કઁ',
      '૧૨૩૪૫૬૭૮૯૦',
      'plain English only',
      'ક\u200Dક ક\u200Cક',
    ];
    for (const sample of samples) expect(joined(sample)).toBe(sample);
  });

  it('keeps a whole Gujarati word, including conjuncts and matras, in ONE run', () => {
    expect(splitRuns('વિદ્યાર્થી')).toEqual([{ text: 'વિદ્યાર્થી', script: 'gujarati' }]);
  });

  it('puts spaces and punctuation between Gujarati words into Latin runs', () => {
    expect(splitRuns('ગુજરાતી ભાષા')).toEqual([
      { text: 'ગુજરાતી', script: 'gujarati' },
      { text: ' ', script: 'latin' },
      { text: 'ભાષા', script: 'gujarati' },
    ]);
  });

  it('switches script for a mixed Latin and Gujarati line', () => {
    const scripts = splitRuns('Std 10 ગણિત - Test 1: પરિણામ 8/10 (80%)').map((run) => run.script);
    expect(scripts).toEqual(['latin', 'gujarati', 'latin', 'gujarati', 'latin']);
  });

  it('treats Gujarati digits as Gujarati and Latin digits as Latin', () => {
    expect(splitRuns('૧૨૩')).toEqual([{ text: '૧૨૩', script: 'gujarati' }]);
    expect(splitRuns('123')).toEqual([{ text: '123', script: 'latin' }]);
  });

  it('keeps the joiners U+200C and U+200D inside the Gujarati run', () => {
    expect(splitRuns('ક\u200Dક')).toEqual([{ text: 'ક\u200Dક', script: 'gujarati' }]);
    expect(splitRuns('ક\u200Cક')).toEqual([{ text: 'ક\u200Cક', script: 'gujarati' }]);
  });

  it('does not split a character outside the BMP into halves', () => {
    expect(joined('a😀ક')).toBe('a😀ક');
  });
});

describe('isGujaratiCodePoint', () => {
  it('covers the Gujarati block and the marks the Gujarati font carries', () => {
    expect(isGujaratiCodePoint(0x0a80)).toBe(true);
    expect(isGujaratiCodePoint(0x0aff)).toBe(true);
    expect(isGujaratiCodePoint(0x0964)).toBe(true);
    expect(isGujaratiCodePoint(0x25cc)).toBe(true);
  });

  it('rejects Latin, space and neighbouring Indic blocks', () => {
    expect(isGujaratiCodePoint(0x41)).toBe(false);
    expect(isGujaratiCodePoint(0x20)).toBe(false);
    expect(isGujaratiCodePoint(0x0a7f)).toBe(false);
    expect(isGujaratiCodePoint(0x0b00)).toBe(false);
  });
});
