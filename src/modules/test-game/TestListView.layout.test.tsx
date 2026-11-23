import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Test } from '../../core/content/types';
import { runLayoutCheck } from '../../core/ui';
import { TestListView } from './TestListView';

// P10 T11t (d): layout guard for the list of tests at 360 / 768 / 1366 px, with very long titles and many tests.
// jsdom has no layout engine, so this proves the wiring: every test reaches the page in full and `runLayoutCheck` (the function
// the gallery button runs in a real browser) reports no problem. Real pixels are judged by the owner (T11q).

const LONG_WORD = 'Supercalifragilisticexpialidocious'.repeat(3);

function make(index: number, title?: string): Test {
  const base: Test = {
    id: `tst-aaaa000${index}`,
    questionsPerGame: 1,
    questions: [{ id: 'qst-aaaa0001', text: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }],
  };
  return title === undefined ? base : { ...base, title };
}

const tests: Test[] = [
  make(1, `${LONG_WORD} first test with a very long title that needs several lines on a small phone`),
  make(2, `${LONG_WORD} second test with a very long title that needs several lines on a small phone`),
  make(3),
  make(4, 'Short'),
  make(5, LONG_WORD),
  make(6, 'Sixth test'),
];

const originalWidth = window.innerWidth;

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(() => {
  cleanup();
  setWindowWidth(originalWidth);
});

describe.each([360, 768, 1366])('test list layout at %i px', (width) => {
  it('shows every test in full, no sideways scroll, no overlap', () => {
    setWindowWidth(width);
    render(<TestListView tests={tests} onOpen={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(tests.length);
    expect(buttons.filter((button) => (button.textContent ?? '').includes(LONG_WORD))).toHaveLength(3);
    expect(runLayoutCheck()).toEqual([]);
  });
});
