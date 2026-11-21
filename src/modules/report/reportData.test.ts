import { describe, expect, it } from 'vitest';
import { percentOf, starsForPercent } from '../../core/content/scoring';
import {
  buildReportModel,
  isReportEmpty,
  type ReportAttempt,
  type ReportCourseInput,
} from './reportData';

// Pure tests: no storage, no React, no PDF. Course ids only need to be unique strings here.
const att = (correct: number, asked: number, at: number, id?: number): ReportAttempt =>
  id === undefined ? { correct, asked, at } : { correct, asked, at, id };

const course = (id: string, title: string, opened: boolean, attempts: ReportAttempt[] = []): ReportCourseInput => ({
  id,
  title,
  opened,
  attempts,
});

describe('buildReportModel: empty', () => {
  it('no courses -> empty model', () => {
    const model = buildReportModel({ courses: [] });
    expect(model).toEqual({ totals: { coursesOpened: 0, testsTaken: 0, stars: 0 }, courses: [] });
    expect(isReportEmpty(model)).toBe(true);
  });

  it('courses without activity are left out', () => {
    const model = buildReportModel({
      courses: [course('crs-aaaaaaaa', 'Algebra', false), course('crs-bbbbbbbb', 'Biology', false)],
    });
    expect(model.courses).toEqual([]);
    expect(isReportEmpty(model)).toBe(true);
  });
});

describe('buildReportModel: one course', () => {
  it('opened but no test: no percent, no stars', () => {
    const model = buildReportModel({ courses: [course('crs-aaaaaaaa', 'Algebra', true)] });
    expect(model.courses).toEqual([
      {
        id: 'crs-aaaaaaaa',
        title: 'Algebra',
        opened: true,
        testsTaken: 0,
        bestPercent: null,
        lastPercent: null,
        stars: 0,
      },
    ]);
    expect(model.totals).toEqual({ coursesOpened: 1, testsTaken: 0, stars: 0 });
    expect(isReportEmpty(model)).toBe(false);
  });

  it('best, last and stars from several attempts', () => {
    // 60 %, 90 %, 40 % (oldest to newest): best 90 (5 stars), last 40.
    const model = buildReportModel({
      courses: [course('crs-aaaaaaaa', 'Algebra', true, [att(3, 5, 100), att(9, 10, 200), att(2, 5, 300)])],
    });
    expect(model.courses[0]).toMatchObject({ testsTaken: 3, bestPercent: 90, lastPercent: 40, stars: 5 });
  });

  it('the newest attempt is found whatever the list order (repo returns newest first)', () => {
    const model = buildReportModel({
      courses: [course('crs-aaaaaaaa', 'Algebra', true, [att(2, 5, 300), att(9, 10, 200), att(3, 5, 100)])],
    });
    expect(model.courses[0]).toMatchObject({ bestPercent: 90, lastPercent: 40 });
  });

  it('two attempts at the same millisecond: the higher id is the last one', () => {
    const model = buildReportModel({
      courses: [course('crs-aaaaaaaa', 'Algebra', true, [att(5, 5, 100, 7), att(1, 5, 100, 6)])],
    });
    expect(model.courses[0]?.lastPercent).toBe(100);
  });

  it('percent and stars come from scoring.ts, recomputed from asked and correct', () => {
    const model = buildReportModel({ courses: [course('crs-aaaaaaaa', 'Algebra', true, [att(2, 3, 1)])] });
    const percent = percentOf(2, 3);
    expect(model.courses[0]).toMatchObject({
      bestPercent: percent,
      lastPercent: percent,
      stars: starsForPercent(percent),
    });
    expect(percent).toBe(67);
    expect(starsForPercent(percent)).toBe(3);
  });

  it('a test taken without opening the course still counts as a test, not as an opened course', () => {
    const model = buildReportModel({ courses: [course('crs-aaaaaaaa', 'Algebra', false, [att(4, 5, 1)])] });
    expect(model.courses).toHaveLength(1);
    expect(model.courses[0]).toMatchObject({ opened: false, testsTaken: 1, bestPercent: 80, stars: 4 });
    expect(model.totals).toEqual({ coursesOpened: 0, testsTaken: 1, stars: 4 });
  });
});

describe('buildReportModel: totals and order', () => {
  const courses = [
    course('crs-bbbbbbbb', 'Biology', true, [att(5, 5, 10)]),
    course('crs-aaaaaaaa', 'Algebra', true, [att(3, 5, 10), att(4, 5, 20)]),
    course('crs-cccccccc', 'Chemistry', true),
    course('crs-dddddddd', 'Drawing', false),
  ];

  it('totals add up over the listed courses only', () => {
    const model = buildReportModel({ courses });
    // Biology: 100 % -> 5 stars. Algebra: best 80 % -> 4 stars. Chemistry: 0 stars.
    expect(model.totals).toEqual({ coursesOpened: 3, testsTaken: 3, stars: 9 });
    expect(model.courses.map((c) => c.id)).not.toContain('crs-dddddddd');
  });

  it('sorts by title when no course is current', () => {
    expect(buildReportModel({ courses }).courses.map((c) => c.title)).toEqual(['Algebra', 'Biology', 'Chemistry']);
  });

  it('lists the current course first, then the rest by title', () => {
    const model = buildReportModel({ courses, currentCourseId: 'crs-cccccccc' });
    expect(model.courses.map((c) => c.title)).toEqual(['Chemistry', 'Algebra', 'Biology']);
  });

  it('a current course without activity is not added', () => {
    const model = buildReportModel({ courses, currentCourseId: 'crs-dddddddd' });
    expect(model.courses.map((c) => c.title)).toEqual(['Algebra', 'Biology', 'Chemistry']);
  });

  it('equal titles fall back to the id', () => {
    const model = buildReportModel({
      courses: [course('crs-zzzzzzzz', 'Same', true), course('crs-aaaaaaaa', 'Same', true)],
    });
    expect(model.courses.map((c) => c.id)).toEqual(['crs-aaaaaaaa', 'crs-zzzzzzzz']);
  });

  it('does not change its input', () => {
    const frozen = Object.freeze(courses.map((c) => Object.freeze({ ...c, attempts: Object.freeze([...c.attempts]) })));
    const before = frozen.map((c) => c.id);
    expect(() => buildReportModel({ courses: frozen, currentCourseId: 'crs-cccccccc' })).not.toThrow();
    expect(frozen.map((c) => c.id)).toEqual(before);
  });
});

describe('buildReportModel: Gujarati and privacy', () => {
  it('keeps Gujarati titles and the name exactly as given and sorts them', () => {
    const science = 'વિજ્ઞાન';
    const maths = 'ગણિત';
    const model = buildReportModel({
      courses: [course('crs-aaaaaaaa', science, true), course('crs-bbbbbbbb', maths, true)],
      profile: { name: 'આશા પટેલ' },
    });
    expect(model.courses.map((c) => c.title)).toEqual([maths, science]);
    expect(model.userName).toBe('આશા પટેલ');
  });

  it('trims the name; an empty or blank name is left out', () => {
    expect(buildReportModel({ courses: [], profile: { name: '  Asha  ' } }).userName).toBe('Asha');
    expect('userName' in buildReportModel({ courses: [], profile: { name: '   ' } })).toBe(false);
    expect('userName' in buildReportModel({ courses: [], profile: {} })).toBe(false);
    expect('userName' in buildReportModel({ courses: [] })).toBe(false);
  });

  it('email and phone never get into the model, even when a full profile is passed', () => {
    const profile = { name: 'Asha', email: 'asha@example.com', phone: '9000000000' };
    const model = buildReportModel({ courses: [course('crs-aaaaaaaa', 'Algebra', true, [att(1, 2, 1)])], profile });
    const text = JSON.stringify(model);
    expect(text).not.toContain('asha@example.com');
    expect(text).not.toContain('9000000000');
    expect(Object.keys(model).sort()).toEqual(['courses', 'totals', 'userName']);
  });
});
