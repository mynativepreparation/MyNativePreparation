import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../../core/content/loader';
import type { Question, Test } from '../../core/content/types';
import { t } from '../../core/i18n';
import { runLayoutCheck } from '../../core/ui';
import { TestGameScreen } from './TestGameScreen';

// P07 T9: layout guard for the Test game at 360 / 768 / 1366 px (intro, a question with a very long text and very long
// options, the result, and the "not available" screen).
// jsdom has no layout engine (every box is 0 x 0), so this proves the wiring: each screen renders at each window width,
// long text and long options reach the page in full (nothing is cut in code), and `runLayoutCheck` (the same function the
// gallery button runs in a real browser) reports no problem. Real pixels are judged by the owner (T10).
// Light/dark and "tokens only" are enforced for every stylesheet by core/ui/styles.test.ts. Keys, double save and the leave
// dialog are covered by TestGameScreen.test.tsx and QuestionView.test.tsx; reduced motion by confetti.test.ts and the
// StarRating tests.

const { courseMock, addAttemptMock } = vi.hoisted(() => ({ courseMock: vi.fn(), addAttemptMock: vi.fn() }));

vi.mock('../../core/content/loader', () => ({
  loadCourse: courseMock,
  contentUrl: (path: string) => `/content/${path}`,
}));
vi.mock('../../core/storage/repo', () => ({ addAttempt: addAttemptMock }));

const ID = 'crs_aaaaaaaa';
const LONG_WORD = 'Supercalifragilisticexpialidocious'.repeat(3);

function longQuestion(i: number): Question {
  return {
    id: `qst_${String(i).padStart(8, 'a')}`,
    text: `Question ${i}: which of the following statements about ${LONG_WORD} gives the most accurate and complete description of the process that was explained in the chapter? `
      .repeat(2)
      .trim(),
    options: [
      `Q${i} A ${LONG_WORD} is the right answer, with a long ending that needs several lines on a small phone`,
      `Q${i} B ${LONG_WORD} is a wrong answer, with a long ending that needs several lines on a small phone`,
      `Q${i} C ${LONG_WORD} is another wrong answer, with a long ending that needs several lines on a small phone`,
      `Q${i} D ${LONG_WORD} is the last wrong answer, with a long ending that needs several lines on a small phone`,
    ],
    correctIndex: 0,
    explanation: `Explanation ${i}: ${LONG_WORD} is explained with a long sentence that goes on and on so that the card needs many lines.`,
  };
}

const questions: Question[] = [longQuestion(1), longQuestion(2)];

const longTest: Test = {
  id: 'tst_aaaaaaaa',
  title: 'Long quiz',
  questionsPerGame: 2,
  questions,
};

function course(test: LoadedCourse['test']): LoadedCourse {
  return {
    card: { state: 'ready', value: { id: ID, title: 'General Science', order: 1 } },
    overview: { state: 'empty' },
    content: { state: 'empty' },
    test,
  };
}

function fakeSound() {
  return {
    unlock: vi.fn(),
    play: vi.fn(),
    setMuted: vi.fn(),
    dispose: vi.fn(),
    muted: false,
  };
}

const originalWidth = window.innerWidth;

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

function renderGame() {
  const router = createMemoryRouter(
    [
      {
        path: '/course/:courseId/test',
        element: <TestGameScreen rng={() => 0.5} sound={fakeSound()} confetti={vi.fn(() => vi.fn())} />,
      },
    ],
    { initialEntries: [`/course/${ID}/test`] },
  );
  return render(<RouterProvider router={router} />);
}

/** The test question that the screen shows right now (the order depends on the shuffle, so it is looked up). */
function shownQuestion(): Question {
  const heading = screen.getByRole('heading', { level: 2 });
  const found = questions.find((q) => (heading.textContent ?? '').includes(q.text));
  if (!found) throw new Error('The shown question is not one of the test questions');
  return found;
}

function clickOption(text: string) {
  const button = screen.getAllByRole('button').find((b) => (b.textContent ?? '').includes(text));
  if (!button) throw new Error(`No option button with this text: ${text}`);
  fireEvent.click(button);
}

const goOn = () => fireEvent.click(screen.getByRole('button', { name: /^(Next|See result)$/ }));

async function startGame() {
  renderGame();
  fireEvent.click(await screen.findByRole('button', { name: t('testGame.start') }));
  await screen.findByRole('heading', { level: 2 });
}

beforeEach(() => {
  courseMock.mockReset();
  addAttemptMock.mockReset();
  courseMock.mockResolvedValue(course({ state: 'ready', value: longTest }));
  addAttemptMock.mockResolvedValue({});
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  setWindowWidth(originalWidth);
  window.localStorage.clear();
});

describe.each([360, 768, 1366])('test game layout at %i px', (width) => {
  it('intro: title, question count and Start are shown, no sideways scroll, no overlap', async () => {
    setWindowWidth(width);
    renderGame();
    expect(await screen.findByRole('heading', { level: 2, name: 'Long quiz' })).toBeInTheDocument();
    expect(screen.getByText('2 questions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('testGame.start') })).toBeInTheDocument();
    expect(runLayoutCheck()).toEqual([]);
  });

  it('question: a very long question and four very long options are all on the page in full, no overlap', async () => {
    setWindowWidth(width);
    await startGame();
    const shown = shownQuestion();
    const buttonTexts = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    shown.options.forEach((option) => {
      expect(buttonTexts.some((text) => text.includes(option))).toBe(true);
    });
    expect(buttonTexts.filter((text) => text.includes(LONG_WORD))).toHaveLength(4);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('question after a wrong answer: marks and a long explanation fit, no overlap', async () => {
    setWindowWidth(width);
    await startGame();
    const shown = shownQuestion();
    clickOption(shown.options[1]);
    expect(document.body.textContent ?? '').toContain(shown.explanation);
    expect(screen.getByRole('button', { name: /^(Next|See result)$/ })).toBeInTheDocument();
    expect(runLayoutCheck()).toEqual([]);
  });

  it('result: stars and the three buttons are shown, the game is saved once, no overlap', async () => {
    setWindowWidth(width);
    await startGame();
    clickOption(shownQuestion().options[0]);
    goOn();
    clickOption(shownQuestion().options[1]);
    goOn();
    expect(await screen.findByRole('button', { name: t('testGame.playAgain') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('testGame.report') })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: t('course.backToCourse') }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    await waitFor(() => expect(addAttemptMock).toHaveBeenCalledTimes(1));
    expect(runLayoutCheck()).toEqual([]);
  });

  it('"not available" screen has no Start button and no sideways scroll', async () => {
    courseMock.mockResolvedValue(course({ state: 'empty' }));
    setWindowWidth(width);
    renderGame();
    await waitFor(() => expect(screen.queryByText(t('course.loading'))).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: t('testGame.start') })).not.toBeInTheDocument();
    expect(runLayoutCheck()).toEqual([]);
  });
});
