/* eslint-disable @typescript-eslint/no-explicit-any -- tests deliberately build broken objects */
import { describe, expect, it } from 'vitest';
import {
  isSafeRelativePath,
  validateBlocks,
  validateCourseCard,
  validateManifest,
  validateTest,
} from './validate';

const HASH = 'a'.repeat(64);

const manifest = () => ({
  schemaVersion: 1,
  generatedAt: '2026-11-18T10:00:00Z',
  courses: [{ id: 'crs-aaaaaaaa', title: 'Science', version: 1, files: { 'courses/crs-aaaaaaaa/course.json': HASH } }],
});

const card = () => ({ id: 'crs-aaaaaaaa', title: 'Science', order: 1 });

const blocks = () => ({
  blocks: [
    { id: 'blk-aaaaaaaa', type: 'title', text: 'Hello' },
    { id: 'blk-bbbbbbbb', type: 'image', src: 'images/a.svg', alt: '' },
  ],
});

const question = (n: string) => ({
  id: `qst-${n.repeat(8)}`,
  text: 'Q?',
  options: ['a', 'b', 'c', 'd'],
  correctIndex: 1,
});

const test = () => ({ id: 'tst-aaaaaaaa', questionsPerGame: 2, questions: [question('a'), question('b')] });

/** Applies a change to a deep copy and returns it. */
function mutate<T>(base: T, change: (copy: any) => void): T {
  const copy = JSON.parse(JSON.stringify(base));
  change(copy);
  return copy;
}

function errorsOf(result: { ok: boolean; errors?: string[] }): string {
  return result.ok ? '' : (result.errors ?? []).join(' | ');
}

describe('isSafeRelativePath', () => {
  it.each(['images/a.webp', 'a.svg', 'x/y/z.png'])('accepts %s', (p) => {
    expect(isSafeRelativePath(p)).toBe(true);
  });
  it.each(['', '/etc/passwd', '../a.png', 'a/../b.png', 'a\\b.png', 'https://x.com/a.png', 'C:/a.png', 'a//b', './a', 'a/', 42, null])(
    'rejects %s',
    (p) => {
      expect(isSafeRelativePath(p)).toBe(false);
    },
  );
});

describe('validateManifest', () => {
  it('accepts a valid manifest and an empty course list', () => {
    expect(validateManifest(manifest()).ok).toBe(true);
    expect(validateManifest(mutate(manifest(), (m) => (m.courses = []))).ok).toBe(true);
  });

  it.each<[string, (m: any) => void, string]>([
    ['wrong schemaVersion', (m) => (m.schemaVersion = 2), 'schemaVersion'],
    ['missing generatedAt', (m) => delete m.generatedAt, 'generatedAt'],
    ['courses not an array', (m) => (m.courses = {}), 'courses: must be an array'],
    ['bad course id prefix', (m) => (m.courses[0].id = 'blk-aaaaaaaa'), 'courses[0].id'],
    ['empty title', (m) => (m.courses[0].title = ' '), 'courses[0].title'],
    ['version 0', (m) => (m.courses[0].version = 0), 'courses[0].version'],
    ['bad hash', (m) => (m.courses[0].files['courses/crs-aaaaaaaa/course.json'] = 'xyz'), 'sha256'],
    ['unsafe file path', (m) => (m.courses[0].files['../secret.json'] = HASH), 'unsafe path'],
    ['duplicate course ids', (m) => m.courses.push({ ...m.courses[0] }), 'duplicate id'],
  ])('rejects: %s', (_name, change, expected) => {
    const result = validateManifest(mutate(manifest(), change));
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain(expected);
  });
});

describe('validateCourseCard', () => {
  it('accepts minimal and full cards', () => {
    expect(validateCourseCard(card()).ok).toBe(true);
    expect(validateCourseCard({ ...card(), description: 'd', cover: 'images/c.webp' }).ok).toBe(true);
  });

  it.each<[string, (c: any) => void, string]>([
    ['missing id', (c) => delete c.id, 'id:'],
    ['missing title', (c) => delete c.title, 'title'],
    ['order not a number', (c) => (c.order = 'one'), 'order'],
    ['description not a string', (c) => (c.description = 5), 'description'],
    ['cover with ..', (c) => (c.cover = '../x.png'), 'cover'],
  ])('rejects: %s', (_name, change, expected) => {
    const result = validateCourseCard(mutate(card(), change));
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain(expected);
  });
});

describe('validateBlocks', () => {
  it('accepts all block types and an empty blocks array', () => {
    expect(validateBlocks(blocks()).ok).toBe(true);
    expect(validateBlocks({ blocks: [] }).ok).toBe(true);
    const all = {
      blocks: ['title', 'subtitle', 'text'].map((t, i) => ({ id: `blk-${String(i).repeat(8)}`, type: t, text: 'x' })),
    };
    expect(validateBlocks(all).ok).toBe(true);
  });

  it.each<[string, (b: any) => void, string]>([
    ['missing id', (b) => delete b.blocks[0].id, 'blocks[0].id'],
    ['wrong id prefix', (b) => (b.blocks[0].id = 'crs-aaaaaaaa'), 'blocks[0].id'],
    ['unknown type', (b) => (b.blocks[0].type = 'video'), 'blocks[0].type'],
    ['text block with empty text', (b) => (b.blocks[0].text = '  '), 'blocks[0].text'],
    ['image without src', (b) => delete b.blocks[1].src, 'blocks[1].src'],
    ['image with unsafe src', (b) => (b.blocks[1].src = '/abs.png'), 'blocks[1].src'],
    ['image without alt', (b) => delete b.blocks[1].alt, 'blocks[1].alt'],
    ['duplicate ids', (b) => (b.blocks[1].id = b.blocks[0].id), 'duplicate id'],
    ['block not an object', (b) => (b.blocks[0] = 'x'), 'blocks[0]'],
  ])('rejects: %s', (_name, change, expected) => {
    const result = validateBlocks(mutate(blocks(), change));
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain(expected);
  });
});

describe('validateTest', () => {
  it('accepts minimal and full tests (optional title, image, explanation)', () => {
    expect(validateTest(test()).ok).toBe(true);
    const full = mutate(test(), (t) => {
      t.title = 'Quiz';
      t.image = 'images/t.webp';
      t.questions[0].explanation = 'Because.';
    });
    const result = validateTest(full);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.questions[0]?.explanation).toBe('Because.');
  });

  it('accepts questionsPerGame larger than the number of questions', () => {
    expect(validateTest(mutate(test(), (t) => (t.questionsPerGame = 50))).ok).toBe(true);
  });

  it.each<[string, (t: any) => void, string]>([
    ['wrong id prefix', (t) => (t.id = 'qst-aaaaaaaa'), 'id:'],
    ['questionsPerGame 0', (t) => (t.questionsPerGame = 0), 'questionsPerGame'],
    ['questionsPerGame 2.5', (t) => (t.questionsPerGame = 2.5), 'questionsPerGame'],
    ['questions not an array', (t) => (t.questions = null), 'questions: must be an array'],
    ['3 options', (t) => t.questions[1].options.pop(), 'questions[1].options'],
    ['5 options', (t) => t.questions[1].options.push('e'), 'questions[1].options'],
    ['empty option', (t) => (t.questions[0].options[2] = ''), 'questions[0].options[2]'],
    ['correctIndex 4', (t) => (t.questions[1].correctIndex = 4), 'questions[1].correctIndex'],
    ['correctIndex -1', (t) => (t.questions[0].correctIndex = -1), 'questions[0].correctIndex'],
    ['correctIndex as string', (t) => (t.questions[0].correctIndex = '1'), 'questions[0].correctIndex'],
    ['empty question text', (t) => (t.questions[0].text = ''), 'questions[0].text'],
    ['explanation not a string', (t) => (t.questions[0].explanation = 1), 'questions[0].explanation'],
    ['duplicate question ids', (t) => (t.questions[1].id = t.questions[0].id), 'duplicate id'],
    ['unsafe image', (t) => (t.image = '../x.png'), 'image'],
  ])('rejects: %s', (_name, change, expected) => {
    const result = validateTest(mutate(test(), change));
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain(expected);
  });
});

describe('every validator never throws on garbage input', () => {
  const garbage: unknown[] = [null, undefined, 'text', 42, true, [], [1, 2], {}, () => 1, { courses: 'x' }, { blocks: 5 }];
  const validators = [validateManifest, validateCourseCard, validateBlocks, validateTest];
  it.each(garbage.map((g, i) => [i, g] as const))('input #%i', (_i, g) => {
    for (const validate of validators) {
      const result = validate(g);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
