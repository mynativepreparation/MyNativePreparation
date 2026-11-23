import { describe, expect, it } from 'vitest';
import { defaultLetterSegmenter, isBlankLetter, splitLetters, splitLettersFallback, type LetterSegmenter } from './letters';

const SAMPLES = [
  '',
  'abc',
  'ગુજરાતી',
  'ક્ષ',
  'વિદ્યા',
  'શિક્ષણ અને પરીક્ષા',
  'a b\tc\nd',
  '\u0ABEક', // a lone vowel sign in front
  '👍🏽 ok',
  'e\u0301', // e + combining accent
  '\u0000\u0001',
];

describe('splitLettersFallback', () => {
  it('splits plain letters one by one', () => {
    expect(splitLettersFallback('abc')).toEqual(['a', 'b', 'c']);
  });

  it('keeps a Gujarati letter with its vowel sign', () => {
    expect(splitLettersFallback('ગુજરાતી')).toEqual(['ગુ', 'જ', 'રા', 'તી']);
  });

  it('keeps a conjunct (virama + letter) in one piece', () => {
    expect(splitLettersFallback('ક્ષ')).toEqual(['ક્ષ']);
    expect(splitLettersFallback('વિદ્યા')).toEqual(['વિ', 'દ્યા']);
  });

  it('a virama at the end of a word does not swallow the space after it', () => {
    expect(splitLettersFallback('ક્ ષ')).toEqual(['ક્', ' ', 'ષ']);
  });

  it('keeps a combining accent with its letter', () => {
    expect(splitLettersFallback('e\u0301x')).toEqual(['e\u0301', 'x']);
  });

  it('gives a lone mark at the start its own piece', () => {
    expect(splitLettersFallback('\u0ABEક')).toEqual(['\u0ABE', 'ક']);
  });

  it('is empty for empty text', () => {
    expect(splitLettersFallback('')).toEqual([]);
  });

  it.each(SAMPLES)('never loses a character: %j joins back to the text', (text) => {
    expect(splitLettersFallback(text).join('')).toBe(text);
  });
});

describe('splitLetters', () => {
  it('is empty for empty text', () => {
    expect(splitLetters('')).toEqual([]);
    expect(splitLetters('', null)).toEqual([]);
  });

  it('splits plain letters one by one with or without a browser segmenter', () => {
    expect(splitLetters('abc')).toEqual(['a', 'b', 'c']);
    expect(splitLetters('abc', null)).toEqual(['a', 'b', 'c']);
  });

  it.each(SAMPLES)('never loses a character with the browser segmenter: %j', (text) => {
    expect(splitLetters(text).join('')).toBe(text);
  });

  it('uses the fallback when there is no segmenter', () => {
    expect(splitLetters('ગુજરાતી', null)).toEqual(['ગુ', 'જ', 'રા', 'તી']);
  });

  it('uses the pieces of a working segmenter', () => {
    const fake: LetterSegmenter = {
      segment: (input) => [{ segment: input.slice(0, 2) }, { segment: input.slice(2) }],
    };
    expect(splitLetters('abcd', fake)).toEqual(['ab', 'cd']);
  });

  it('falls back when the segmenter loses characters', () => {
    const lossy: LetterSegmenter = { segment: () => [{ segment: 'a' }] };
    expect(splitLetters('abc', lossy)).toEqual(['a', 'b', 'c']);
  });

  it('falls back when the segmenter throws', () => {
    const broken: LetterSegmenter = {
      segment: () => {
        throw new Error('boom');
      },
    };
    expect(splitLetters('abc', broken)).toEqual(['a', 'b', 'c']);
  });

  it('the default segmenter is created once', () => {
    expect(defaultLetterSegmenter()).toBe(defaultLetterSegmenter());
  });
});

describe('isBlankLetter', () => {
  it.each([' ', '\t', '\n', '  '])('%j is blank', (letter) => {
    expect(isBlankLetter(letter)).toBe(true);
  });

  it.each(['a', 'ક', '.', ''])('%j is not blank', (letter) => {
    expect(isBlankLetter(letter)).toBe(false);
  });
});
