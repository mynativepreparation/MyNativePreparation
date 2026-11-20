import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../../core/content/loader';
import type { Block } from '../../core/content/types';
import { runLayoutCheck } from '../../core/ui';
import { ReaderScreen, type ReaderSection } from './ReaderScreen';

// P06 T7: layout guard for the Reader at 360 / 768 / 1366 px.
// jsdom has no layout engine (every box is 0 x 0), so this proves the wiring: the block list carries `data-np-check`,
// holds one child per shown block, and `runLayoutCheck` (the same function the gallery button runs in a real browser)
// reports no problem at each window width and at the largest font size. Real pixels are judged by the owner (T8).
// Light/dark and "tokens only" are enforced for every stylesheet by core/ui/styles.test.ts.

const { loadMock } = vi.hoisted(() => ({ loadMock: vi.fn() }));

vi.mock('../../core/content/loader', () => ({
  loadCourse: loadMock,
  contentUrl: (path: string) => `/content/${path}`,
}));

const ID = 'crs_aaaaaaaa';

// 5 blocks that all render: title, subtitle, two-paragraph text, one very long word, image.
const blocks: Block[] = [
  { id: 'blk_aaaaaaa1', type: 'title', text: 'Chapter 1' },
  { id: 'blk_aaaaaaa2', type: 'subtitle', text: 'The water cycle' },
  { id: 'blk_aaaaaaa3', type: 'text', text: 'First paragraph.\n\nSecond paragraph.' },
  { id: 'blk_aaaaaaa4', type: 'text', text: 'Supercalifragilisticexpialidocious'.repeat(4) },
  { id: 'blk_aaaaaaa5', type: 'image', src: 'images/water-cycle.svg', alt: 'Water cycle drawing' },
];

const fullCourse: LoadedCourse = {
  card: { state: 'ready', value: { id: ID, title: 'General Science', order: 1 } },
  overview: { state: 'ready', value: blocks },
  content: { state: 'ready', value: blocks },
  test: { state: 'empty' },
};

const emptyCourse: LoadedCourse = {
  card: { state: 'ready', value: { id: ID, title: 'Empty Course', order: 2 } },
  overview: { state: 'empty' },
  content: { state: 'empty' },
  test: { state: 'empty' },
};

const originalWidth = window.innerWidth;

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

function renderReader(section: ReaderSection) {
  render(
    <MemoryRouter initialEntries={[`/course/${ID}`]}>
      <Routes>
        <Route path="/course/:courseId" element={<ReaderScreen section={section} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadMock.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  setWindowWidth(originalWidth);
  window.localStorage.clear();
});

describe.each([360, 768, 1366])('reader layout at %i px', (width) => {
  it.each<ReaderSection>(['overview', 'content'])(
    '%s: one checked block list with one child per block, no sideways scroll, no overlap',
    async (section) => {
      loadMock.mockResolvedValue(fullCourse);
      setWindowWidth(width);
      renderReader(section);
      await screen.findByRole('heading', { level: 1 });
      const lists = document.querySelectorAll('[data-np-check]');
      expect(lists).toHaveLength(1);
      expect(lists[0].children).toHaveLength(blocks.length);
      expect(runLayoutCheck()).toEqual([]);
    },
  );

  it('the largest font size keeps the same checked list and passes the check', async () => {
    window.localStorage.setItem('np.reader.fontScale', '2');
    loadMock.mockResolvedValue(fullCourse);
    setWindowWidth(width);
    renderReader('content');
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelector('.np-reader__area')).toHaveStyle({ fontSize: '2rem' });
    expect(document.querySelectorAll('[data-np-check]')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('"not available" screen has no block list and no sideways scroll', async () => {
    loadMock.mockResolvedValue(emptyCourse);
    setWindowWidth(width);
    renderReader('overview');
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelectorAll('[data-np-check]')).toHaveLength(0);
    expect(runLayoutCheck()).toEqual([]);
  });
});
