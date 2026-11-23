import { describe, expect, it } from 'vitest';
import { parseTestText } from './parseTest';

const GOOD = [
  '1. ગુજરાતની રાજધાની કઈ છે?',
  'A) અમદાવાદ',
  'B) **ગાંધીનગર**',
  'C) સુરત',
  'D) રાજકોટ',
  '',
  'Q2) Capital of India?',
  '**New Delhi**',
  'Mumbai',
  'Kolkata',
  'Chennai',
].join('\n');

describe('parseTestText', () => {
  it('reads questions, strips labels and finds the bold answer', () => {
    const r = parseTestText(GOOD);
    expect(r.errors).toEqual([]);
    expect(r.questions).toHaveLength(2);
    expect(r.questions.map((q) => q.text)).toEqual(['ગુજરાતની રાજધાની કઈ છે?', 'Capital of India?']);
    expect(r.questions.map((q) => q.options)).toEqual([
      ['અમદાવાદ', 'ગાંધીનગર', 'સુરત', 'રાજકોટ'],
      ['New Delhi', 'Mumbai', 'Kolkata', 'Chennai'],
    ]);
    expect(r.questions.map((q) => q.correctIndex)).toEqual([1, 0]);
  });

  it('creates unique qst IDs', () => {
    const r = parseTestText(GOOD);
    const ids = r.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id.startsWith('qst')).toBe(true);
  });

  it('accepts CRLF, a BOM, extra blank lines and bold around the label', () => {
    const text = '\uFEFF\r\n\r\nQ1. Text\r\n\r\nA) a\r\n**B) b**\r\nC) c\r\n\r\nD) d\r\n';
    const r = parseTestText(text);
    expect(r.errors).toEqual([]);
    expect(r.questions.map((q) => q.options)).toEqual([['a', 'b', 'c', 'd']]);
    expect(r.questions.map((q) => q.correctIndex)).toEqual([1]);
  });

  it('reports a question without a bold option with its line number', () => {
    const r = parseTestText('1. First\na\nb\nc\nd\n\n2. Second\na\nb\nc\nd');
    expect(r.questions).toHaveLength(0);
    expect(r.errors).toEqual([
      { line: 1, code: 'no_bold_option' },
      { line: 7, code: 'no_bold_option' },
    ]);
  });

  it('reports two bold options', () => {
    const r = parseTestText('1. First\n**a**\n**b**\nc\nd');
    expect(r.questions).toHaveLength(0);
    expect(r.errors).toEqual([{ line: 1, code: 'multiple_bold_options' }]);
  });

  it('reports 3 and 5 options with the count found', () => {
    const three = parseTestText('1. First\n**a**\nb\nc');
    expect(three.errors).toEqual([{ line: 1, code: 'wrong_option_count', found: 3 }]);
    const five = parseTestText('1. First\n**a**\nb\nc\nd\ne');
    expect(five.errors).toEqual([{ line: 1, code: 'wrong_option_count', found: 5 }]);
  });

  it('keeps the good questions when another one is bad', () => {
    const r = parseTestText('1. Bad\na\nb\n\n2. Good\n**a**\nb\nc\nd');
    expect(r.questions.map((q) => q.text)).toEqual(['Good']);
    expect(r.errors).toEqual([{ line: 1, code: 'wrong_option_count', found: 2 }]);
  });

  it('reports text before the first question once, and an empty question', () => {
    const r = parseTestText('Intro line\nanother line\n1.\n**a**\nb\nc\nd');
    expect(r.questions).toHaveLength(0);
    expect(r.errors).toEqual([
      { line: 1, code: 'text_before_first_question' },
      { line: 3, code: 'empty_question' },
    ]);
  });

  it('reports an empty option with its own line', () => {
    const r = parseTestText('1. First\n**a**\nB)\nc\nd');
    expect(r.errors).toEqual([{ line: 3, code: 'empty_option' }]);
  });

  it('does not treat numbers inside options as a new question', () => {
    const r = parseTestText('1. How heavy?\n5.5 kg\n**5-10 years**\n2020\nA) 12');
    expect(r.errors).toEqual([]);
    expect(r.questions.map((q) => q.options)).toEqual([['5.5 kg', '5-10 years', '2020', '12']]);
    expect(r.questions.map((q) => q.correctIndex)).toEqual([1]);
  });

  it('returns nothing for empty input', () => {
    expect(parseTestText('')).toEqual({ questions: [], errors: [] });
    expect(parseTestText('\n \n\t\n')).toEqual({ questions: [], errors: [] });
  });
});
