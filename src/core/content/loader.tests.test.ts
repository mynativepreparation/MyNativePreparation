// @vitest-environment node
// loadCourseTests (P10 T11r): several tests per course. Uses a mocked `fetch` with real Response objects, like loader.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentUrl, loadCourseTests } from './loader';

type Route = (() => Response) | 'network-error';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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

function testOf(id: string, question: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    questionsPerGame: 1,
    questions: [{ id: 'qst-aaaa0001', text: question, options: ['a', 'b', 'c', 'd'], correctIndex: 1 }],
    ...extra,
  };
}

const keys = (...names: string[]) => names.map((n) => `${dir}/${n}`);

describe('loadCourseTests', () => {
  it('reads the old single test.json as a list of one', async () => {
    stubFetch({ [`${dir}/test.json`]: () => json(testOf('tst-old00001', 'Old?')) });
    const result = await loadCourseTests(COURSE, []);
    expect(result.errors).toEqual([]);
    expect(result.tests.map((t) => t.id)).toEqual(['tst-old00001']);
  });

  it('reads the tests named by the manifest keys: the old file first, then the others in path order', async () => {
    stubFetch({
      [`${dir}/test.json`]: () => json(testOf('tst-old00001', 'Old?')),
      [`${dir}/tests/tst-bbbb0002.json`]: () => json(testOf('tst-bbbb0002', 'Second?')),
      [`${dir}/tests/tst-aaaa0001.json`]: () => json(testOf('tst-aaaa0001', 'પ્રશ્ન એક?')),
    });
    const result = await loadCourseTests(COURSE, keys('tests/tst-bbbb0002.json', 'course.json', 'tests/tst-aaaa0001.json'));
    expect(result.errors).toEqual([]);
    expect(result.tests.map((t) => t.id)).toEqual(['tst-old00001', 'tst-aaaa0001', 'tst-bbbb0002']);
    expect(result.tests.map((t) => t.questions.map((q) => q.text))).toEqual([['Old?'], ['પ્રશ્ન એક?'], ['Second?']]);
  });

  it('works with no old file at all (a course that only has tests/)', async () => {
    stubFetch({ [`${dir}/tests/tst-aaaa0001.json`]: () => json(testOf('tst-aaaa0001', 'One?')) });
    const result = await loadCourseTests(COURSE, keys('tests/tst-aaaa0001.json'));
    expect(result.tests.map((t) => t.id)).toEqual(['tst-aaaa0001']);
    expect(result.errors).toEqual([]);
  });

  it('skips a missing file and a test with no questions without an error', async () => {
    stubFetch({
      [`${dir}/tests/tst-aaaa0001.json`]: () => json(testOf('tst-aaaa0001', 'x', { questions: [] })),
    });
    const result = await loadCourseTests(COURSE, keys('tests/tst-aaaa0001.json', 'tests/tst-bbbb0002.json'));
    expect(result).toEqual({ tests: [], errors: [] });
  });

  it('reports a broken file with its path and still returns the good tests', async () => {
    stubFetch({
      [`${dir}/tests/tst-aaaa0001.json`]: () => json({ id: 'tst-aaaa0001', questionsPerGame: 0, questions: [] }),
      [`${dir}/tests/tst-bbbb0002.json`]: () => new Response('{ not json', { status: 200, headers: { 'content-type': 'application/json' } }),
      [`${dir}/tests/tst-cccc0003.json`]: () => json(testOf('tst-cccc0003', 'Fine?')),
    });
    const result = await loadCourseTests(COURSE, keys('tests/tst-aaaa0001.json', 'tests/tst-bbbb0002.json', 'tests/tst-cccc0003.json'));
    expect(result.tests.map((t) => t.id)).toEqual(['tst-cccc0003']);
    expect(result.errors.some((e) => e.startsWith(`${dir}/tests/tst-aaaa0001.json: questionsPerGame`))).toBe(true);
    expect(result.errors).toContain(`${dir}/tests/tst-bbbb0002.json: not valid JSON`);
  });

  it('refuses a file whose test id does not match its name', async () => {
    stubFetch({ [`${dir}/tests/tst-aaaa0001.json`]: () => json(testOf('tst-other001', 'x')) });
    const result = await loadCourseTests(COURSE, keys('tests/tst-aaaa0001.json'));
    expect(result.tests).toEqual([]);
    expect(result.errors).toEqual([`${dir}/tests/tst-aaaa0001.json: id "tst-other001" does not match the file name`]);
  });

  it('keeps only the first of two tests that share an id (the old file and a new one)', async () => {
    stubFetch({
      [`${dir}/test.json`]: () => json(testOf('tst-aaaa0001', 'Old?')),
      [`${dir}/tests/tst-aaaa0001.json`]: () => json(testOf('tst-aaaa0001', 'New?')),
    });
    const result = await loadCourseTests(COURSE, keys('tests/tst-aaaa0001.json'));
    expect(result.tests.map((t) => t.questions.map((q) => q.text))).toEqual([['Old?']]);
    expect(result.errors).toEqual([`${dir}/tests/tst-aaaa0001.json: id "tst-aaaa0001" is already used by another test of this course`]);
  });

  it('asks only for the old file and for test paths of THIS course', async () => {
    const fetchMock = stubFetch({});
    await loadCourseTests(COURSE, [
      ...keys('tests/tst-aaaa0001.json', 'overview.json', 'tests/notes.json'),
      'courses/crs-other002/tests/tst-bbbb0002.json',
    ]);
    const asked = fetchMock.mock.calls.map((c) => c[0]).sort();
    expect(asked).toEqual([contentUrl(`${dir}/test.json`), contentUrl(`${dir}/tests/tst-aaaa0001.json`)].sort());
  });

  it('answers with an error for a bad course id, without fetching', async () => {
    const fetchMock = stubFetch({});
    const result = await loadCourseTests('../etc', []);
    expect(result.tests).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never rejects when the network is down', async () => {
    stubFetch({
      [`${dir}/test.json`]: 'network-error',
      [`${dir}/tests/tst-aaaa0001.json`]: 'network-error',
    });
    await expect(loadCourseTests(COURSE, keys('tests/tst-aaaa0001.json'))).resolves.toEqual({ tests: [], errors: [] });
  });
});
