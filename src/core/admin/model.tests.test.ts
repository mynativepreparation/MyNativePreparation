// @vitest-environment node
// Several tests per course (P10 T11r, DECISIONS Q27): the draft holds `tests: Test[]`, each test is written as `tests/<tst-id>.json`,
// the old single `test.json` is still read, and old stored drafts (one `test`) are migrated.
import { describe, expect, it } from 'vitest';
import type { Block, Question, Test } from '../content/types';
import { testFilePath } from '../content/testFiles';
import {
  createCourseDraft,
  draftFromFiles,
  draftToFiles,
  firstTest,
  migrateDraft,
  newImageBlock,
  replaceFirstTest,
  validateDraft,
  type CourseDraft,
  type DraftFiles,
  type StoredDraft,
} from './model';

const question = (id: string, text = 'Q?'): Question => ({
  id: `qst-${id.repeat(8)}`,
  text,
  options: ['a', 'b', 'c', 'd'],
  correctIndex: 1,
});
const testOf = (id: string, ...questions: Question[]): Test => ({ id: `tst-${id.repeat(8)}`, questionsPerGame: 1, questions });

const T1 = testOf('a', question('a'));
const T2 = testOf('b', question('b'));
const CARD = { id: 'crs-aaaaaaaa', title: 'Science', order: 1 };

const draftWith = (tests: Test[]): CourseDraft => ({ ...createCourseDraft({ title: 'Science' }), tests });
const textOf = (files: DraftFiles, name: string): string => {
  const value = files[name];
  return typeof value === 'string' ? value : '';
};

describe('firstTest and replaceFirstTest', () => {
  it('firstTest gives the first test, or null when there is none', () => {
    expect(firstTest(draftWith([T1, T2]))).toEqual(T1);
    expect(firstTest(draftWith([]))).toBeNull();
  });

  it('replaceFirstTest swaps only the first test and keeps the others', () => {
    const changed = { ...T1, questionsPerGame: 1, image: 'images/1.png' };
    expect(replaceFirstTest([T1, T2], changed)).toEqual([changed, T2]);
    expect(replaceFirstTest([], T1)).toEqual([T1]);
  });

  it('replaceFirstTest with null removes the first test only, and never changes the list it was given', () => {
    const list = [T1, T2];
    expect(replaceFirstTest(list, null)).toEqual([T2]);
    expect(replaceFirstTest([], null)).toEqual([]);
    expect(list).toEqual([T1, T2]);
  });
});

describe('migrateDraft', () => {
  const rest = (): Omit<CourseDraft, 'tests'> => ({ course: CARD, overview: [], content: [], images: [] });

  it('turns the old single test into a list of one and drops the old field', () => {
    const migrated = migrateDraft({ ...rest(), test: T1 });
    expect(migrated.tests).toEqual([T1]);
    expect('test' in migrated).toBe(false);
  });

  it('an old draft with no test (null or missing) gets an empty list', () => {
    expect(migrateDraft({ ...rest(), test: null }).tests).toEqual([]);
    expect(migrateDraft(rest()).tests).toEqual([]);
  });

  it('a draft that already has tests keeps them', () => {
    const stored: StoredDraft = { ...rest(), tests: [T2], test: T1 };
    expect(migrateDraft(stored).tests).toEqual([T2]);
  });

  it('keeps everything else of the draft', () => {
    const migrated = migrateDraft({ ...rest(), test: T1 });
    expect(migrated.course).toEqual(CARD);
    expect(migrated.images).toEqual([]);
  });
});

describe('draftToFiles: one file per test', () => {
  it('writes tests/<id>.json for every test with questions and never test.json', () => {
    const files = draftToFiles(draftWith([T1, T2]));
    expect(Object.keys(files).sort()).toEqual(['course.json', testFilePath(T1.id), testFilePath(T2.id)].sort());
    expect('test.json' in files).toBe(false);
    expect(JSON.parse(textOf(files, testFilePath(T1.id)))).toEqual(T1);
    expect(JSON.parse(textOf(files, testFilePath(T2.id)))).toEqual(T2);
  });

  it('leaves out a test that has no questions yet (it stays in the draft)', () => {
    const empty = testOf('c');
    const draft = draftWith([T1, empty]);
    expect(Object.keys(draftToFiles(draft)).sort()).toEqual(['course.json', testFilePath(T1.id)].sort());
    expect(draft.tests).toHaveLength(2);
  });

  it('writes no test file at all when the course has no tests', () => {
    expect(Object.keys(draftToFiles(draftWith([])))).toEqual(['course.json']);
  });

  it('keeps the layout of a picture (align, width, height) and writes none when it is not set', () => {
    const laid: Block = { id: 'blk-aaaaaaaa', type: 'image', src: 'images/1.webp', alt: 'x', align: 'left', width: 40, height: 120 };
    const plain = newImageBlock('images/2.webp', 'y');
    const draft = { ...draftWith([]), content: [laid, plain] };
    const blocks = (JSON.parse(textOf(draftToFiles(draft), 'content.json')) as { blocks: Record<string, unknown>[] }).blocks;
    expect(blocks.map((b) => [b.align, b.width, b.height])).toEqual([
      ['left', 40, 120],
      [undefined, undefined, undefined],
    ]);
    expect(blocks.map((b) => 'align' in b)).toEqual([true, false]);
  });
});

describe('draftFromFiles: legacy test.json and tests/*.json', () => {
  const course = JSON.stringify(CARD);

  it('reads the old test.json first, then the tests folder in file name order', () => {
    const result = draftFromFiles({
      'course.json': course,
      'test.json': JSON.stringify(T2),
      [testFilePath('tst-cccccccc')]: JSON.stringify(testOf('c', question('c'))),
      [testFilePath(T1.id)]: JSON.stringify(T1),
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.tests.map((t) => t.id)).toEqual([T2.id, T1.id, 'tst-cccccccc']);
  });

  it('a draft written by draftToFiles reads back as the same tests', () => {
    const draft = draftWith([T1, T2]);
    const result = draftFromFiles(draftToFiles(draft));
    expect(result.ok && result.value.tests).toEqual([T1, T2]);
  });

  it('a file whose test id differs from its file name is an error', () => {
    const result = draftFromFiles({ 'course.json': course, [testFilePath(T2.id)]: JSON.stringify(T1) });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.some((e) => e.includes('does not match the file name'))).toBe(true);
  });

  it('the same test id in test.json and in the tests folder is a duplicate', () => {
    const result = draftFromFiles({ 'course.json': course, 'test.json': JSON.stringify(T1), [testFilePath(T1.id)]: JSON.stringify(T1) });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toContain(`tests: duplicate id "${T1.id}"`);
  });

  it('a broken test file names the file', () => {
    const result = draftFromFiles({ 'course.json': course, [testFilePath(T1.id)]: '{not json' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toContain(`${testFilePath(T1.id)}: not valid JSON`);
  });

  it('a file in the tests folder that is not named like a test is ignored', () => {
    const result = draftFromFiles({ 'course.json': course, 'tests/notes.json': '{not json' });
    expect(result.ok && result.value.tests).toEqual([]);
  });
});

describe('validateDraft with several tests', () => {
  it('accepts a draft with two good tests', () => {
    expect(validateDraft(draftWith([T1, T2])).ok).toBe(true);
  });

  it('names the test with the problem as tests[i]', () => {
    const bad = testOf('b', question('b', ''));
    const result = validateDraft(draftWith([T1, bad]));
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expect(errors.some((e) => e.startsWith('tests[1]: '))).toBe(true);
    expect(errors.some((e) => e.startsWith('tests[0]'))).toBe(false);
  });

  it('refuses two tests with the same id', () => {
    const result = validateDraft(draftWith([T1, { ...T1 }]));
    expect(!result.ok && result.errors).toContain(`tests: id "${T1.id}" is used by two tests`);
  });

  it('checks the picture of every test against the pictures of the draft', () => {
    const withImage = { ...T2, image: 'images/9.png' };
    const missing = validateDraft(draftWith([T1, withImage]));
    expect(!missing.ok && missing.errors).toContain('tests[1].image: image "images/9.png" is not in the draft');

    const present = { ...draftWith([T1, withImage]), images: [{ path: 'images/9.png', mime: 'image/png', bytes: new Uint8Array([1]) }] };
    expect(validateDraft(present).ok).toBe(true);
  });
});
