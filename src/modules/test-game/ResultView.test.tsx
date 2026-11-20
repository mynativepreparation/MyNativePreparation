import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Question, Test } from '../../core/content/types';
import { answer, currentQuestion, next, result, startGame, type GameResult } from './engine';
import { ResultView } from './ResultView';

afterEach(() => cleanup());

function handlers() {
  return { onPlayAgain: vi.fn(), onBackToCourse: vi.fn(), onReport: vi.fn() };
}

function made(stars: GameResult['stars'], correct = 7, asked = 10, percent = 70): GameResult {
  return { asked, correct, percent, stars, review: [] };
}

// A real finished game through the engine, so the screen is also checked against the engine's own numbers.
function playedResult(rightCount: number, total: number): GameResult {
  const questions: Question[] = Array.from({ length: total }, (_, i) => ({
    id: `qst-${String(i + 1).padStart(8, '0')}`,
    text: `Question ${i + 1}?`,
    options: ['one', 'two', 'three', 'four'],
    correctIndex: (i % 4) as 0 | 1 | 2 | 3,
  }));
  const test: Test = { id: 'tst-00000001', questionsPerGame: total, questions };
  let state = startGame(test, () => 0.5);
  if (!state) throw new Error('no game');
  for (let i = 0; i < total; i++) {
    const right = currentQuestion(state).correctIndex;
    const wrong = (right + 1) % 4;
    state = next(answer(state, i < rightCount ? right : wrong));
  }
  const finished = result(state);
  if (!finished) throw new Error('game did not finish');
  return finished;
}

describe('ResultView', () => {
  it('shows percent, "N of M correct" and the stars exactly as the engine gave them', () => {
    const r = playedResult(7, 10);
    render(<ResultView result={r} {...handlers()} />);

    expect(screen.getByText(`${r.percent}%`)).toBeTruthy();
    expect(screen.getByText(`${r.correct} of ${r.asked} correct`)).toBeTruthy();
    expect(screen.getByRole('img', { name: `${r.stars} out of 5 stars` })).toBeTruthy();
  });

  it('rounds a fractional percent for display only', () => {
    render(<ResultView result={made(3, 2, 3, 66.67)} {...handlers()} />);

    expect(screen.getByText('67%')).toBeTruthy();
  });

  it.each([
    [5, 'Congratulations!'],
    [4, 'Great job!'],
    [3, 'Good effort!'],
    [2, 'Keep going!'],
    [1, 'Work harder!'],
  ] as const)('shows the right cheer for %i stars', (stars, message) => {
    render(<ResultView result={made(stars)} {...handlers()} />);

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByRole('img', { name: `${stars} out of 5 stars` })).toBeTruthy();
  });

  it('shows only the cheer of its own star count', () => {
    render(<ResultView result={made(5)} {...handlers()} />);

    for (const other of ['Great job!', 'Good effort!', 'Keep going!', 'Work harder!']) {
      expect(screen.queryByText(other)).toBeNull();
    }
  });

  it('announces the cheer politely', () => {
    render(<ResultView result={made(4)} {...handlers()} />);

    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Great job!');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('pops the stars in one by one with the golden tone', () => {
    const { container } = render(<ResultView result={made(4)} {...handlers()} />);

    const stars = container.querySelector('.np-stars');
    expect(stars?.classList.contains('np-stars--animate')).toBe(true);
    expect(stars?.classList.contains('np-stars--star')).toBe(true);
  });

  it('handles the lowest and the best result (0 and 100 percent)', () => {
    const { rerender } = render(<ResultView result={made(1, 0, 10, 0)} {...handlers()} />);
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('0 of 10 correct')).toBeTruthy();

    rerender(<ResultView result={made(5, 10, 10, 100)} {...handlers()} />);
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('10 of 10 correct')).toBeTruthy();
  });

  it('has Play again, Back to the course and Report buttons that call their own handler once', () => {
    const h = handlers();
    render(<ResultView result={made(3)} {...h} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(h.onPlayAgain).toHaveBeenCalledTimes(1);
    expect(h.onBackToCourse).not.toHaveBeenCalled();
    expect(h.onReport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Back to the course' }));
    expect(h.onBackToCourse).toHaveBeenCalledTimes(1);
    expect(h.onReport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    expect(h.onReport).toHaveBeenCalledTimes(1);
    expect(h.onPlayAgain).toHaveBeenCalledTimes(1);
  });

  it('calls nothing by itself', () => {
    const h = handlers();
    render(<ResultView result={made(3)} {...h} />);

    expect(h.onPlayAgain).not.toHaveBeenCalled();
    expect(h.onBackToCourse).not.toHaveBeenCalled();
    expect(h.onReport).not.toHaveBeenCalled();
  });

  it('is a labelled region with the heading focused when it appears', () => {
    render(<ResultView result={made(3)} {...handlers()} />);

    const heading = screen.getByRole('heading', { level: 2, name: 'Your result' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole('region', { name: 'Your result' })).toBeTruthy();
  });
});
