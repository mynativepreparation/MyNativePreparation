// P08 T7b: collects the raw report data from INJECTED sources (fakes here; the real ones are wired in T7c).
import { describe, expect, it } from 'vitest';
import type { ManifestResult } from '../../core/content/loader';
import type { ManifestCourse } from '../../core/content/types';
import type { Profile } from '../../core/storage/repo';
import { loadReportInput, ManifestUnavailableError, type ReportSources } from './loadReportInput';
import { buildReportModel, type ReportAttempt } from './reportData';

const A = 'crs-aaaaaaaa';
const B = 'crs-bbbbbbbb';
const C = 'crs-cccccccc';

const course = (id: string, title: string): ManifestCourse => ({ id, title, version: 1, files: {} });

const manifestOf = (...courses: ManifestCourse[]): ManifestResult => ({
  ok: true,
  manifest: { schemaVersion: 1, generatedAt: '2026-11-21T00:00:00Z', courses },
});

const THREE = manifestOf(course(A, 'Maths'), course(B, 'ગણિત'), course(C, 'Science'));

const attempt = (asked: number, correct: number, at: number): ReportAttempt => ({ asked, correct, at });

interface Fakes {
  manifest?: ManifestResult;
  attempts?: Record<string, ReportAttempt[]>;
  opened?: string[];
  profile?: Profile;
}

function makeSources(fakes: Fakes = {}) {
  const calls = { attempts: [] as string[], opened: 0, profile: 0 };
  const sources: ReportSources = {
    loadManifest: () => Promise.resolve(fakes.manifest ?? THREE),
    listAttempts: (courseId) => {
      calls.attempts.push(courseId);
      return Promise.resolve(fakes.attempts?.[courseId] ?? []);
    },
    getOpenedCourseIds: () => {
      calls.opened += 1;
      return Promise.resolve(fakes.opened ?? []);
    },
    getProfile: () => {
      calls.profile += 1;
      return Promise.resolve(fakes.profile);
    },
  };
  return { sources, calls };
}

describe('loadReportInput, scope "all"', () => {
  it('lists every course of the manifest, the current one first, the others in manifest order', async () => {
    const { sources, calls } = makeSources();
    const input = await loadReportInput('all', B, sources);
    expect(input?.courses.map((c) => c.id)).toEqual([B, A, C]);
    expect(input?.currentCourseId).toBe(B);
    expect(calls.attempts).toEqual([B, A, C]);
  });

  it('keeps the manifest order when the current course is not in the manifest', async () => {
    const { sources } = makeSources();
    const input = await loadReportInput('all', 'crs-zzzzzzzz', sources);
    expect(input?.courses.map((c) => c.id)).toEqual([A, B, C]);
  });

  it('returns an empty course list for an empty manifest (the screen shows the empty state)', async () => {
    const { sources } = makeSources({ manifest: manifestOf() });
    const input = await loadReportInput('all', A, sources);
    expect(input?.courses).toEqual([]);
  });

  it('takes titles, opened flags and attempts per course and passes Gujarati titles through unchanged', async () => {
    const { sources } = makeSources({
      opened: [C, B],
      attempts: { [A]: [attempt(10, 7, 100), attempt(10, 9, 200)], [C]: [attempt(5, 5, 300)] },
    });
    const input = await loadReportInput('all', A, sources);
    expect(input?.courses).toEqual([
      { id: A, title: 'Maths', opened: false, attempts: [attempt(10, 7, 100), attempt(10, 9, 200)] },
      { id: B, title: 'ગણિત', opened: true, attempts: [] },
      { id: C, title: 'Science', opened: true, attempts: [attempt(5, 5, 300)] },
    ]);
  });
});

describe('loadReportInput, scope "course"', () => {
  it('returns only that course and asks for the attempts of that course only', async () => {
    const { sources, calls } = makeSources({ opened: [B], attempts: { [B]: [attempt(4, 3, 50)] } });
    const input = await loadReportInput('course', B, sources);
    expect(input?.courses).toEqual([{ id: B, title: 'ગણિત', opened: true, attempts: [attempt(4, 3, 50)] }]);
    expect(input?.currentCourseId).toBe(B);
    expect(calls.attempts).toEqual([B]);
  });

  it('returns null for a course that is not in the manifest and reads no personal data', async () => {
    const { sources, calls } = makeSources();
    expect(await loadReportInput('course', 'crs-zzzzzzzz', sources)).toBeNull();
    expect(calls).toEqual({ attempts: [], opened: 0, profile: 0 });
  });
});

describe('loadReportInput, profile', () => {
  const profile: Profile = { name: 'આશા', email: 'asha@example.com', phone: '9876543210' };

  it('copies only the name, never email or phone', async () => {
    const { sources } = makeSources({ profile });
    const input = await loadReportInput('all', A, sources);
    expect(input?.profile).toEqual({ name: 'આશા' });
    const text = JSON.stringify(input);
    expect(text).not.toContain('asha@example.com');
    expect(text).not.toContain('9876543210');
  });

  it('leaves the profile out when there is none or it has no name', async () => {
    const none = await loadReportInput('all', A, makeSources().sources);
    expect(none && 'profile' in none).toBe(false);
    const noName = await loadReportInput('all', A, makeSources({ profile: { email: 'a@b.c' } }).sources);
    expect(noName && 'profile' in noName).toBe(false);
  });
});

describe('loadReportInput, failures are not swallowed', () => {
  it('rejects with ManifestUnavailableError when the manifest is missing', async () => {
    const { sources } = makeSources({
      manifest: { ok: false, reason: 'unavailable', errors: ['manifest.json: network error'] },
    });
    const error: unknown = await loadReportInput('all', A, sources).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ManifestUnavailableError);
    expect((error as ManifestUnavailableError).reason).toBe('unavailable');
    expect((error as ManifestUnavailableError).details).toEqual(['manifest.json: network error']);
  });

  it('rejects with ManifestUnavailableError when the manifest is invalid', async () => {
    const { sources } = makeSources({ manifest: { ok: false, reason: 'invalid', errors: ['bad'] } });
    await expect(loadReportInput('course', A, sources)).rejects.toBeInstanceOf(ManifestUnavailableError);
  });

  it('rejects with the same error when listAttempts fails', async () => {
    const failure = new Error('attempts unreadable');
    const { sources } = makeSources();
    const broken: ReportSources = { ...sources, listAttempts: () => Promise.reject(failure) };
    await expect(loadReportInput('all', A, broken)).rejects.toBe(failure);
  });

  it('rejects with the same error when getOpenedCourseIds fails (for example while locked)', async () => {
    const failure = new Error('locked');
    const { sources } = makeSources();
    const broken: ReportSources = { ...sources, getOpenedCourseIds: () => Promise.reject(failure) };
    await expect(loadReportInput('course', A, broken)).rejects.toBe(failure);
  });

  it('rejects with the same error when getProfile fails', async () => {
    const failure = new Error('profile unreadable');
    const { sources } = makeSources();
    const broken: ReportSources = { ...sources, getProfile: () => Promise.reject(failure) };
    await expect(loadReportInput('all', A, broken)).rejects.toBe(failure);
  });
});

describe('loadReportInput with buildReportModel', () => {
  it('gives a model with only the courses that have activity, the current one first, and the name', async () => {
    const { sources } = makeSources({
      opened: [A],
      attempts: { [C]: [attempt(10, 8, 1000)] },
      profile: { name: 'આશા' },
    });
    const input = await loadReportInput('all', A, sources);
    expect(input).not.toBeNull();
    if (input === null) return;
    const model = buildReportModel(input);
    expect(model.userName).toBe('આશા');
    expect(model.courses.map((c) => c.id)).toEqual([A, C]);
  });
});
