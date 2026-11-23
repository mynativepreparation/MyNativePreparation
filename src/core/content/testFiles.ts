import { isId } from './ids';

// Where the tests of ONE course live (P10 T11r, DECISIONS Q27 a). A course used to have a single `test.json`. It can now have
// several tests: one file each, `tests/<tst-id>.json` inside the course folder, with the same shape as `test.json`. The old
// `test.json` is still read (it counts as one test), so old courses stay valid. Pure helpers, no I/O.

/** The old single-test file, relative to the course folder. Still read; the editor no longer writes it. */
export const LEGACY_TEST_FILE = 'test.json';

const TESTS_DIR = 'tests/';
const SUFFIX = '.json';

/** `tests/<tst-id>.json`, relative to the course folder. */
export function testFilePath(testId: string): string {
  return `${TESTS_DIR}${testId}${SUFFIX}`;
}

/** The test id inside a course-relative path such as `tests/tst-abcd1234.json`, or null for any other path. */
export function testIdFromPath(path: string): string | null {
  if (!path.startsWith(TESTS_DIR) || !path.endsWith(SUFFIX)) return null;
  const id = path.slice(TESTS_DIR.length, path.length - SUFFIX.length);
  return isId('tst', id) ? id : null;
}

/**
 * The test files of one course found in a list of manifest `files` keys (paths relative to the content root, like
 * `courses/<crs-id>/tests/<tst-id>.json`). The answer is course-relative and sorted; keys of other courses and every other
 * kind of file are ignored.
 */
export function testFilesOf(courseId: string, manifestKeys: readonly string[]): string[] {
  const prefix = `courses/${courseId}/`;
  const found: string[] = [];
  for (const key of manifestKeys) {
    if (!key.startsWith(prefix)) continue;
    const relative = key.slice(prefix.length);
    if (testIdFromPath(relative) !== null) found.push(relative);
  }
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
