import { describe, expect, it } from 'vitest';
import type { Question } from '../content/types';
import { newQuestion } from './model';
import {
  blankQuestion,
  isBlankQuestion,
  moveQuestion,
  removeQuestion,
  replaceQuestion,
  withCorrect,
  withExplanation,
  withOption,
  withText,
  withoutBlankQuestions,
} from './testWindow';

const q = (text: string, correct: 0 | 1 | 2 | 3 = 0): Question => newQuestion(text, ['a', 'b', 'c', 'd'], correct);
const ids = (list: readonly Question[]) => list.map((x) => x.id);

describe('blankQuestion / isBlankQuestion', () => {
  it('a new question has a question id, no text, four empty options and the first one correct', () => {
    const blank = blankQuestion();
    expect(blank.id).toMatch(/^qst-[a-z0-9]{8}$/);
    expect(blank.text).toBe('');
    expect(blank.options).toEqual(['', '', '', '']);
    expect(blank.correctIndex).toBe(0);
    expect(blank.explanation).toBeUndefined();
  });

  it('two new questions never share an id', () => {
    expect(blankQuestion().id).not.toBe(blankQuestion().id);
  });

  it('is blank for the placeholder and for spaces only', () => {
    expect(isBlankQuestion(blankQuestion())).toBe(true);
    expect(isBlankQuestion({ ...blankQuestion(), text: '  ', options: [' ', '', '  ', ''], explanation: '   ' })).toBe(true);
  });

  it.each([
    ['a question text', { text: 'ગુજરાતની રાજધાની?' }],
    ['one option', { options: ['', '', 'x', ''] as Question['options'] }],
    ['an explanation', { explanation: 'because' }],
  ])('is not blank with %s', (_label, patch) => {
    expect(isBlankQuestion({ ...blankQuestion(), ...patch })).toBe(false);
  });
});

describe('withoutBlankQuestions', () => {
  it('drops untouched placeholders and keeps the order of the rest', () => {
    const one = q('one');
    const two = q('two');
    const result = withoutBlankQuestions([one, blankQuestion(), two, blankQuestion()]);
    expect(ids(result)).toEqual([one.id, two.id]);
  });

  it('keeps a half-filled question (Save then shows its problem instead of losing it)', () => {
    const half = { ...blankQuestion(), text: 'only the question' };
    expect(withoutBlankQuestions([half])).toEqual([half]);
  });
});

describe('moveQuestion', () => {
  const list = [q('1'), q('2'), q('3')];

  it('moves a question up and down by one place', () => {
    expect(moveQuestion(list, 1, -1).map((x) => x.text)).toEqual(['2', '1', '3']);
    expect(moveQuestion(list, 1, 1).map((x) => x.text)).toEqual(['1', '3', '2']);
  });

  it('a move off the first or last place keeps the order', () => {
    expect(ids(moveQuestion(list, 0, -1))).toEqual(ids(list));
    expect(ids(moveQuestion(list, 2, 1))).toEqual(ids(list));
    expect(ids(moveQuestion(list, 7, 1))).toEqual(ids(list));
    expect(ids(moveQuestion(list, -1, 1))).toEqual(ids(list));
  });

  it('never changes the list it was given', () => {
    const before = ids(list);
    moveQuestion(list, 0, 1);
    expect(ids(list)).toEqual(before);
  });
});

describe('removeQuestion / replaceQuestion', () => {
  const list = [q('1'), q('2'), q('3')];

  it('removes the question with the id', () => {
    const second = list[1];
    expect(second).toBeDefined();
    expect(removeQuestion(list, second?.id ?? '').map((x) => x.text)).toEqual(['1', '3']);
  });

  it('an unknown id changes nothing', () => {
    expect(ids(removeQuestion(list, 'qst-unknown1'))).toEqual(ids(list));
    expect(replaceQuestion(list, { ...q('x'), id: 'qst-unknown1' })).toEqual(list);
  });

  it('replaces only the question with the same id, in place', () => {
    const second = list[1];
    const next = { ...(second ?? q('?')), text: 'two changed' };
    expect(replaceQuestion(list, next).map((x) => x.text)).toEqual(['1', 'two changed', '3']);
  });
});

describe('field helpers', () => {
  const base = newQuestion('Q', ['a', 'b', 'c', 'd'], 1, 'because');

  it('withText changes only the text', () => {
    expect(withText(base, 'ગણિત')).toEqual({ ...base, text: 'ગણિત' });
  });

  it('withOption changes exactly one option and leaves the original alone', () => {
    const next = withOption(base, 2, 'ઉત્તર');
    expect(next.options).toEqual(['a', 'b', 'ઉત્તર', 'd']);
    expect(base.options).toEqual(['a', 'b', 'c', 'd']);
  });

  it('withCorrect marks another option', () => {
    expect(withCorrect(base, 3).correctIndex).toBe(3);
    expect(base.correctIndex).toBe(1);
  });

  it('withExplanation sets the text, and an empty or spaces-only text removes it', () => {
    expect(withExplanation(base, 'new').explanation).toBe('new');
    expect('explanation' in withExplanation(base, '')).toBe(false);
    expect('explanation' in withExplanation(base, '   ')).toBe(false);
  });
});
