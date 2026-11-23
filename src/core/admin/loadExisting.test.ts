import { describe, expect, it, vi } from 'vitest';
import type { LoadedCourse, ManifestResult } from '../content/loader';
import type { Block, Test } from '../content/types';
import { listPublished, loadPublishedDraft, type PublishedDeps } from './loadExisting';
import { validateDraft } from './model';

const ID = 'crs-aaaaaaaa';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

const imageBlock: Block = { id: 'blk-aaaaaaaa', type: 'image', src: 'images/p.png', alt: 'A drawing' };
const textBlock: Block = { id: 'blk-bbbbbbbb', type: 'text', text: 'Hello' };
const test: Test = {
  id: 'tst-aaaaaaaa',
  questionsPerGame: 1,
  image: 'images/t.png',
  questions: [{ id: 'qst-aaaaaaaa', text: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 2 }],
};

const fullCourse = (): LoadedCourse => ({
  card: { state: 'ready', value: { id: ID, title: 'Science', order: 3, cover: 'images/c.png' } },
  overview: { state: 'ready', value: [imageBlock, textBlock] },
  content: { state: 'empty' },
  test: { state: 'ready', value: test },
});

function makeDeps(loaded: LoadedCourse, extra: Partial<PublishedDeps> = {}) {
  const fetchBytes = vi.fn((url: string) => Promise.resolve<Uint8Array | null>(url.includes('images/') ? PNG : null));
  const deps: PublishedDeps = {
    loadManifest: () => Promise.resolve({ ok: false, reason: 'unavailable', errors: [] } as ManifestResult),
    loadCourse: () => Promise.resolve(loaded),
    fetchBytes,
    contentUrl: (path) => `/content/${path}`,
    ...extra,
  };
  return { deps, fetchBytes };
}

describe('loadPublishedDraft', () => {
  it('builds a draft with the card, the blocks, the test and every picture', async () => {
    const { deps, fetchBytes } = makeDeps(fullCourse());
    const result = await loadPublishedDraft(ID, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const d = result.draft;
    expect(d.course).toEqual({ id: ID, title: 'Science', order: 3, cover: 'images/c.png' });
    expect(d.overview).toEqual([imageBlock, textBlock]);
    expect(d.content).toEqual([]);
    expect(d.tests).toEqual([test]);
    expect(d.images.map((i) => [i.path, i.mime])).toEqual([
      ['images/c.png', 'image/png'],
      ['images/p.png', 'image/png'],
      ['images/t.png', 'image/png'],
    ]);
    expect(d.images.map((i) => Array.from(i.bytes))).toEqual([Array.from(PNG), Array.from(PNG), Array.from(PNG)]);
    expect(fetchBytes.mock.calls.map((c) => c[0]).sort()).toEqual([
      `/content/courses/${ID}/images/c.png`,
      `/content/courses/${ID}/images/p.png`,
      `/content/courses/${ID}/images/t.png`,
    ]);
    expect(validateDraft(d).ok).toBe(true); // it can be saved again as it is
  });

  it('keeps the ids of the published course (they never change)', async () => {
    const { deps } = makeDeps(fullCourse());
    const result = await loadPublishedDraft(ID, deps);
    expect(result.ok && result.draft.overview.map((b) => b.id)).toEqual(['blk-aaaaaaaa', 'blk-bbbbbbbb']);
  });

  it('fetches a picture that is used twice only once', async () => {
    const loaded = fullCourse();
    loaded.card = { state: 'ready', value: { id: ID, title: 'Science', order: 1, cover: 'images/p.png' } };
    loaded.test = { state: 'empty' };
    const { deps, fetchBytes } = makeDeps(loaded);
    const result = await loadPublishedDraft(ID, deps);
    expect(result.ok).toBe(true);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });

  it('works for a course with only a card (nothing else published)', async () => {
    const loaded: LoadedCourse = {
      card: { state: 'ready', value: { id: ID, title: 'Empty', order: 2 } },
      overview: { state: 'empty' },
      content: { state: 'empty' },
      test: { state: 'empty' },
    };
    const { deps, fetchBytes } = makeDeps(loaded);
    const result = await loadPublishedDraft(ID, deps);
    expect(result.ok && result.draft).toEqual({
      course: { id: ID, title: 'Empty', order: 2 },
      overview: [],
      content: [],
      tests: [],
      images: [],
    });
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it.each<[string, (l: LoadedCourse) => void, string]>([
    ['a missing course.json', (l) => (l.card = { state: 'empty' }), 'unavailable'],
    ['a broken course.json', (l) => (l.card = { state: 'invalid', errors: ['x'] }), 'invalid'],
    ['a broken overview', (l) => (l.overview = { state: 'invalid', errors: ['x'] }), 'invalid'],
    ['a broken content', (l) => (l.content = { state: 'invalid', errors: ['x'] }), 'invalid'],
    ['a broken test', (l) => (l.test = { state: 'invalid', errors: ['x'] }), 'invalid'],
  ])('answers %s with the code %s', async (_name, change, code) => {
    const loaded = fullCourse();
    change(loaded);
    const { deps } = makeDeps(loaded);
    expect(await loadPublishedDraft(ID, deps)).toEqual({ ok: false, code });
  });

  it('names the picture that could not be fetched', async () => {
    const { deps } = makeDeps(fullCourse(), {
      fetchBytes: (url) => Promise.resolve(url.endsWith('p.png') ? null : PNG),
    });
    expect(await loadPublishedDraft(ID, deps)).toEqual({ ok: false, code: 'image', path: 'images/p.png' });
  });

  it('does not throw when the loader throws', async () => {
    const { deps } = makeDeps(fullCourse(), { loadCourse: () => Promise.reject(new Error('boom')) });
    expect(await loadPublishedDraft(ID, deps)).toEqual({ ok: false, code: 'unavailable' });
  });
});

describe('listPublished', () => {
  it('lists id and title of the manifest courses in order', async () => {
    const manifest: ManifestResult = {
      ok: true,
      manifest: {
        schemaVersion: 1,
        generatedAt: '2026-11-21T00:00:00Z',
        courses: [
          { id: 'crs-aaaaaaaa', title: 'One', version: 1, files: {} },
          { id: 'crs-bbbbbbbb', title: 'Two', version: 2, files: {} },
        ],
      },
    };
    const { deps } = makeDeps(fullCourse(), { loadManifest: () => Promise.resolve(manifest) });
    expect(await listPublished(deps)).toEqual({
      ok: true,
      courses: [
        { id: 'crs-aaaaaaaa', title: 'One' },
        { id: 'crs-bbbbbbbb', title: 'Two' },
      ],
    });
  });

  it('answers ok:false when the manifest is not available or the loader throws', async () => {
    expect(await listPublished(makeDeps(fullCourse()).deps)).toEqual({ ok: false });
    const { deps } = makeDeps(fullCourse(), { loadManifest: () => Promise.reject(new Error('boom')) });
    expect(await listPublished(deps)).toEqual({ ok: false });
  });
});
