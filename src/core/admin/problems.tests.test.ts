// Friendly problems for SEVERAL tests (P10 T11r): `tests[i]: ...` messages are turned into the same short problems as before.
import { describe, expect, it } from 'vitest';
import type { Question, Test } from '../content/types';
import type { CourseDraft } from './model';
import { summarizeProblems } from './problems';

const question = (change: Partial<Question> = {}, id = 'a'): Question => ({
  id: `qst-${id.repeat(8)}`,
  text: 'Question?',
  options: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
  ...change,
});
const testOf = (id: string, questions: Question[], questionsPerGame = 1): Test => ({
  id: `tst-${id.repeat(8)}`,
  questionsPerGame,
  questions,
});
const draftOf = (tests: Test[]): CourseDraft => ({
  course: { id: 'crs-aaaaaaaa', title: 'Science', order: 1 },
  overview: [],
  content: [],
  tests,
  images: [],
});

describe('summarizeProblems with several tests', () => {
  it('gives an empty list when every test is good', () => {
    expect(summarizeProblems(draftOf([testOf('a', [question()]), testOf('b', [question()]), testOf('c', [question()])]))).toEqual([]);
    expect(summarizeProblems(draftOf([]))).toEqual([]);
  });

  it('finds a question with no text in the second test', () => {
    const draft = draftOf([testOf('a', [question()]), testOf('b', [question({ text: '' })])]);
    expect(summarizeProblems(draft)).toEqual([{ key: 'admin.problem.questionText', n: 1 }]);
  });

  it('finds an empty answer box in the second question of the first test', () => {
    const draft = draftOf([testOf('a', [question(), question({ options: ['', 'b', 'c', 'd'] }, 'b')])]);
    expect(summarizeProblems(draft)).toEqual([{ key: 'admin.problem.questionOptions', n: 2 }]);
  });

  it('finds questions per game 0 in any test', () => {
    const draft = draftOf([testOf('a', [question()]), testOf('b', [question()], 0)]);
    expect(summarizeProblems(draft)).toEqual([{ key: 'admin.problem.perGame' }]);
  });

  it('finds a test picture that is not in the draft', () => {
    const draft = draftOf([{ ...testOf('a', [question()]), image: 'images/z.png' }]);
    expect(summarizeProblems(draft)).toEqual([{ key: 'admin.problem.image' }]);
  });

  it('lists the same problem of two tests once, and different question numbers separately, in order', () => {
    const same = draftOf([testOf('a', [question({ text: '' })]), testOf('b', [question({ text: '' })])]);
    expect(summarizeProblems(same)).toEqual([{ key: 'admin.problem.questionText', n: 1 }]);

    const different = draftOf([testOf('a', [question({ text: '' })]), testOf('b', [question(), question({ text: '' }, 'b')])]);
    expect(summarizeProblems(different)).toEqual([
      { key: 'admin.problem.questionText', n: 1 },
      { key: 'admin.problem.questionText', n: 2 },
    ]);
  });

  it('two tests with the same id are one generic problem, never a raw message', () => {
    const draft = draftOf([testOf('a', [question()]), testOf('a', [question()])]);
    expect(summarizeProblems(draft)).toEqual([{ key: 'admin.problem.other' }]);
  });
});
