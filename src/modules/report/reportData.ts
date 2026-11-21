import { percentOf, starsForPercent } from '../../core/content/scoring';

// Report model (P08 T4, SPEC C6). Pure functions: no React, no PDF, no storage.
// The screen (T7) collects the raw data (courses from the manifest, `listAttempts`, `getOpenedCourseIds`, the profile) and
// hands it to `buildReportModel`; the layout (T5) draws the result. Rules:
// - percent and stars come ONLY from `core/content/scoring.ts` (recomputed from asked/correct, never taken from a stored field);
// - "opened" means the Overview or the Content was opened at least once (not "finished");
// - titles and the user's name are passed through unchanged (they may be Gujarati);
// - email and phone never enter the model: the profile input only looks at `name`.

/** 0 = no test taken yet; 1..5 = stars of the best result (DECISIONS Q6). */
export type StarCount = 0 | 1 | 2 | 3 | 4 | 5;

/** One finished game, as far as the report needs it. `Attempt` from `core/storage/repo` fits this shape. */
export interface ReportAttempt {
  /** Only used to order two attempts made at the same millisecond. */
  id?: number;
  asked: number;
  correct: number;
  /** Milliseconds since 1970. */
  at: number;
}

export interface ReportCourseInput {
  id: string;
  title: string;
  /** True when the Overview or the Content was opened at least once. */
  opened: boolean;
  attempts: readonly ReportAttempt[];
}

/** Only the name is read; a full `Profile` can be passed, its email and phone are ignored. */
export interface ReportProfileInput {
  name?: string;
}

export interface BuildReportInput {
  courses: readonly ReportCourseInput[];
  profile?: ReportProfileInput;
  /** Listed first when it has activity. */
  currentCourseId?: string;
}

export interface CourseReport {
  id: string;
  title: string;
  opened: boolean;
  testsTaken: number;
  /** `null` when no test was taken. */
  bestPercent: number | null;
  /** Percent of the newest attempt; `null` when no test was taken. */
  lastPercent: number | null;
  stars: StarCount;
}

export interface ReportTotals {
  coursesOpened: number;
  testsTaken: number;
  /** Sum of the course stars. */
  stars: number;
}

export interface ReportModel {
  /** Present only when the user entered a name. */
  userName?: string;
  totals: ReportTotals;
  /** Only courses with activity (opened or at least one test); empty when there is none. */
  courses: CourseReport[];
}

/** True when there is nothing to report (nothing opened, no test taken). */
export function isReportEmpty(model: ReportModel): boolean {
  return model.courses.length === 0;
}

function isNewer(candidate: ReportAttempt, current: ReportAttempt): boolean {
  if (candidate.at !== current.at) return candidate.at > current.at;
  // Same millisecond: the higher id wins; on a full tie the later one in the list wins.
  return (candidate.id ?? 0) >= (current.id ?? 0);
}

function toCourseReport(course: ReportCourseInput): CourseReport {
  const { id, title, opened, attempts } = course;
  if (attempts.length === 0) {
    return { id, title, opened, testsTaken: 0, bestPercent: null, lastPercent: null, stars: 0 };
  }
  const bestPercent = attempts.reduce((best, a) => Math.max(best, percentOf(a.correct, a.asked)), 0);
  const newest = attempts.reduce((current, a) => (isNewer(a, current) ? a : current));
  return {
    id,
    title,
    opened,
    testsTaken: attempts.length,
    bestPercent,
    lastPercent: percentOf(newest.correct, newest.asked),
    stars: starsForPercent(bestPercent),
  };
}

/** Builds the report model. Does not change its input. */
export function buildReportModel(input: BuildReportInput): ReportModel {
  const { courses, profile, currentCourseId } = input;

  const entries = courses
    .filter((course) => course.opened || course.attempts.length > 0)
    .map(toCourseReport)
    .sort((a, b) => {
      const rankA = a.id === currentCourseId ? 0 : 1;
      const rankB = b.id === currentCourseId ? 0 : 1;
      return rankA - rankB || a.title.localeCompare(b.title, 'gu') || a.id.localeCompare(b.id);
    });

  const totals: ReportTotals = {
    coursesOpened: entries.filter((entry) => entry.opened).length,
    testsTaken: entries.reduce((sum, entry) => sum + entry.testsTaken, 0),
    stars: entries.reduce((sum, entry) => sum + entry.stars, 0),
  };

  const model: ReportModel = { totals, courses: entries };
  const name = profile?.name?.trim();
  if (name) model.userName = name;
  return model;
}
