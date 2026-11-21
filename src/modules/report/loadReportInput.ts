import type { ManifestResult } from '../../core/content/loader';
import type { ManifestCourse } from '../../core/content/types';
import type { Profile } from '../../core/storage/repo';
import type { BuildReportInput, ReportAttempt, ReportCourseInput } from './reportData';

// Collects the raw data for the report (P08 T7b, SPEC C6) and returns the argument of `buildReportModel`.
// No React, no PDF, no direct storage access: the four data functions arrive in `sources` (INJECTED). The screen (T7c)
// passes the real ones (`loadManifest`, `listAttempts`, `getOpenedCourseIds`, `getProfile`); tests pass fakes.
// Rules:
// - scope 'course' = only that course; scope 'all' = every course of the manifest, the current one first, then manifest order;
// - `opened` comes from `getOpenedCourseIds()`, `attempts` from `listAttempts(courseId)` (only for the chosen courses);
// - from the profile ONLY the name is copied (never email or phone);
// - nothing is swallowed: a failing source rejects (`LockedError` and `DecryptError` pass through unchanged), and a manifest
//   that cannot be loaded rejects with `ManifestUnavailableError`;
// - DECISION: in scope 'course' a course id that is not in the manifest gives `null` (the screen shows `NotAvailable`).
//   In that case no personal data is read at all. In scope 'all' an unknown current id is simply not listed first.

export type ReportScope = 'all' | 'course';

/** The four data functions the report needs. `loadManifest`, `listAttempts`, `getOpenedCourseIds`, `getProfile` fit as they are. */
export interface ReportSources {
  loadManifest: () => Promise<ManifestResult>;
  listAttempts: (courseId: string) => Promise<readonly ReportAttempt[]>;
  getOpenedCourseIds: () => Promise<readonly string[]>;
  getProfile: () => Promise<Profile | undefined>;
}

/** Thrown when `manifest.json` is missing or invalid (`loadManifest` itself returns a result instead of throwing). */
export class ManifestUnavailableError extends Error {
  readonly reason: 'unavailable' | 'invalid';
  readonly details: readonly string[];

  constructor(reason: 'unavailable' | 'invalid', details: readonly string[]) {
    super(`The course list is not available (${reason}): ${details.join('; ')}`);
    this.name = 'ManifestUnavailableError';
    this.reason = reason;
    this.details = details;
  }
}

/** The courses to report on, current one first; `null` when scope is 'course' and the course is not in the manifest. */
function pickCourses(
  scope: ReportScope,
  courseId: string,
  all: readonly ManifestCourse[],
): ManifestCourse[] | null {
  const current = all.find((course) => course.id === courseId);
  if (scope === 'course') return current ? [current] : null;
  return current ? [current, ...all.filter((course) => course !== current)] : [...all];
}

/**
 * Loads everything `buildReportModel` needs. Resolves with `null` only for scope 'course' with an unknown course id;
 * every failing source rejects.
 */
export async function loadReportInput(
  scope: ReportScope,
  courseId: string,
  sources: ReportSources,
): Promise<BuildReportInput | null> {
  const manifest = await sources.loadManifest();
  if (!manifest.ok) throw new ManifestUnavailableError(manifest.reason, manifest.errors);

  const chosen = pickCourses(scope, courseId, manifest.manifest.courses);
  if (chosen === null) return null;

  const [openedIds, profile, withAttempts] = await Promise.all([
    sources.getOpenedCourseIds(),
    sources.getProfile(),
    Promise.all(chosen.map(async (course) => ({ course, attempts: await sources.listAttempts(course.id) }))),
  ]);

  const opened = new Set(openedIds);
  const courses: ReportCourseInput[] = withAttempts.map(({ course, attempts }) => ({
    id: course.id,
    title: course.title,
    opened: opened.has(course.id),
    attempts,
  }));

  const input: BuildReportInput = { courses, currentCourseId: courseId };
  if (typeof profile?.name === 'string') input.profile = { name: profile.name };
  return input;
}
