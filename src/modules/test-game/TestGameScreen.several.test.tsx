import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../../core/content/loader';
import type { Question, Test } from '../../core/content/types';
import { t } from '../../core/i18n';
import { TestGameScreen } from './TestGameScreen';

// P10 T11t (d): a course with SEVERAL tests. The loader, the test finder and the repository are mocked; the real engine and
// the real views run. TestGameScreen.test.tsx covers a course with one test (the old behaviour).
const { courseMock, findMock, addAttemptMock } = vi.hoisted(() => ({
  courseMock: vi.fn(),
  findMock: vi.fn(),
  addAttemptMock: vi.fn(),
}));

vi.mock('../../core/content/loader', () => ({
  loadCourse: courseMock,
  contentUrl: (path: string) => `/content/${path}`,
}));
vi.mock('../../core/content/courseTests', () => ({ findCourseTests: findMock }));
vi.mock('../../core/storage/repo', () => ({ addAttempt: addAttemptMock }));

const ID = 'crs_aaaaaaaa';
const FIRST = 'tst-aaaa0001';
const SECOND = 'tst-bbbb0002';

function question(label: string, id: string): Question {
  return {
    id,
    text: `${label}: which one?`,
    options: [`${label} right`, `${label} wrong`, `${label} other`, `${label} nope`],
    correctIndex: 0,
  };
}

const first: Test = {
  id: FIRST,
  title: 'Science quiz',
  questionsPerGame: 2,
  questions: [question('Alpha', 'qst-aaaa0001'), question('Alpha2', 'qst-aaaa0002')],
};

// no title: the list names it "Test 2" and the intro shows the default title
const second: Test = { id: SECOND, questionsPerGame: 1, questions: [question('Beta', 'qst-bbbb0001')] };

function course(test: LoadedCourse['test']): LoadedCourse {
  return {
    card: { state: 'ready', value: { id: ID, title: 'General Science', order: 1 } },
    overview: { state: 'empty' },
    content: { state: 'empty' },
    test,
  };
}

function fakeSound() {
  return { unlock: vi.fn(), play: vi.fn(), setMuted: vi.fn(), dispose: vi.fn(), muted: false };
}

function renderGame(initialEntries: string[] = [`/course/${ID}/test`]) {
  const element = <TestGameScreen rng={() => 0.5} sound={fakeSound()} confetti={vi.fn(() => vi.fn())} />;
  const router = createMemoryRouter(
    [
      { path: '/course/:courseId/test', element },
      { path: '/course/:courseId/test/:testId', element },
      { path: '/course/:courseId', element: <p>COURSE SCREEN</p> },
    ],
    { initialEntries },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}

const listTitle = () => screen.queryByRole('heading', { level: 2, name: t('testGame.list.title') });

beforeEach(() => {
  courseMock.mockReset();
  findMock.mockReset();
  addAttemptMock.mockReset();
  courseMock.mockResolvedValue(course({ state: 'empty' }));
  findMock.mockResolvedValue([first, second]);
  addAttemptMock.mockResolvedValue({});
});

afterEach(() => cleanup());

describe('TestGameScreen: a course with several tests', () => {
  it('shows a list to choose from, not a game', async () => {
    renderGame();

    expect(await screen.findByRole('heading', { level: 2, name: t('testGame.list.title') })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: t('course.tile.test') })).toBeInTheDocument();
    expect(screen.getByText('Science quiz')).toBeInTheDocument();
    expect(screen.getByText('Test 2')).toBeInTheDocument();
    expect(screen.getByText('Questions: 2')).toBeInTheDocument();
    expect(screen.getByText('Questions: 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('testGame.start') })).toBeNull();
    expect(addAttemptMock).not.toHaveBeenCalled();
  });

  it('the list has a Back to the course button', async () => {
    renderGame();
    await screen.findByRole('heading', { level: 2, name: t('testGame.list.title') });

    fireEvent.click(screen.getByRole('button', { name: t('course.backToCourse') }));

    expect(await screen.findByText('COURSE SCREEN')).toBeInTheDocument();
  });

  it('a tap on a test opens it at its own address, with its own intro', async () => {
    const { router } = renderGame();

    fireEvent.click((await screen.findByText('Science quiz')).closest('button') as HTMLButtonElement);

    expect(await screen.findByRole('button', { name: t('testGame.start') })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/course/${ID}/test/${FIRST}`);
    expect(screen.getByRole('heading', { level: 2, name: 'Science quiz' })).toBeInTheDocument();
    expect(screen.getByText('2 questions')).toBeInTheDocument();
    expect(listTitle()).toBeNull();
  });

  it('the address of a test opens that test straight away; a test without a title gets the default title', async () => {
    renderGame([`/course/${ID}/test/${SECOND}`]);

    expect(await screen.findByRole('heading', { level: 2, name: t('testGame.intro.defaultTitle') })).toBeInTheDocument();
    expect(screen.getByText(t('testGame.intro.countOne'))).toBeInTheDocument();
    expect(listTitle()).toBeNull();
  });

  it('an unknown test address shows the not-available text with a Back button', async () => {
    renderGame([`/course/${ID}/test/tst-zzzz0000`]);

    expect(await screen.findByText(t('course.unavailable'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('testGame.start') })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: t('course.backToCourse') }));
    expect(await screen.findByText('COURSE SCREEN')).toBeInTheDocument();
  });

  it('plays the chosen test and saves the attempt under ITS id', async () => {
    renderGame();

    fireEvent.click((await screen.findByText('Test 2')).closest('button') as HTMLButtonElement);
    fireEvent.click(await screen.findByRole('button', { name: t('testGame.start') }));
    fireEvent.click(await screen.findByRole('button', { name: /Beta right/ }));
    fireEvent.click(screen.getByRole('button', { name: /^(Next|See result)$/ }));

    await waitFor(() => expect(addAttemptMock).toHaveBeenCalledTimes(1));
    expect(addAttemptMock).toHaveBeenCalledWith({ courseId: ID, testId: SECOND, asked: 1, correct: 1 });
  });
});

describe('TestGameScreen: when the list is not needed', () => {
  it('ONE test found in tests/ goes straight to its intro, without a list', async () => {
    findMock.mockResolvedValue([second]);
    renderGame();

    expect(await screen.findByRole('button', { name: t('testGame.start') })).toBeInTheDocument();
    expect(listTitle()).toBeNull();
  });

  it('a test that would ask 0 questions is not offered: one playable test is left, so no list', async () => {
    findMock.mockResolvedValue([first, { ...second, questionsPerGame: 0 }]);
    renderGame();

    expect(await screen.findByRole('heading', { level: 2, name: 'Science quiz' })).toBeInTheDocument();
    expect(listTitle()).toBeNull();
  });

  it('with no tests in tests/, the old test.json is played as before', async () => {
    findMock.mockResolvedValue([]);
    courseMock.mockResolvedValue(course({ state: 'ready', value: first }));
    renderGame();

    expect(await screen.findByRole('heading', { level: 2, name: 'Science quiz' })).toBeInTheDocument();
    expect(listTitle()).toBeNull();
  });

  it('a failing search for tests falls back to the old test.json (never a crash)', async () => {
    findMock.mockRejectedValue(new Error('boom'));
    courseMock.mockResolvedValue(course({ state: 'ready', value: first }));
    renderGame();

    expect(await screen.findByRole('heading', { level: 2, name: 'Science quiz' })).toBeInTheDocument();
  });

  it('no test anywhere shows the not-available text', async () => {
    findMock.mockResolvedValue([]);
    renderGame();

    expect(await screen.findByText(t('course.unavailable'))).toBeInTheDocument();
    expect(listTitle()).toBeNull();
  });
});
