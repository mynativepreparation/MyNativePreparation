import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManifestResult } from '../../core/content/loader';
import type { ManifestCourse } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { LockedError } from '../../core/identity/keyring';
import type { Profile } from '../../core/storage/repo';
import type { ReportSources } from './loadReportInput';
import { makeReportPdf } from './makeReportPdf';
import type { ReportAttempt } from './reportData';
import { ReportScreen, type ReportScreenProps } from './ReportScreen';
import { savePdf, type SaveEnvironment } from './savePdf';

// P08 T7c: the Report screen with fake data sources, a fake PDF maker and a fake save (nothing real runs).

const A = 'crs_aaaaaaaa';
const B = 'crs_bbbbbbbb';
const C = 'crs_cccccccc';
const UNKNOWN = 'crs_zzzzzzzz';

const course = (id: string, title: string): ManifestCourse => ({ id, title, version: 1, files: {} });

const MANIFEST: ManifestResult = {
  ok: true,
  manifest: {
    schemaVersion: 1,
    generatedAt: '2026-11-21T00:00:00Z',
    courses: [course(A, 'General Science'), course(B, 'ગણિત'), course(C, 'History')],
  },
};

const attempt = (asked: number, correct: number, at: number): ReportAttempt => ({ asked, correct, at });

const BYTES = new Uint8Array([37, 80, 68, 70]);
const NOW = (): Date => new Date(2026, 10, 21, 10, 30, 0);
const DEFAULT_NAME = 'NativePrep-report-2026-11-21';

interface Fakes {
  manifest?: ManifestResult;
  opened?: string[];
  attempts?: Record<string, ReportAttempt[]>;
  profile?: Profile;
}

function fakeSources(fakes: Fakes = {}) {
  const listAttempts = vi.fn((courseId: string) => Promise.resolve(fakes.attempts?.[courseId] ?? []));
  const sources: ReportSources = {
    loadManifest: () => Promise.resolve(fakes.manifest ?? MANIFEST),
    listAttempts,
    getOpenedCourseIds: () => Promise.resolve(fakes.opened ?? []),
    getProfile: () => Promise.resolve(fakes.profile),
  };
  return { sources, listAttempts };
}

/** Course A has two tests (best 90%, latest 60%), course B is only opened, course C has no activity. */
function activeSources(extra: Fakes = {}) {
  return fakeSources({
    opened: [A, B],
    attempts: { [A]: [attempt(10, 9, 100), attempt(10, 6, 200)] },
    ...extra,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderReport(props: ReportScreenProps, courseId: string = A) {
  const router = createMemoryRouter(
    [
      { path: '/course/:courseId/report', element: <ReportScreen now={NOW} {...props} /> },
      { path: '/course/:courseId', element: <p>COURSE SCREEN</p> },
    ],
    { initialEntries: [`/course/${courseId}/report`] },
  );
  return render(<RouterProvider router={router} />);
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const statusText = () => screen.getByRole('status').textContent;

/** Creates the PDF and waits until the Save button is there. */
async function createPdf() {
  fireEvent.click(button(t('report.create')));
  await screen.findByRole('button', { name: t('report.save') });
}

afterEach(cleanup);

describe('ReportScreen summary', () => {
  it('shows the totals and one card per course with activity, current course first, Gujarati title unchanged', async () => {
    renderReport({ sources: activeSources().sources });
    await screen.findByRole('heading', { name: 'General Science' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['General Science', 'ગણિત']);
    expect(screen.queryByRole('heading', { name: 'History' })).toBeNull();
    expect(screen.getByText(t('reportPdf.coursesOpened')).nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText(t('reportPdf.testsTaken')).nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText(tf('report.course.tests', { count: 2 }))).toBeTruthy();
    expect(screen.getByText(tf('report.course.last', { percent: 60 }))).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: t('reportPdf.best') }).getAttribute('aria-valuenow')).toBe('90');
    expect(screen.getByText(t('reportPdf.noTest'))).toBeTruthy(); // course B: opened, no test
    expect(screen.getByRole('img', { name: /out of 5 stars/ })).toBeTruthy();
  });

  it('shows a friendly empty state and no PDF button or file name when there is nothing to report', async () => {
    renderReport({ sources: fakeSources().sources });
    await screen.findByText(t('report.empty'));
    expect(screen.queryByRole('button', { name: t('report.create') })).toBeNull();
    expect(screen.queryByLabelText(t('report.fileName.label'))).toBeNull();
  });

  it('shows the owner\'s "not available" text and a Back button for an unknown course', async () => {
    renderReport({ sources: activeSources().sources }, UNKNOWN);
    await screen.findByText(t('course.unavailable'));
    expect(screen.queryByRole('button', { name: t('report.scope.all') })).toBeNull();
    fireEvent.click(button(t('report.back')));
    await screen.findByText('COURSE SCREEN');
  });

  it('goes back to the course', async () => {
    renderReport({ sources: activeSources().sources });
    await screen.findByRole('heading', { name: 'General Science' });
    fireEvent.click(button(t('report.back')));
    await screen.findByText('COURSE SCREEN');
  });
});

describe('ReportScreen scope switch', () => {
  it('starts with all courses and reloads for "This course"', async () => {
    const { sources, listAttempts } = activeSources();
    renderReport({ sources });
    await screen.findByRole('heading', { name: 'ગણિત' });
    expect(button(t('report.scope.all')).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(button(t('report.scope.course')));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'ગણિત' })).toBeNull());
    await screen.findByRole('heading', { name: 'General Science' });
    expect(button(t('report.scope.course')).getAttribute('aria-pressed')).toBe('true');
    expect(listAttempts.mock.calls.map((call) => call[0])).toEqual([A, B, C, A]);
  });
});

describe('ReportScreen load errors', () => {
  it('says the data is locked and loads again after Try again', async () => {
    let locked = true;
    const base = activeSources().sources;
    const sources: ReportSources = {
      ...base,
      getOpenedCourseIds: () => (locked ? Promise.reject(new LockedError()) : Promise.resolve([A])),
    };
    renderReport({ sources });
    expect((await screen.findByRole('alert')).textContent).toBe(t('report.error.locked'));
    locked = false;
    fireEvent.click(button(t('report.retry')));
    await screen.findByRole('heading', { name: 'General Science' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the course list is missing when the manifest cannot be loaded', async () => {
    const manifest: ManifestResult = { ok: false, reason: 'unavailable', errors: ['manifest.json: network error'] };
    renderReport({ sources: fakeSources({ manifest }).sources });
    expect((await screen.findByRole('alert')).textContent).toBe(t('report.error.manifest'));
  });

  it('gives a general message for any other failure', async () => {
    const base = activeSources().sources;
    const sources: ReportSources = { ...base, listAttempts: () => Promise.reject(new Error('unreadable')) };
    renderReport({ sources });
    expect((await screen.findByRole('alert')).textContent).toBe(t('report.error.other'));
  });
});

describe('ReportScreen Create PDF', () => {
  it('builds the model, shows a busy message, then offers Save', async () => {
    const pending = deferred<Uint8Array>();
    const makePdf = vi.fn<typeof makeReportPdf>(() => pending.promise);
    renderReport({ sources: activeSources().sources, makePdf });
    await screen.findByRole('heading', { name: 'General Science' });

    fireEvent.click(button(t('report.create')));
    expect(statusText()).toBe(t('report.creating'));
    expect(button(t('report.create')).disabled).toBe(true);

    await act(async () => {
      pending.resolve(BYTES);
    });
    await screen.findByRole('button', { name: t('report.save') });
    expect(statusText()).toBe(t('report.ready'));

    expect(makePdf).toHaveBeenCalledTimes(1);
    const input = makePdf.mock.calls[0][0];
    expect(input.model.courses.map((c) => c.id)).toEqual([A, B]);
    expect(input.dateText).toBe('21 November 2026');
    expect(input.labels.title).toBe(t('reportPdf.title'));
  });

  it('puts only the name of the profile into the PDF model, never email or phone', async () => {
    const makePdf = vi.fn<typeof makeReportPdf>(() => Promise.resolve(BYTES));
    const profile: Profile = { name: 'આશા', email: 'asha@example.com', phone: '9876543210' };
    renderReport({ sources: activeSources({ profile }).sources, makePdf });
    await screen.findByRole('heading', { name: 'General Science' });
    await createPdf();
    const input = makePdf.mock.calls[0][0];
    expect(input.model.userName).toBe('આશા');
    const text = JSON.stringify(input.model);
    expect(text).not.toContain('asha@example.com');
    expect(text).not.toContain('9876543210');
  });

  it('shows a message when the PDF cannot be made and lets the person try again', async () => {
    const makePdf = vi
      .fn<typeof makeReportPdf>()
      .mockRejectedValueOnce(new Error('font file missing'))
      .mockResolvedValue(BYTES);
    renderReport({ sources: activeSources().sources, makePdf });
    await screen.findByRole('heading', { name: 'General Science' });

    fireEvent.click(button(t('report.create')));
    await waitFor(() => expect(statusText()).toBe(t('report.createFailed')));
    expect(button(t('report.create')).disabled).toBe(false);

    await createPdf();
    expect(makePdf).toHaveBeenCalledTimes(2);
  });

  it('ignores a PDF that finishes after the scope was changed', async () => {
    const pending = deferred<Uint8Array>();
    const makePdf = vi.fn<typeof makeReportPdf>(() => pending.promise);
    renderReport({ sources: activeSources().sources, makePdf });
    await screen.findByRole('heading', { name: 'General Science' });

    fireEvent.click(button(t('report.create')));
    fireEvent.click(button(t('report.scope.course')));
    await screen.findByRole('button', { name: t('report.create') });
    await waitFor(() => expect(button(t('report.create')).disabled).toBe(false));

    await act(async () => {
      pending.resolve(BYTES);
    });
    expect(screen.queryByRole('button', { name: t('report.save') })).toBeNull();
    expect(button(t('report.create')).disabled).toBe(false);
  });
});

describe('ReportScreen Save', () => {
  it('saves the bytes under the typed name and says where', async () => {
    const makePdf = vi.fn<typeof makeReportPdf>(() => Promise.resolve(BYTES));
    const save = vi.fn<typeof savePdf>(() => Promise.resolve({ status: 'saved', method: 'download', fileName: 'My report.pdf' }));
    const saveEnvironment: SaveEnvironment = { download: vi.fn() };
    renderReport({ sources: activeSources().sources, makePdf, save, saveEnvironment });
    await screen.findByRole('heading', { name: 'General Science' });

    const field = screen.getByLabelText(t('report.fileName.label')) as HTMLInputElement;
    expect(field.value).toBe(DEFAULT_NAME);
    fireEvent.change(field, { target: { value: 'My report' } });
    await createPdf();
    fireEvent.click(button(t('report.save')));

    await screen.findByText(tf('report.saved', { name: 'My report.pdf' }));
    expect(save).toHaveBeenCalledTimes(1);
    const [input, environment] = save.mock.calls[0];
    expect(input).toEqual({ bytes: BYTES, name: 'My report', fallbackName: DEFAULT_NAME });
    expect(environment).toBe(saveEnvironment);
  });

  it('tells the person when saving was cancelled or failed, and Save stays available', async () => {
    const makePdf = vi.fn<typeof makeReportPdf>(() => Promise.resolve(BYTES));
    const save = vi
      .fn<typeof savePdf>()
      .mockResolvedValueOnce({ status: 'cancelled' })
      .mockResolvedValueOnce({ status: 'failed', message: 'disk full' });
    renderReport({ sources: activeSources().sources, makePdf, save, saveEnvironment: { download: vi.fn() } });
    await screen.findByRole('heading', { name: 'General Science' });
    await createPdf();

    fireEvent.click(button(t('report.save')));
    await waitFor(() => expect(statusText()).toBe(t('report.cancelled')));
    expect(button(t('report.save')).disabled).toBe(false);

    fireEvent.click(button(t('report.save')));
    await waitFor(() => expect(statusText()).toBe(t('report.saveFailed')));
    expect(save).toHaveBeenCalledTimes(2);
  });
});
