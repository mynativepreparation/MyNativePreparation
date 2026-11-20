import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../../core/content/loader';
import type { Question, Test } from '../../core/content/types';
import { t } from '../../core/i18n';
import { TestGameScreen } from './TestGameScreen';

// The loader and the repository are mocked; the real engine and the real views run. Sound and confetti are fakes.
const { courseMock, addAttemptMock } = vi.hoisted(() => ({ courseMock: vi.fn(), addAttemptMock: vi.fn() }));

vi.mock('../../core/content/loader', () => ({
  loadCourse: courseMock,
  contentUrl: (path: string) => `/content/${path}`,
}));
vi.mock('../../core/storage/repo', () => ({ addAttempt: addAttemptMock }));

const ID = 'crs_aaaaaaaa';
const TEST_ID = 'tst_aaaaaaaa';

function question(i: number): Question {
  return {
    id: `qst_${String(i).padStart(8, 'a')}`,
    text: `Question number ${i}?`,
    options: [`Q${i} right`, `Q${i} wrong`, `Q${i} other`, `Q${i} nope`],
    correctIndex: 0,
  };
}

function makeTest(overrides: Partial<Test> = {}): Test {
  return {
    id: TEST_ID,
    title: 'Science quiz',
    questionsPerGame: 3,
    questions: [question(1), question(2), question(3)],
    ...overrides,
  };
}

function course(test: LoadedCourse['test']): LoadedCourse {
  return {
    card: { state: 'ready', value: { id: ID, title: 'General Science', order: 1 } },
    overview: { state: 'empty' },
    content: { state: 'empty' },
    test,
  };
}

function fakeSound(initialMuted = false) {
  const state = { muted: initialMuted };
  return {
    unlock: vi.fn(),
    play: vi.fn(),
    setMuted: vi.fn((muted: boolean) => {
      state.muted = muted;
    }),
    dispose: vi.fn(),
    get muted() {
      return state.muted;
    },
  };
}

function renderGame(options: { sound?: ReturnType<typeof fakeSound>; initialEntries?: string[]; initialIndex?: number } = {}) {
  const sound = options.sound ?? fakeSound();
  const stopConfetti = vi.fn();
  const confetti = vi.fn(() => stopConfetti);
  const init: { initialEntries: string[]; initialIndex?: number } = {
    initialEntries: options.initialEntries ?? [`/course/${ID}/test`],
  };
  if (options.initialIndex !== undefined) init.initialIndex = options.initialIndex;
  const router = createMemoryRouter(
    [
      { path: '/course/:courseId/test', element: <TestGameScreen rng={() => 0.5} sound={sound} confetti={confetti} /> },
      { path: '/course/:courseId', element: <p>COURSE SCREEN</p> },
      { path: '/course/:courseId/report', element: <p>REPORT SCREEN</p> },
    ],
    init,
  );
  const view = render(<RouterProvider router={router} />);
  return { ...view, router, sound, confetti, stopConfetti };
}

const pick = (n: number, kind: 'right' | 'wrong') =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`Q${n} ${kind}`) }));
const goOn = () => fireEvent.click(screen.getByRole('button', { name: /^(Next|See result)$/ }));

/** Plays a whole 3-question game; `pattern[i]` true = answer question i+1 correctly. */
function playGame(pattern: boolean[]) {
  pattern.forEach((right, i) => {
    pick(i + 1, right ? 'right' : 'wrong');
    goOn();
  });
}

async function startedGame(options: Parameters<typeof renderGame>[0] = {}) {
  const rendered = renderGame(options);
  fireEvent.click(await screen.findByRole('button', { name: t('testGame.start') }));
  return rendered;
}

beforeEach(() => {
  courseMock.mockReset();
  addAttemptMock.mockReset();
  courseMock.mockResolvedValue(course({ state: 'ready', value: makeTest() }));
  addAttemptMock.mockResolvedValue({});
});

afterEach(() => cleanup());

describe('TestGameScreen: loading and not-available states', () => {
  it('shows a loading note first, then the intro', async () => {
    renderGame();
    expect(screen.getByRole('status').textContent).toBe(t('course.loading'));

    expect(await screen.findByRole('heading', { level: 2, name: 'Science quiz' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: t('course.tile.test') })).toBeInTheDocument();
    expect(screen.getByText('3 questions')).toBeInTheDocument();
  });

  it.each([
    ['an unknown or broken course', () => ({ ...course({ state: 'ready', value: makeTest() }), card: { state: 'invalid', errors: ['bad'] } })],
    ['a course without a test', () => course({ state: 'empty' })],
    ['a broken test file', () => course({ state: 'invalid', errors: ['bad'] })],
    ['a test that would ask 0 questions', () => course({ state: 'ready', value: makeTest({ questionsPerGame: 0 }) })],
  ] as const)('%s shows the not-available text with a Back button', async (_name, make) => {
    courseMock.mockResolvedValue(make());
    renderGame();

    expect(await screen.findByText(t('course.unavailable'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('testGame.start') })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: t('course.backToCourse') }));
    expect(await screen.findByText('COURSE SCREEN')).toBeInTheDocument();
  });

  it('a loader that throws shows the not-available text, never a crash', async () => {
    courseMock.mockRejectedValue(new Error('boom'));
    renderGame();

    expect(await screen.findByText(t('course.unavailable'))).toBeInTheDocument();
  });

  it('asks only as many questions as exist when the developer asks for more', async () => {
    courseMock.mockResolvedValue(course({ state: 'ready', value: makeTest({ questionsPerGame: 20 }) }));
    renderGame();

    expect(await screen.findByText('3 questions')).toBeInTheDocument();
  });

  it('draws the test image from the course folder', async () => {
    courseMock.mockResolvedValue(course({ state: 'ready', value: makeTest({ image: 'images/cover.png' }) }));
    const { container } = renderGame();

    await screen.findByRole('heading', { level: 2, name: 'Science quiz' });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(`/content/courses/${ID}/images/cover.png`);
  });

  it('Back on the intro returns to the course', async () => {
    renderGame();
    fireEvent.click(await screen.findByRole('button', { name: t('course.backToCourse') }));

    expect(await screen.findByText('COURSE SCREEN')).toBeInTheDocument();
  });
});

describe('TestGameScreen: playing', () => {
  it('Start unlocks the sound once and shows the first question', async () => {
    const { sound } = await startedGame();

    expect(sound.unlock).toHaveBeenCalledTimes(1);
    expect(sound.play).toHaveBeenCalledWith('tap');
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Question number 1?' })).toBeInTheDocument();
    expect(addAttemptMock).not.toHaveBeenCalled();
  });

  it('plays the correct sound for a right answer and the wrong sound for a wrong one', async () => {
    const { sound } = await startedGame();

    pick(1, 'right');
    expect(sound.play).toHaveBeenLastCalledWith('correct');
    goOn();
    pick(2, 'wrong');
    expect(sound.play).toHaveBeenLastCalledWith('wrong');
  });

  it('counts a question once: a second tap on the same question does nothing', async () => {
    const { sound } = await startedGame();

    pick(1, 'right');
    fireEvent.click(screen.getByRole('button', { name: /Q1 wrong/ })); // disabled after the answer
    const kinds = sound.play.mock.calls.map((call) => call[0]);

    expect(kinds.filter((kind) => kind === 'correct')).toHaveLength(1);
    expect(kinds).not.toContain('wrong');
    expect(screen.getByText('Score: 1')).toBeInTheDocument();
  });

  it('moves through the questions and shows the running score', async () => {
    await startedGame();

    pick(1, 'right');
    goOn();
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Score: 1')).toBeInTheDocument();
    pick(2, 'wrong');
    goOn();
    expect(screen.getByText('Question 3 of 3')).toBeInTheDocument();
    expect(screen.getByText('Score: 1')).toBeInTheDocument();
  });
});

describe('TestGameScreen: result', () => {
  it('a perfect game: 5 stars, saved once, fanfare and confetti', async () => {
    const { sound, confetti } = await startedGame();
    playGame([true, true, true]);

    expect(screen.getByRole('heading', { level: 2, name: t('testGame.result.title') })).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 correct')).toBeInTheDocument();
    expect(screen.getByText('Congratulations!')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '5 out of 5 stars' })).toBeInTheDocument();
    expect(addAttemptMock).toHaveBeenCalledTimes(1);
    expect(addAttemptMock).toHaveBeenCalledWith({ courseId: ID, testId: TEST_ID, asked: 3, correct: 3 });
    expect(sound.play).toHaveBeenLastCalledWith('result', 5);
    expect(confetti).toHaveBeenCalledTimes(1);
    expect(confetti).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('2 of 3 correct = 67% = 3 stars: still confetti', async () => {
    const { confetti } = await startedGame();
    playGame([true, false, true]);

    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('Good effort!')).toBeInTheDocument();
    expect(confetti).toHaveBeenCalledTimes(1);
    expect(addAttemptMock).toHaveBeenCalledWith({ courseId: ID, testId: TEST_ID, asked: 3, correct: 2 });
  });

  it('1 of 3 correct = 33% = 1 star: no confetti, the result is still saved and cheered', async () => {
    const { sound, confetti } = await startedGame();
    playGame([false, true, false]);

    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('Work harder!')).toBeInTheDocument();
    expect(confetti).not.toHaveBeenCalled();
    expect(sound.play).toHaveBeenLastCalledWith('result', 1);
    expect(addAttemptMock).toHaveBeenCalledTimes(1);
  });

  it('saves nothing before the last answer is confirmed', async () => {
    await startedGame();

    playGame([true, true]);
    pick(3, 'right');

    expect(addAttemptMock).not.toHaveBeenCalled();
  });

  it('does not save a second time when the screen draws again (for example the sound switch)', async () => {
    await startedGame();
    playGame([true, true, true]);

    fireEvent.click(screen.getByRole('button', { name: t('testGame.mute') }));
    fireEvent.click(screen.getByRole('button', { name: t('testGame.unmute') }));

    expect(addAttemptMock).toHaveBeenCalledTimes(1);
  });

  it('a save problem never hides the result: a small note appears', async () => {
    addAttemptMock.mockRejectedValue(new Error('locked'));
    await startedGame();
    playGame([true, true, true]);

    expect(await screen.findByText(t('testGame.saveFailed'))).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('Play again starts a fresh game at question 1 and saves only when that game ends', async () => {
    await startedGame();
    playGame([true, true, true]);

    fireEvent.click(screen.getByRole('button', { name: t('testGame.playAgain') }));
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('Score: 0')).toBeInTheDocument();
    expect(addAttemptMock).toHaveBeenCalledTimes(1);

    playGame([false, false, false]);
    expect(addAttemptMock).toHaveBeenCalledTimes(2);
    expect(addAttemptMock).toHaveBeenLastCalledWith({ courseId: ID, testId: TEST_ID, asked: 3, correct: 0 });
  });

  it('Back to the course and Report open their screens', async () => {
    await startedGame();
    playGame([true, true, true]);
    fireEvent.click(screen.getByRole('button', { name: t('testGame.report') }));
    expect(await screen.findByText('REPORT SCREEN')).toBeInTheDocument();

    cleanup();
    await startedGame();
    playGame([true, true, true]);
    fireEvent.click(screen.getByRole('button', { name: t('course.backToCourse') }));
    expect(await screen.findByText('COURSE SCREEN')).toBeInTheDocument();
  });
});

describe('TestGameScreen: leaving halfway', () => {
  it('Leave game asks first, and Leave goes to the course without saving anything', async () => {
    await startedGame();
    pick(1, 'right');
    goOn();

    fireEvent.click(screen.getByRole('button', { name: t('testGame.leave') }));
    expect(await screen.findByRole('alertdialog', { name: t('testGame.leaveTitle') })).toBeInTheDocument();
    expect(screen.getByText(t('testGame.leaveText'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('testGame.leaveConfirm') }));
    expect(await screen.findByText('COURSE SCREEN')).toBeInTheDocument();
    expect(addAttemptMock).not.toHaveBeenCalled();
  });

  it('Stay returns to the same question with the progress kept', async () => {
    await startedGame();
    pick(1, 'right');
    goOn();

    fireEvent.click(screen.getByRole('button', { name: t('testGame.leave') }));
    fireEvent.click(await screen.findByRole('button', { name: t('testGame.stay') }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Score: 1')).toBeInTheDocument();
  });

  it('puts the focus on Stay, and Escape also means Stay', async () => {
    await startedGame();
    fireEvent.click(screen.getByRole('button', { name: t('testGame.leave') }));
    const stay = await screen.findByRole('button', { name: t('testGame.stay') });

    expect(document.activeElement).toBe(stay);
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument();
  });

  it('the browser Back button is asked about too', async () => {
    const { router } = await startedGame({ initialEntries: [`/course/${ID}`, `/course/${ID}/test`], initialIndex: 1 });

    await act(async () => {
      await router.navigate(-1);
    });

    expect(await screen.findByRole('alertdialog', { name: t('testGame.leaveTitle') })).toBeInTheDocument();
    expect(addAttemptMock).not.toHaveBeenCalled();
  });

  it('is not asked on the intro (nothing to lose yet)', async () => {
    const { router } = renderGame({ initialEntries: [`/course/${ID}`, `/course/${ID}/test`], initialIndex: 1 });
    await screen.findByRole('button', { name: t('testGame.start') });
    await act(async () => {
      await router.navigate(-1);
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('COURSE SCREEN')).toBeInTheDocument();
  });
});

describe('TestGameScreen: sound switch', () => {
  it('toggles the sound and its label', async () => {
    const { sound } = renderGame();
    fireEvent.click(await screen.findByRole('button', { name: t('testGame.mute') }));

    expect(sound.setMuted).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: t('testGame.unmute') })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('testGame.unmute') }));
    expect(sound.setMuted).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: t('testGame.mute') })).toBeInTheDocument();
  });

  it('starts as muted when the remembered choice was "off"', async () => {
    renderGame({ sound: fakeSound(true) });

    expect(await screen.findByRole('button', { name: t('testGame.unmute') })).toBeInTheDocument();
  });

  it('releases the sound when the screen closes', async () => {
    const { sound, unmount } = renderGame();
    await screen.findByRole('button', { name: t('testGame.start') });

    unmount();

    expect(sound.dispose).toHaveBeenCalled();
  });
});
