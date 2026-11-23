// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LEGACY_TEST_FILE, testFilePath, testFilesOf, testIdFromPath } from './testFiles';

describe('testFilePath / testIdFromPath', () => {
  it('writes the path inside the course folder', () => {
    expect(testFilePath('tst-abcd1234')).toBe('tests/tst-abcd1234.json');
  });

  it('keeps the old single-test file name', () => {
    expect(LEGACY_TEST_FILE).toBe('test.json');
  });

  it('reads the id back from a test path', () => {
    expect(testIdFromPath('tests/tst-abcd1234.json')).toBe('tst-abcd1234');
    expect(testIdFromPath(testFilePath('tst-zz990011'))).toBe('tst-zz990011');
  });

  it('refuses every other path', () => {
    const others = [
      'test.json',
      'tests/abc.json',
      'tests/tst-abcd123.json',
      'tests/tst-abcd12345.json',
      'tests/TST-ABCD1234.json',
      'tests/tst-abcd1234.txt',
      'tests/tst-abcd1234',
      'tests/sub/tst-abcd1234.json',
      'images/tst-abcd1234.json',
      'tests/crs-abcd1234.json',
      '',
    ];
    expect(others.map((p) => testIdFromPath(p))).toEqual(others.map(() => null));
  });
});

describe('testFilesOf', () => {
  const course = 'crs-aaaaaaaa';

  it('picks the test files of this course out of the manifest keys, sorted, relative to the course folder', () => {
    const keys = [
      `courses/${course}/course.json`,
      `courses/${course}/tests/tst-bbbbbbbb.json`,
      `courses/${course}/test.json`,
      `courses/${course}/images/a.svg`,
      `courses/${course}/tests/tst-aaaaaaaa.json`,
      'courses/crs-zzzzzzzz/tests/tst-cccccccc.json',
    ];
    expect(testFilesOf(course, keys)).toEqual(['tests/tst-aaaaaaaa.json', 'tests/tst-bbbbbbbb.json']);
  });

  it('ignores badly named files and answers an empty list when there are none', () => {
    expect(testFilesOf(course, [`courses/${course}/tests/readme.json`, `courses/${course}/tests/tst-aaaaaaaa.json.bak`])).toEqual([]);
    expect(testFilesOf(course, [])).toEqual([]);
  });

  it('does not mix up two courses whose ids start the same way', () => {
    expect(testFilesOf('crs-aaaaaaaa', ['courses/crs-aaaaaaaab/tests/tst-aaaaaaaa.json'])).toEqual([]);
  });
});
