import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManifestResult } from '../../core/content/loader';
import type { ManifestCourse } from '../../core/content/types';
import { t } from '../../core/i18n';
import { runLayoutCheck } from '../../core/ui';
import type { ReportSources } from './loadReportInput';
import type { ReportAttempt } from './reportData';
import { ReportScreen, type ReportScreenProps } from './ReportScreen';
import type { SaveEnvironment } from './savePdf';

// P08 T8: layout, keyboard and motion guard for the Report screen at 360 / 768 / 1366 px.
// jsdom has no layout engine (every box is 0 x 0), so this proves the wiring: each state renders at each window width, very long
// titles (Gujarati, one long word without spaces, English) reach the page in full, the groups that must never overlap carry
// `data-np-check`, and `runLayoutCheck` (the function the gallery button runs in a real browser) reports no problem. The CSS
// rules that make long words wrap are checked on the stylesheet text. Real pixels are judged by the owner (T9).
// Light/dark and "tokens only" are enforced for every stylesheet by core/ui/styles.test.ts. The screen logic has its own tests
// in ReportScreen.test.tsx.

const LONG_GUJARATI = 'સામાન્ય વિજ્ઞાન અને પર્યાવરણ અભ્યાસ, ક્ષેત્રફળ અને ત્રિકોણમિતિ '.repeat(3).trim();
const LONG_WORD = 'વિજ્ઞાનઅનેટેકનોલોજીઅભ્યાસક્રમ'.repeat(4);
const LONG_ENGLISH = 'Supercalifragilisticexpialidocious'.repeat(3);
const LONG_FILE_NAME = `ગુજરાતી-અહેવાલ-${'ખૂબ-લાંબું-નામ-'.repeat(8)}`;

const COURSES: [string, string][] = [
  ['crs_aaaaaaaa', 'General Science'],
  ['crs_bbbbbbbb', LONG_GUJARATI],
  ['crs_cccccccc', LONG_WORD],
  ['crs_dddddddd', LONG_ENGLISH],
  ['crs_eeeeeeee', 'History'],
  ['crs_ffffffff', 'ગણિત'],
];
const CURRENT = 'crs_aaaaaaaa';
const UNKNOWN = 'crs_zzzzzzzz';
const TITLES = COURSES.map(([, title]) => title);

const BYTES = new Uint8Array([37, 80, 68, 70]);
const NOW = (): Date => new Date(2026, 10, 21, 10, 30, 0);

const course = (id: string, title: string): ManifestCourse => ({ id, title, version: 1, files: {} });

const MANIFEST: ManifestResult = {
  ok: true,
  manifest: {
    schemaVersion: 1,
    generatedAt: '2026-11-21T00:00:00Z',
    courses: COURSES.map(([id, title]) => course(id, title)),
  },
};

const attempt = (asked: number, correct: number, at: number): ReportAttempt => ({ asked, correct, at });

const ATTEMPTS: Record<string, ReportAttempt[]> = {
  crs_aaaaaaaa: [attempt(10, 9, 100), attempt(10, 6, 200)],
  crs_bbbbbbbb: [attempt(20, 20, 300)],
  crs_cccccccc: [attempt(5, 1, 400)],
};

/** Every course is opened and three of them have tests: six cards with long titles. */
function busySources(): ReportSources {
  return {
    loadManifest: () => Promise.resolve(MANIFEST),
    listAttempts: (courseId: string) => Promise.resolve(ATTEMPTS[courseId] ?? []),
    getOpenedCourseIds: () => Promise.resolve(COURSES.map(([id]) => id)),
    getProfile: () => Promise.resolve(undefined),
  };
}

/** Nothing opened, no test: the empty state. */
function emptySources(): ReportSources {
  return {
    loadManifest: () => Promise.resolve(MANIFEST),
    listAttempts: () => Promise.resolve([]),
    getOpenedCourseIds: () => Promise.resolve([]),
    getProfile: () => Promise.resolve(undefined),
  };
}

function renderReport(props: ReportScreenProps, courseId: string = CURRENT) {
  const router = createMemoryRouter(
    [
      { path: '/course/:courseId/report', element: <ReportScreen now={NOW} {...props} /> },
      { path: '/course/:courseId', element: <p>COURSE SCREEN</p> },
    ],
    { initialEntries: [`/course/${courseId}/report`] },
  );
  return render(<RouterProvider router={router} />);
}

const originalWidth = window.innerWidth;

function setWidthValue(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

function setWindowWidth(width: number) {
  setWidthValue(width);
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

/** The controls a keyboard user can reach with Tab, in document order. */
function focusable(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'),
  ).filter((el) => !(el as HTMLButtonElement).disabled && el.getAttribute('tabindex') !== '-1');
}

async function showBusyReport() {
  renderReport({ sources: busySources() });
  await screen.findByRole('heading', { level: 2, name: 'General Science' });
}

afterEach(() => {
  cleanup();
  setWidthValue(originalWidth);
});

describe.each([360, 768, 1366])('report screen layout at %i px', (width) => {
  it('summary: totals, a card per course, very long titles in full, controls shown, no sideways scroll, no overlap', async () => {
    setWindowWidth(width);
    await showBusyReport();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
    expect([...titles].sort()).toEqual([...TITLES].sort());
    expect(screen.getByLabelText(t('report.fileName.label'))).toBeInTheDocument();
    expect(button(t('report.create'))).toBeInTheDocument();
    expect(button(t('report.back'))).toBeInTheDocument();
    // The groups whose children must never overlap are marked for runLayoutCheck, and hold what we expect.
    expect(document.querySelector('ul[data-np-check]')?.children.length).toBe(COURSES.length);
    expect(document.querySelector('dl[data-np-check]')?.children.length).toBe(3);
    expect(screen.getByRole('group', { name: t('report.scope.label') })).toHaveAttribute('data-np-check');
    expect(runLayoutCheck()).toEqual([]);
  });

  it('empty state: a friendly message, no PDF button, no sideways scroll, no overlap', async () => {
    setWindowWidth(width);
    renderReport({ sources: emptySources() });
    await screen.findByText(t('report.empty'));
    expect(screen.queryByRole('button', { name: t('report.create') })).not.toBeInTheDocument();
    expect(runLayoutCheck()).toEqual([]);
  });

  it('unknown course: the not-available text and Back, no scope switch, no overlap', async () => {
    setWindowWidth(width);
    renderReport({ sources: busySources() }, UNKNOWN);
    await screen.findByText(t('course.unavailable'));
    expect(button(t('report.back'))).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: t('report.scope.label') })).not.toBeInTheDocument();
    expect(runLayoutCheck()).toEqual([]);
  });

  it('saved: a long file name is cut by the rules and shown in full in the status line, no overlap', async () => {
    setWindowWidth(width);
    const download = vi.fn<(blob: Blob, name: string) => void>();
    const saveEnvironment: SaveEnvironment = { download };
    renderReport({ sources: busySources(), makePdf: () => Promise.resolve(BYTES), saveEnvironment });
    await screen.findByRole('heading', { level: 2, name: 'General Science' });
    fireEvent.change(screen.getByLabelText(t('report.fileName.label')), { target: { value: LONG_FILE_NAME } });
    fireEvent.click(button(t('report.create')));
    fireEvent.click(await screen.findByRole('button', { name: t('report.save') }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const savedName = download.mock.calls[0][1];
    expect(savedName.endsWith('.pdf')).toBe(true);
    expect(Array.from(savedName).length).toBeLessThanOrEqual(84); // 80 characters + ".pdf"
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(savedName));
    expect(runLayoutCheck()).toEqual([]);
  });
});

describe('report screen keyboard', () => {
  it('Tab order follows the reading order: scope, file name, Create PDF, Back; no positive tabindex', async () => {
    await showBusyReport();
    const expected = [
      button(t('report.scope.all')),
      button(t('report.scope.course')),
      screen.getByLabelText(t('report.fileName.label')),
      button(t('report.create')),
      button(t('report.back')),
    ];
    const actual = focusable();
    expect(actual).toHaveLength(expected.length);
    expected.forEach((el, index) => expect(actual[index]).toBe(el));
    document.querySelectorAll('[tabindex]').forEach((el) => {
      expect(Number(el.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    });
  });

  it('every control can take the focus', async () => {
    await showBusyReport();
    focusable().forEach((el) => {
      el.focus();
      expect(document.activeElement).toBe(el);
    });
  });

  it('empty state: Tab reaches the two scope buttons and Back only', async () => {
    renderReport({ sources: emptySources() });
    await screen.findByText(t('report.empty'));
    const expected = [button(t('report.scope.all')), button(t('report.scope.course')), button(t('report.back'))];
    const actual = focusable();
    expect(actual).toHaveLength(expected.length);
    expected.forEach((el, index) => expect(actual[index]).toBe(el));
  });

  it('unknown course: Back is the only control', async () => {
    renderReport({ sources: busySources() }, UNKNOWN);
    await screen.findByText(t('course.unavailable'));
    const actual = focusable();
    expect(actual).toHaveLength(1);
    expect(actual[0]).toBe(button(t('report.back')));
  });
});

describe('report screen motion and wrapping (stylesheet rules)', () => {
  const css = readFileSync(join('src', 'modules', 'report', 'ReportScreen.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  // The body of the rule `selector { ... }` (every rule of this file has a single selector on its own line).
  const ruleOf = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  };

  it('adds no animation of its own and every transition uses motion tokens (base.css turns them off for reduced motion)', () => {
    expect(css).not.toMatch(/@keyframes|animation/);
    (css.match(/transition[a-z-]*\s*:[^;]+;/g) ?? []).forEach((declaration) => {
      expect(declaration).toMatch(/none|var\(--np-/);
    });
  });

  it('shows the stars without the animated class', async () => {
    await showBusyReport();
    expect(document.querySelector('.np-stars--animate')).toBeNull();
  });

  it.each(['.np-report__title', '.np-report__course-title', '.np-report__line', '.np-report__status'])(
    '%s lets a very long word wrap instead of overflowing',
    (selector) => {
      expect(ruleOf(selector)).toContain('overflow-wrap: anywhere');
    },
  );
});
