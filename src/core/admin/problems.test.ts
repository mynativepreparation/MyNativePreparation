import { describe, expect, it } from 'vitest';
import type { Block, Question, Test } from '../content/types';
import type { CourseDraft } from './model';
import { summarizeProblems, type Problem } from './problems';

const base = (): CourseDraft => ({
  course: { id: 'crs-aaaaaaaa', title: 'Science', order: 1 },
  overview: [],
  content: [],
  test: null,
  images: [],
});

const text = (id: string, value = 'Hello'): Block => ({ id: `blk-${id.repeat(8)}`, type: 'text', text: value });
const question = (id: string, change: Partial<Question> = {}): Question => ({
  id: `qst-${id.repeat(8)}`,
  text: 'Question?',
  options: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
  ...change,
});
const testOf = (questions: Question[], questionsPerGame = 1): Test => ({ id: 'tst-aaaaaaaa', questionsPerGame, questions });

const withDraft = (change: Partial<CourseDraft>): CourseDraft => ({ ...base(), ...change });

describe('summarizeProblems', () => {
  it('gives an empty list for a good draft (also an empty one)', () => {
    expect(summarizeProblems(base())).toEqual([]);
    const good = withDraft({ overview: [text('a')], content: [text('b')], test: testOf([question('a')]) });
    expect(summarizeProblems(good)).toEqual([]);
  });

  it.each<[string, Partial<CourseDraft>, Problem[]]>([
    [
      'a text block with no text',
      { overview: [text('a', '')] },
      [{ key: 'admin.problem.blockText', part: 'overview', n: 1 }],
    ],
    [
      'an image block with no picture (second block of Content)',
      { content: [text('a'), { id: 'blk-bbbbbbbb', type: 'image', src: '', alt: '' }] },
      [{ key: 'admin.problem.blockImage', part: 'content', n: 2 }],
    ],
    [
      'an image block whose picture is not in the draft',
      { overview: [{ id: 'blk-aaaaaaaa', type: 'image', src: 'images/1.webp', alt: '' }] },
      [{ key: 'admin.problem.blockImage', part: 'overview', n: 1 }],
    ],
    [
      'a question with no text',
      { test: testOf([question('a', { text: '' })]) },
      [{ key: 'admin.problem.questionText', n: 1 }],
    ],
    [
      'a question with an empty answer box (two empty boxes are listed once)',
      { test: testOf([question('a'), question('b', { options: ['', '', 'c', 'd'] })]) },
      [{ key: 'admin.problem.questionOptions', n: 2 }],
    ],
    [
      'a question with 3 answers',
      { test: testOf([question('a', { options: ['a', 'b', 'c'] as unknown as Question['options'] })]) },
      [{ key: 'admin.problem.questionOptions', n: 1 }],
    ],
    [
      'a question whose correct answer is out of range',
      { test: testOf([question('a', { correctIndex: 4 as unknown as Question['correctIndex'] })]) },
      [{ key: 'admin.problem.questionCorrect', n: 1 }],
    ],
    ['questions per game 0', { test: testOf([question('a')], 0) }, [{ key: 'admin.problem.perGame' }]],
    [
      'a cover picture that is not in the draft',
      { course: { id: 'crs-aaaaaaaa', title: 'Science', order: 1, cover: 'images/c.webp' } },
      [{ key: 'admin.problem.image' }],
    ],
    [
      'the same block id in Overview and Content (generic problem)',
      { overview: [text('a')], content: [text('a')] },
      [{ key: 'admin.problem.other' }],
    ],
    ['an empty course title', { course: { id: 'crs-aaaaaaaa', title: '  ', order: 1 } }, [{ key: 'admin.problem.courseTitle' }]],
  ])('%s', (_name, change, expected) => {
    expect(summarizeProblems(withDraft(change))).toEqual(expected);
  });

  it('lists several problems once each, in order, and never a raw message', () => {
    const draft = withDraft({
      overview: [text('a', '')],
      content: [text('b', ' ')],
      test: testOf([question('a', { text: '' }), question('b', { correctIndex: 9 as unknown as Question['correctIndex'] })], 0),
    });
    const problems = summarizeProblems(draft);
    expect(problems).toEqual([
      { key: 'admin.problem.blockText', part: 'overview', n: 1 },
      { key: 'admin.problem.blockText', part: 'content', n: 1 },
      { key: 'admin.problem.perGame' },
      { key: 'admin.problem.questionText', n: 1 },
      { key: 'admin.problem.questionCorrect', n: 2 },
    ]);
    expect(problems.map((p) => p.key.startsWith('admin.problem.'))).toEqual(problems.map(() => true));
  });
});
