// @vitest-environment node
// Loader tests use a mocked `fetch` (real Response objects); no network and no files are touched.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentUrl, loadCourse, loadManifest } from './loader';

type Route = (() => Response) | 'network-error';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Replaces global fetch. `routes` maps a path under the content root to a response; anything else is a 404. */
function stubFetch(routes: Record<string, Route>) {
  const root = contentUrl('');
  const fn = vi.fn((input: string) => {
    const path = input.startsWith(root) ? input.slice(root.length) : input;
    const route = routes[path];
    if (route === 'network-error') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(route ? route() : new Response('Not found', { status: 404 }));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const COURSE = 'crs-test0001';
const dir = `courses/${COURSE}`;

const manifest = {
  schemaVersion: 1,
  generatedAt: '2026-11-18T00:00:00.000Z',
  courses: [{ id: COURSE, title: 'Test course', version: 1, files: {} }],
};
const card = { id: COURSE, title: 'Test course', order: 1 };
const blockFile = { blocks: [{ id: 'blk-aaaa0001', type: 'text', text: 'Hello' }] };
const testFile = {
  id: 'tst-test0001',
  questionsPerGame: 1,
  questions: [
    { id: 'qst-aaaa0001', text: 'Question?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 },
  ],
};

describe('loadManifest', () => {
  it('returns the manifest when the file is valid, fetched from the content root', async () => {
    const fetchMock = stubFetch({ 'manifest.json': () => json(manifest) });
    const result = await loadManifest();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.courses).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(contentUrl('manifest.json'));
  });

  it('returns an "unavailable" error result when the manifest is missing (404)', async () => {
    stubFetch({});
    const result = await loadManifest();
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('returns an "unavailable" error result on a network failure', async () => {
    stubFetch({ 'manifest.json': 'network-error' });
    expect(await loadManifest()).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('returns an "invalid" error result for bad JSON', async () => {
    stubFetch({
      'manifest.json': () =>
        new Response('{ nope', { status: 200, headers: { 'content-type': 'application/json' } }),
    });
    expect(await loadManifest()).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('returns an "invalid" error result with readable errors when validation fails', async () => {
    stubFetch({ 'manifest.json': () => json({ ...manifest, schemaVersion: 2 }) });
    const result = await loadManifest();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
      expect(result.errors.join('\n')).toContain('schemaVersion');
    }
  });
});

describe('loadCourse', () => {
  it('returns every section as ready when all files are valid', async () => {
    stubFetch({
      [`${dir}/course.json`]: () => json(card),
      [`${dir}/overview.json`]: () => json(blockFile),
      [`${dir}/content.json`]: () => json(blockFile),
      [`${dir}/test.json`]: () => json(testFile),
    });
    const result = await loadCourse(COURSE);
    expect(result.card).toEqual({ state: 'ready', value: card });
    expect(result.overview).toEqual({ state: 'ready', value: blockFile.blocks });
    expect(result.content).toEqual({ state: 'ready', value: blockFile.blocks });
    expect(result.test.state).toBe('ready');
    if (result.test.state === 'ready') expect(result.test.value.questions).toHaveLength(1);
  });

  it('treats missing optional files (404) as empty, and keeps the card ready', async () => {
    stubFetch({ [`${dir}/course.json`]: () => json(card) });
    const result = await loadCourse(COURSE);
    expect(result.card.state).toBe('ready');
    expect(result.overview).toEqual({ state: 'empty' });
    expect(result.content).toEqual({ state: 'empty' });
    expect(result.test).toEqual({ state: 'empty' });
  });

  it('treats a network failure on an optional section as empty', async () => {
    stubFetch({
      [`${dir}/course.json`]: () => json(card),
      [`${dir}/overview.json`]: 'network-error',
    });
    expect((await loadCourse(COURSE)).overview).toEqual({ state: 'empty' });
  });

  it('treats a web page answered with status 200 (dev server fallback) as empty', async () => {
    stubFetch({
      [`${dir}/course.json`]: () => json(card),
      [`${dir}/overview.json`]: () =>
        new Response('<!doctype html><title>app</title>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });
    expect((await loadCourse(COURSE)).overview).toEqual({ state: 'empty' });
  });

  it('treats an empty blocks array and a test without questions as empty', async () => {
    stubFetch({
      [`${dir}/course.json`]: () => json(card),
      [`${dir}/overview.json`]: () => json({ blocks: [] }),
      [`${dir}/test.json`]: () => json({ ...testFile, questions: [] }),
    });
    const result = await loadCourse(COURSE);
    expect(result.overview).toEqual({ state: 'empty' });
    expect(result.test).toEqual({ state: 'empty' });
  });

  it('marks bad JSON as invalid and does not touch the other sections', async () => {
    stubFetch({
      [`${dir}/course.json`]: () => json(card),
      [`${dir}/overview.json`]: () =>
        new Response('{ nope', { status: 200, headers: { 'content-type': 'application/json' } }),
      [`${dir}/content.json`]: () => json(blockFile),
    });
    const result = await loadCourse(COURSE);
    expect(result.overview.state).toBe('invalid');
    if (result.overview.state === 'invalid') expect(result.overview.errors.length).toBeGreaterThan(0);
    expect(result.content.state).toBe('ready');
  });

  it('marks a file that fails validation as invalid, with a path-based error', async () => {
    const broken = { ...testFile, questions: [{ ...testFile.questions[0], correctIndex: 4 }] };
    stubFetch({
      [`${dir}/course.json`]: () => json(card),
      [`${dir}/test.json`]: () => json(broken),
    });
    const result = await loadCourse(COURSE);
    expect(result.test.state).toBe('invalid');
    if (result.test.state === 'invalid') {
      const text = result.test.errors.join('\n');
      expect(text).toContain('test.json');
      expect(text).toContain('questions[0].correctIndex');
    }
  });

  it('reports a missing course.json as an empty card', async () => {
    stubFetch({});
    const result = await loadCourse(COURSE);
    expect(result.card).toEqual({ state: 'empty' });
  });

  it('never fetches and reports an invalid card for a bad course id', async () => {
    const fetchMock = stubFetch({});
    const result = await loadCourse('../secret');
    expect(result.card.state).toBe('invalid');
    expect(result.overview).toEqual({ state: 'empty' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not throw when every request fails', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    const result = await loadCourse(COURSE);
    expect(result).toEqual({
      card: { state: 'empty' },
      overview: { state: 'empty' },
      content: { state: 'empty' },
      test: { state: 'empty' },
    });
  });
});
