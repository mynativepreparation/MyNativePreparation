// @vitest-environment node
// Loading a published course with several tests (P10 T11r, DECISIONS Q27): the manifest names `tests/<id>.json`, `loadTests` reads them.
import { describe, expect, it, vi } from 'vitest';
import type { LoadedCourse, LoadedTests, ManifestResult } from '../content/loader';
import type { Test } from '../content/types';
import { testFilePath } from '../content/testFiles';
import { loadPublishedDraft, type PublishedDeps } from './loadExisting';
import { validateDraft } from './model';

const ID = 'crs-aaaaaaaa';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

const testOf = (id: string, image?: string): Test => ({
  id: `tst-${id.repeat(8)}`,
  questionsPerGame: 1,
  ...(image === undefined ? {} : { image }),
  questions: [{ id: `qst-${id.repeat(8)}`, text: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 }],
});
const T1 = testOf('a', 'images/a.png');
const T2 = testOf('b', 'images/b.png');

const course = (legacy: Test | null): LoadedCourse => ({
  card: { state: 'ready', value: { id: ID, title: 'Science', order: 1 } },
  overview: { state: 'empty' },
  content: { state: 'empty' },
  test: legacy === null ? { state: 'empty' } : { state: 'ready', value: legacy },
});

const manifestWith = (...fileNames: string[]): ManifestResult =>
  ({
    ok: true,
    manifest: {
      schemaVersion: 1,
      generatedAt: '2026-11-23T00:00:00Z',
      courses: [{ id: ID, title: 'Science', version: 1, files: Object.fromEntries(fileNames.map((n) => [`courses/${ID}/${n}`, 'hash'])) }],
    },
  }) as unknown as ManifestResult;

const unreadable = { ok: false, reason: 'unavailable', errors: [] } as ManifestResult;

type LoadTests = NonNullable<PublishedDeps['loadTests']>;

function makeDeps(loaded: LoadedCourse, manifest: ManifestResult, loadTests?: LoadTests) {
  const fetchBytes = vi.fn((url: string) => Promise.resolve<Uint8Array | null>(url.includes('images/') ? PNG : null));
  const deps: PublishedDeps = {
    loadManifest: () => Promise.resolve(manifest),
    loadCourse: () => Promise.resolve(loaded),
    fetchBytes,
    contentUrl: (path) => `/content/${path}`,
    ...(loadTests === undefined ? {} : { loadTests }),
  };
  return { deps, fetchBytes };
}

const answer = (tests: Test[], errors: string[] = []): Promise<LoadedTests> => Promise.resolve({ tests, errors });

/** A `loadTests` helper that answers with `tests` and remembers how it was called. */
function recorder(tests: Test[]) {
  const calls: [string, readonly string[]][] = [];
  const fn: LoadTests = (courseId, keys) => {
    calls.push([courseId, keys]);
    return answer(tests);
  };
  return { fn, calls };
}

describe('loadPublishedDraft with several tests', () => {
  it('builds a draft with every test and every test picture, and it can be saved again', async () => {
    const { fn } = recorder([T1, T2]);
    const { deps, fetchBytes } = makeDeps(course(null), manifestWith(testFilePath(T1.id), testFilePath(T2.id)), fn);
    const result = await loadPublishedDraft(ID, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.tests.map((t) => t.id)).toEqual([T1.id, T2.id]);
    expect(result.draft.images.map((i) => i.path)).toEqual(['images/a.png', 'images/b.png']);
    expect(fetchBytes.mock.calls.map((c) => c[0]).sort()).toEqual([`/content/courses/${ID}/images/a.png`, `/content/courses/${ID}/images/b.png`]);
    expect(validateDraft(result.draft).ok).toBe(true);
  });

  it('gives the loader the course id and the manifest keys of this course', async () => {
    const { fn, calls } = recorder([T1]);
    const { deps } = makeDeps(course(null), manifestWith('course.json', testFilePath(T1.id)), fn);
    await loadPublishedDraft(ID, deps);
    expect(calls).toEqual([[ID, [`courses/${ID}/course.json`, `courses/${ID}/${testFilePath(T1.id)}`]]]);
  });

  it('the tests from loadTests replace the single test that loadCourse gave', async () => {
    const { fn } = recorder([T2]);
    const { deps } = makeDeps(course(T1), manifestWith(testFilePath(T2.id)), fn);
    const result = await loadPublishedDraft(ID, deps);
    expect(result.ok && result.draft.tests.map((t) => t.id)).toEqual([T2.id]);
  });

  it('a problem in a test file is "invalid"', async () => {
    const { deps } = makeDeps(course(null), manifestWith(testFilePath(T1.id)), () => answer([], ['tests/x.json: broken']));
    expect(await loadPublishedDraft(ID, deps)).toEqual({ ok: false, code: 'invalid' });
  });

  it('an exception from the test loader is "unavailable", never thrown', async () => {
    const { deps } = makeDeps(course(null), manifestWith(testFilePath(T1.id)), () => Promise.reject(new Error('boom')));
    expect(await loadPublishedDraft(ID, deps)).toEqual({ ok: false, code: 'unavailable' });
  });

  it('a missing test picture is reported with its path', async () => {
    const { deps, fetchBytes } = makeDeps(course(null), manifestWith(testFilePath(T1.id)), () => answer([T1]));
    fetchBytes.mockResolvedValue(null);
    expect(await loadPublishedDraft(ID, deps)).toEqual({ ok: false, code: 'image', path: 'images/a.png' });
  });
});

describe('loadPublishedDraft falls back to the single test.json', () => {
  it('when the manifest cannot be read, loadTests is not called and the old test is used', async () => {
    const { fn, calls } = recorder([T2]);
    const { deps } = makeDeps(course(T1), unreadable, fn);
    const result = await loadPublishedDraft(ID, deps);
    expect(calls).toEqual([]);
    expect(result.ok && result.draft.tests.map((t) => t.id)).toEqual([T1.id]);
  });

  it('without a loadTests helper only the old test is used', async () => {
    const { deps } = makeDeps(course(T1), manifestWith(testFilePath(T2.id)));
    const result = await loadPublishedDraft(ID, deps);
    expect(result.ok && result.draft.tests.map((t) => t.id)).toEqual([T1.id]);
  });

  it('a course with no test at all gives a draft with an empty list', async () => {
    const { deps } = makeDeps(course(null), manifestWith('course.json'), () => answer([]));
    const result = await loadPublishedDraft(ID, deps);
    expect(result.ok && result.draft.tests).toEqual([]);
  });
});
