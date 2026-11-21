import { describe, expect, it } from 'vitest';
import { splitClusters, wrapText } from './wrapText';

// Fake measure: every code point is 10 points wide.
const measure = (text: string): number => Array.from(text).length * 10;

describe('splitClusters', () => {
  it('keeps a letter with its vowel signs', () => {
    expect(splitClusters('કિ')).toEqual(['કિ']);
    expect(splitClusters('કાકી')).toEqual(['કા', 'કી']);
    expect(splitClusters('કં')).toEqual(['કં']);
  });

  it('keeps a conjunct together (the letter after a virama joins)', () => {
    expect(splitClusters('ક્ષ')).toEqual(['ક્ષ']);
    expect(splitClusters('ક્ષિ')).toEqual(['ક્ષિ']);
    expect(splitClusters('દ્યા')).toEqual(['દ્યા']);
  });

  it('does not join across a space or between plain letters', () => {
    expect(splitClusters('કા ક')).toEqual(['કા', ' ', 'ક']);
    expect(splitClusters('abc')).toEqual(['a', 'b', 'c']);
  });
});

describe('wrapText', () => {
  it('empty or blank text gives no lines', () => {
    expect(wrapText('', 100, measure)).toEqual([]);
    expect(wrapText('   \n ', 100, measure)).toEqual([]);
  });

  it('text that fits stays on one line', () => {
    expect(wrapText('hello world', 200, measure)).toEqual(['hello world']);
  });

  it('breaks between words and counts any whitespace as one space', () => {
    expect(wrapText('aaa bbb ccc', 70, measure)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapText('a\n\n  b', 100, measure)).toEqual(['a b']);
  });

  it('cuts a word that is wider than a line, also after other words', () => {
    expect(wrapText('abcdefghij', 40, measure)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('ab cdefghijkl', 50, measure)).toEqual(['ab', 'cdefg', 'hijkl']);
  });

  it('never cuts inside a Gujarati conjunct', () => {
    const word = 'ક્ષ'.repeat(10);
    const lines = wrapText(word, 100, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(word);
    for (const line of lines) {
      expect(measure(line)).toBeLessThanOrEqual(100);
      expect(line).toBe('ક્ષ'.repeat(line.length / 3));
    }
  });

  it('never separates a vowel sign from its letter', () => {
    const lines = wrapText('કી'.repeat(12), 50, measure);
    expect(lines.join('')).toBe('કી'.repeat(12));
    for (const line of lines) expect(line).toBe('કી'.repeat(line.length / 2));
  });

  it('always ends, even when one cluster is wider than the line', () => {
    expect(wrapText('abc', 5, measure)).toEqual(['a', 'b', 'c']);
  });

  it('every line fits the width', () => {
    const text = 'ભારતીય બંધારણ અને રાજ્યવ્યવસ્થા ' + 'ક્ષ'.repeat(25) + ' end';
    for (const line of wrapText(text, 120, measure)) expect(measure(line)).toBeLessThanOrEqual(120);
  });

  it('limits the number of lines and ends the last one with three dots', () => {
    expect(wrapText('aaa bbb ccc ddd', 60, measure, 2)).toEqual(['aaa', 'bbb...']);
    const long = wrapText('word '.repeat(40), 100, measure, 3);
    expect(long).toHaveLength(3);
    expect(long[2]?.endsWith('...')).toBe(true);
    expect(measure(long[2] ?? '')).toBeLessThanOrEqual(100);
  });

  it('text that already fits the line limit is not touched', () => {
    expect(wrapText('aaa bbb', 100, measure, 1)).toEqual(['aaa bbb']);
  });
});
