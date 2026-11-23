import { loadCourseTests, loadManifest } from './loader';
import type { Test } from './types';

// The tests of ONE course as the app finds them (P10 T11t d, DECISIONS Q27 b): the old single `test.json` plus every
// `tests/<tst-id>.json` that manifest.json lists for the course. A browser cannot list a folder, so the manifest keys of the course
// are handed to `loadCourseTests`. Without a readable manifest only the old `test.json` is found, so old courses keep working.

/** Every valid test of the course that has questions (the old `test.json` first). Never throws: any problem gives an empty list. */
export async function findCourseTests(courseId: string): Promise<Test[]> {
  try {
    const manifest = await loadManifest();
    const course = manifest.ok ? manifest.manifest.courses.find((item) => item.id === courseId) : undefined;
    const keys = course === undefined ? [] : Object.keys(course.files);
    const loaded = await loadCourseTests(courseId, keys);
    return loaded.tests;
  } catch {
    return [];
  }
}
