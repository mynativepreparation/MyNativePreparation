// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findCourseTests } from './courseTests';
import type { Test } from './types';

// findCourseTests (P10 T11t d): the tests of one course as the app finds them. The loader is mocked: this file tests the glue
// (which manifest keys are handed over, and that nothing ever throws). The real loading is covered by loader.tests.test.ts.
const { manifestMock, testsMock } = vi.hoisted(() => ({ manifestMock: vi.fn(), testsMock: vi.fn() }));

vi.mock('./loader', () => ({ loadManifest: manifestMock, loadCourseTests: testsMock }));

const COURSE = 'crs-aaaaaaaa';
const OTHER = 'crs-bbbbbbbb';

function testOf(id: string): Test {
  return {
    id,
    questionsPerGame: 1,
    questions: [{ id: 'qst-aaaaaaaa', text: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }],
  };
}

const manifestOf = (courses: { id: string; files: Record<string, string> }[]) => ({ ok: true, manifest: { courses } });

beforeEach(() => {
  manifestMock.mockReset();
  testsMock.mockReset();
  testsMock.mockResolvedValue({ tests: [], errors: [] });
});

describe('findCourseTests', () => {
  it('hands the manifest keys of THIS course to the loader and returns its tests', async () => {
    manifestMock.mockResolvedValue(
      manifestOf([
        { id: COURSE, files: { [`courses/${COURSE}/course.json`]: 'h1', [`courses/${COURSE}/tests/tst-aaaa0001.json`]: 'h2' } },
        { id: OTHER, files: { [`courses/${OTHER}/tests/tst-zzzz0001.json`]: 'h3' } },
      ]),
    );
    testsMock.mockResolvedValue({ tests: [testOf('tst-old00001'), testOf('tst-aaaa0001')], errors: ['a broken file is not our problem here'] });

    const tests = await findCourseTests(COURSE);

    expect(tests.map((test) => test.id)).toEqual(['tst-old00001', 'tst-aaaa0001']);
    expect(testsMock).toHaveBeenCalledTimes(1);
    expect(testsMock).toHaveBeenCalledWith(COURSE, [`courses/${COURSE}/course.json`, `courses/${COURSE}/tests/tst-aaaa0001.json`]);
  });

  it('a course that is not in the manifest still reads the old test.json (no keys)', async () => {
    manifestMock.mockResolvedValue(manifestOf([{ id: OTHER, files: { [`courses/${OTHER}/course.json`]: 'h' } }]));
    testsMock.mockResolvedValue({ tests: [testOf('tst-old00001')], errors: [] });

    const tests = await findCourseTests(COURSE);

    expect(tests.map((test) => test.id)).toEqual(['tst-old00001']);
    expect(testsMock).toHaveBeenCalledWith(COURSE, []);
  });

  it('an unreadable manifest also reads only the old test.json', async () => {
    manifestMock.mockResolvedValue({ ok: false, reason: 'unavailable', errors: ['manifest.json: network error'] });
    testsMock.mockResolvedValue({ tests: [testOf('tst-old00001')], errors: [] });

    const tests = await findCourseTests(COURSE);

    expect(tests.map((test) => test.id)).toEqual(['tst-old00001']);
    expect(testsMock).toHaveBeenCalledWith(COURSE, []);
  });

  it('a course without any test gives an empty list', async () => {
    manifestMock.mockResolvedValue(manifestOf([{ id: COURSE, files: {} }]));

    expect(await findCourseTests(COURSE)).toEqual([]);
  });

  it('never throws: a manifest loader that rejects gives an empty list', async () => {
    manifestMock.mockRejectedValue(new Error('boom'));

    expect(await findCourseTests(COURSE)).toEqual([]);
  });

  it('never throws: a test loader that rejects gives an empty list', async () => {
    manifestMock.mockResolvedValue(manifestOf([{ id: COURSE, files: {} }]));
    testsMock.mockRejectedValue(new Error('boom'));

    expect(await findCourseTests(COURSE)).toEqual([]);
  });
});
