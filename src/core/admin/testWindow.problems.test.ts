import { describe, expect, it } from 'vitest';
import { newId } from '../content/ids';
import type { Question, Test } from '../content/types';
import { newQuestion } from './model';
import { blankQuestion, testProblems } from './testWindow';

const COURSE = newId('crs');

const good = (text = 'ગુજરાતની રાજધાની કઈ?'): Question => newQuestion(text, ['અમદાવાદ', 'ગાંધીનગર', 'સુરત', 'વડોદરા'], 1);
const test = (questions: Question[], questionsPerGame = 1): Test => ({ id: newId('tst'), questionsPerGame, questions });

describe('testProblems', () => {
  it('a complete test has no problem', () => {
    expect(testProblems(test([good(), good('બીજો પ્રશ્ન')]), [], COURSE)).toEqual([]);
  });

  it('never reports the course around it (no course title is needed)', () => {
    expect(testProblems(test([good()]), [], COURSE).map((p) => p.key)).not.toContain('admin.problem.courseTitle');
  });

  it('an empty question text is problem "question n text"', () => {
    const empty = { ...good(), text: '' };
    expect(testProblems(test([good(), empty]), [], COURSE)).toEqual([{ key: 'admin.problem.questionText', n: 2 }]);
  });

  it('an empty option is listed once per question, even when several options are empty', () => {
    const half = { ...good(), options: ['x', '', '', 'y'] as Question['options'] };
    expect(testProblems(test([half]), [], COURSE)).toEqual([{ key: 'admin.problem.questionOptions', n: 1 }]);
  });

  it('a placeholder that was not dropped shows its text and option problems', () => {
    const keys = testProblems(test([blankQuestion()]), [], COURSE).map((p) => p.key);
    expect(new Set(keys)).toEqual(new Set(['admin.problem.questionText', 'admin.problem.questionOptions']));
  });

  it('a "questions per game" of 0 is its own problem', () => {
    expect(testProblems(test([good()], 0), [], COURSE)).toEqual([{ key: 'admin.problem.perGame' }]);
  });
});
