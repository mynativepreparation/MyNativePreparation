// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { testFilePath } from '../content/testFiles';
import {
  createCourseDraft,
  createTest,
  draftFromFiles,
  draftToFiles,
  newImageBlock,
  newQuestion,
  newTextBlock,
  nextImagePath,
  validateDraft,
  type CourseDraft,
  type DraftFiles,
} from './model';

const txt = (v: string | Uint8Array | undefined): string => (typeof v === 'string' ? v : '');

function sampleDraft(): CourseDraft {
  const d = createCourseDraft({ title: 'વિજ્ઞાન: પાણીનું ચક્ર', order: 2 });
  d.course.description = 'ટૂંકું વર્ણન';
  d.overview = [newTextBlock('title', 'વિજ્ઞાન'), newTextBlock('text', 'પાણી વરાળ બને છે.')];
  d.content = [newTextBlock('subtitle', 'પ્રકરણ ૧'), newImageBlock('images/1.svg', 'ચિત્ર')];
  const test = createTest(3);
  test.title = 'ક્વિઝ';
  test.questions = [newQuestion('પ્રશ્ન?', ['એક', 'બે', 'ત્રણ', 'ચાર'], 1, 'સમજૂતી')];
  d.tests = [test];
  d.images = [{ path: 'images/1.svg', mime: 'image/svg+xml', bytes: new TextEncoder().encode('<svg/>') }];
  return d;
}

describe('createCourseDraft', () => {
  it('starts empty with a stable course id and no title error hidden', () => {
    const d = createCourseDraft();
    expect(d.course.id).toMatch(/^crs-[a-z0-9]{8}$/);
    expect(d.overview).toEqual([]);
    expect(d.tests).toEqual([]);
    const r = validateDraft(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain('title');
  });

  it('creates different ids each time', () => {
    expect(createCourseDraft().course.id).not.toBe(createCourseDraft().course.id);
  });
});

describe('draftToFiles', () => {
  it('writes a valid, complete course folder', () => {
    const d = sampleDraft();
    expect(validateDraft(d).ok).toBe(true);
    const files = draftToFiles(d);
    expect(Object.keys(files)).toEqual(['course.json', 'overview.json', 'content.json', ...d.tests.map((t) => testFilePath(t.id)), 'images/1.svg']);
    expect(files['images/1.svg']).toBeInstanceOf(Uint8Array);
    expect(txt(files['course.json'])).toContain('વિજ્ઞાન: પાણીનું ચક્ર');
  });

  it('leaves out empty optional parts', () => {
    const d = createCourseDraft({ title: 'Only a card' });
    expect(Object.keys(draftToFiles(d))).toEqual(['course.json']);
    d.tests = [createTest()];
    expect(Object.keys(draftToFiles(d))).toEqual(['course.json']);
  });

  it('is stable: the same draft gives the same text', () => {
    const d = sampleDraft();
    expect(draftToFiles(d)).toEqual(draftToFiles(d));
  });

  it('keeps the key order of docs/CONTENT-FORMAT.md', () => {
    const files = draftToFiles(sampleDraft());
    const card = Object.keys(JSON.parse(txt(files['course.json'])) as object);
    expect(card).toEqual(['id', 'title', 'description', 'order']);
    const testPath = Object.keys(files).find((k) => k.startsWith('tests/')) ?? '';
    const test = Object.keys(JSON.parse(txt(files[testPath])) as object);
    expect(test).toEqual(['id', 'title', 'questionsPerGame', 'questions']);
  });
});

describe('draftFromFiles', () => {
  it('round-trips a draft (ids unchanged)', () => {
    const d = sampleDraft();
    const back = draftFromFiles(draftToFiles(d));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.value.course).toEqual(d.course);
      expect(back.value.overview).toEqual(d.overview);
      expect(back.value.content).toEqual(d.content);
      expect(back.value.tests).toEqual(d.tests);
      expect(back.value.images.map((i) => i.path)).toEqual(['images/1.svg']);
      expect(validateDraft(back.value).ok).toBe(true);
    }
  });

  it('reads only course.json when the rest is missing', () => {
    const files: DraftFiles = { 'course.json': JSON.stringify({ id: 'crs-abcd1234', title: 'T', order: 1 }) };
    const r = draftFromFiles(files);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.tests).toEqual([]);
  });

  it('reports a missing course.json', () => {
    const r = draftFromFiles({});
    expect(r).toEqual({ ok: false, errors: ['course.json: missing'] });
  });

  it('reports broken JSON and rule errors with the file name', () => {
    const r = draftFromFiles({
      'course.json': '{ not json',
      'overview.json': JSON.stringify({ blocks: [{ id: 'blk-abcd1234', type: 'text', text: '' }] }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain('course.json: not valid JSON');
      expect(r.errors.some((e) => e.startsWith('overview.json: blocks[0].text'))).toBe(true);
    }
  });

  it('rejects an unsupported image type', () => {
    const r = draftFromFiles({
      'course.json': JSON.stringify({ id: 'crs-abcd1234', title: 'T', order: 1 }),
      'images/a.exe': new Uint8Array([1]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain('images/a.exe: not a supported image file');
  });

  it('accepts an svg given as text', () => {
    const r = draftFromFiles({
      'course.json': JSON.stringify({ id: 'crs-abcd1234', title: 'T', order: 1 }),
      'images/a.svg': '<svg/>',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.from(r.value.images[0]?.bytes ?? [])).toEqual(Array.from(new TextEncoder().encode('<svg/>')));
  });
});

describe('validateDraft', () => {
  it('finds a block id used in both overview and content', () => {
    const d = sampleDraft();
    const first = d.overview[0];
    if (first === undefined) throw new Error('sample has no block');
    d.content.push({ ...first });
    const r = validateDraft(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain(first.id);
  });

  it('finds an image that is used but not in the draft', () => {
    const d = sampleDraft();
    d.images = [];
    d.course.cover = 'images/cover.webp';
    const r = validateDraft(d);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain('course.cover: image "images/cover.webp" is not in the draft');
      expect(r.errors).toContain('content.blocks[1]: image "images/1.svg" is not in the draft');
    }
  });

  it('finds a test image that is missing and a test with a bad question', () => {
    const d = sampleDraft();
    if (d.tests.length === 0) throw new Error('sample has no test');
    d.tests = d.tests.map((t) => ({
      ...t,
      image: 'images/t.png',
      questions: [{ ...newQuestion('?', ['a', 'b', 'c', 'd'], 0), text: '' }],
    }));
    const r = validateDraft(d);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain('tests[0].image: image "images/t.png" is not in the draft');
      expect(r.errors.some((e) => e.startsWith('tests[0]: questions[0].text'))).toBe(true);
    }
  });

  it('rejects unsafe or doubled image paths', () => {
    const d = sampleDraft();
    d.images.push({ path: 'images/1.svg', mime: 'image/svg+xml', bytes: new Uint8Array() });
    d.images.push({ path: 'images/../x.png', mime: 'image/png', bytes: new Uint8Array() });
    const r = validateDraft(d);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain('images: "images/1.svg" is stored twice');
      expect(r.errors).toContain('images: unsafe path "images/../x.png"');
    }
  });
});

describe('nextImagePath', () => {
  it('picks the first free number for the type', () => {
    const img = (path: string) => ({ path, mime: 'image/webp', bytes: new Uint8Array() });
    expect(nextImagePath([], 'image/webp')).toBe('images/1.webp');
    expect(nextImagePath([img('images/1.webp'), img('images/2.webp')], 'image/webp')).toBe('images/3.webp');
    expect(nextImagePath([img('images/1.webp')], 'image/png')).toBe('images/1.png');
  });

  it('returns null for an unsupported type', () => {
    expect(nextImagePath([], 'application/pdf')).toBeNull();
  });
});
