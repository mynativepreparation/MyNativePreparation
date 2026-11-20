import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../core/content/loader';
import { t } from '../core/i18n';
import homeModule from '../modules/home';
import readerModule from '../modules/reader';
import testGameModule from '../modules/test-game';
import { Shell } from './Shell';

// The loader is mocked: this file tests that the REAL home routes sit inside the REAL Shell (bottom navigation) and that
// Courses stays highlighted on the course screens. The screens themselves have their own tests in modules/home.
const { manifestMock, courseMock } = vi.hoisted(() => ({ manifestMock: vi.fn(), courseMock: vi.fn() }));

vi.mock('../core/content/loader', () => ({
  loadManifest: manifestMock,
  loadCourse: courseMock,
  contentUrl: (path: string) => `/content/${path}`,
}));

const ID = 'crs_aaaaaaaa';
const blocks = [{ id: 'blk_aaaaaaaa', type: 'text' as const, text: 'Hello' }];

const fullCourse: LoadedCourse = {
  card: { state: 'ready', value: { id: ID, title: 'General Science', order: 1 } },
  overview: { state: 'ready', value: blocks },
  content: { state: 'ready', value: blocks },
  test: { state: 'empty' },
};

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ path: '/', element: <Shell />, children: [...homeModule.routes, ...readerModule.routes, ...testGameModule.routes, { path: 'settings', element: <p>SETTINGS SCREEN</p> }] }],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

const coursesLink = () => screen.getByRole('link', { name: t('nav.courses') });
const settingsLink = () => screen.getByRole('link', { name: t('nav.settings') });

beforeEach(() => {
  manifestMock.mockReset();
  courseMock.mockReset();
  manifestMock.mockResolvedValue({
    ok: true,
    manifest: { schemaVersion: 1, generatedAt: '2026-11-20T00:00:00Z', courses: [{ id: ID, title: 'Manifest title', version: 1, files: {} }] },
  });
  courseMock.mockResolvedValue(fullCourse);
});

describe('home routes inside the Shell', () => {
  it('"/" is the course list, with the bottom navigation and Courses highlighted', async () => {
    renderAt('/');
    expect(await screen.findByText('General Science')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: t('home.title') })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(coursesLink()).toHaveClass('active');
    expect(coursesLink()).toHaveAttribute('aria-current', 'page');
    expect(settingsLink()).not.toHaveClass('active');
  });

  it('tapping a course card opens the course with its four tiles, and Courses stays highlighted', async () => {
    renderAt('/');
    fireEvent.click((await screen.findByText('General Science')).closest('button') as HTMLButtonElement);
    expect(await screen.findByRole('heading', { level: 1, name: 'General Science' })).toBeInTheDocument();
    for (const name of [t('course.tile.overview'), t('course.tile.content'), t('course.tile.test'), t('course.tile.report')]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(coursesLink()).toHaveClass('active');
    expect(coursesLink()).toHaveAttribute('aria-current', 'true');
    expect(settingsLink()).not.toHaveClass('active');
  });

  it('every tile route renders a screen inside the Shell, and Back returns to the course', async () => {
    renderAt(`/course/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'General Science' });
    for (const section of ['overview', 'content', 'report'] as const) {
      const title = t(`course.tile.${section}`);
      fireEvent.click(screen.getByText(title).closest('button') as HTMLButtonElement);
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      // Overview and Content are the real reader (P06); Report is still a stand-in until P08.
      if (section === 'report') expect(screen.getByText(t('course.comingSoon'))).toBeInTheDocument();
      else expect(await screen.findByText('Hello')).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
      expect(coursesLink()).toHaveClass('active');
      fireEvent.click(screen.getByRole('button', { name: t('course.backToCourse') }));
      await screen.findByRole('heading', { level: 1, name: 'General Science' });
    }
  });

  it('the Test route is the real test game (P07); a course without a test shows the not-available state, opened by address', async () => {
    renderAt(`/course/${ID}/test`);
    expect(await screen.findByRole('heading', { level: 1, name: t('course.tile.test') })).toBeInTheDocument();
    expect(screen.getByText(t('course.unavailable'))).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('the Test route of a course with a test opens the game intro inside the Shell, and Back returns to the course', async () => {
    courseMock.mockResolvedValue({
      ...fullCourse,
      test: {
        state: 'ready',
        value: {
          id: 'tst_aaaaaaaa',
          title: 'Science quiz',
          questionsPerGame: 5,
          questions: [
            { id: 'qst_aaaaaaaa', text: 'Q one?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 },
            { id: 'qst_bbbbbbbb', text: 'Q two?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 },
          ],
        },
      },
    } satisfies LoadedCourse);
    renderAt(`/course/${ID}/test`);
    expect(await screen.findByRole('heading', { level: 2, name: 'Science quiz' })).toBeInTheDocument();
    expect(screen.getByText('2 questions')).toBeInTheDocument(); // 5 per game asked, only 2 exist
    expect(screen.getByRole('button', { name: t('testGame.start') })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('course.backToCourse') }));
    await screen.findByRole('heading', { level: 1, name: 'General Science' });
  });

  it('an unknown course shows the not-available state inside the Shell', async () => {
    courseMock.mockResolvedValue({ ...fullCourse, card: { state: 'invalid', errors: ['bad'] } });
    renderAt('/course/crs_unknown1');
    expect(await screen.findByRole('heading', { level: 1, name: t('course.notFound.title') })).toBeInTheDocument();
    expect(screen.getByText(t('course.unavailable'))).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('Settings is not a course screen: Courses is not highlighted there', async () => {
    renderAt('/settings');
    expect(await screen.findByText('SETTINGS SCREEN')).toBeInTheDocument();
    expect(coursesLink()).not.toHaveClass('active');
    expect(coursesLink()).not.toHaveAttribute('aria-current');
    expect(settingsLink()).toHaveClass('active');
  });
});
