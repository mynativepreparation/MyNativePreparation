import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../../core/content/loader';
import { runLayoutCheck } from '../../core/ui';
import { CourseScreen } from './CourseScreen';
import { HomeScreen } from './HomeScreen';
import type { CoursesState } from './useCourses';

// P05 T5: layout guard for Home and Course at 360 / 768 / 1366 px.
// jsdom has no layout engine (every box is 0 x 0), so here this proves the wiring: the card grid and the tile grid carry
// `data-np-check`, hold the expected number of children, and `runLayoutCheck` (the same function the gallery button runs in a
// real browser) reports no problem at each window width. Real pixels are judged in the browser (T6). Light/dark and
// "tokens only" are enforced for every stylesheet by core/ui/styles.test.ts.

const { hookMock, loadMock } = vi.hoisted(() => ({ hookMock: vi.fn(), loadMock: vi.fn() }));

vi.mock('./useCourses', () => ({ useCourses: hookMock }));
vi.mock('../../core/content/loader', () => ({
  loadCourse: loadMock,
  contentUrl: (path: string) => `/content/${path}`,
}));

const ID_A = 'crs_aaaaaaaa';
const ID_B = 'crs_bbbbbbbb';
const ID_C = 'crs_cccccccc';

const homeState: CoursesState = {
  status: 'ready',
  courses: [
    { id: ID_A, title: 'General Science', card: { id: ID_A, title: 'General Science', description: 'Physics and more', order: 1 } },
    { id: ID_B, title: 'With Cover', card: { id: ID_B, title: 'With Cover', cover: 'images/cover.webp', order: 2 } },
    { id: ID_C, title: 'Empty Course', card: null },
  ],
};

const blocks = [{ id: 'blk_aaaaaaaa', type: 'text' as const, text: 'Hello' }];
const testData = {
  id: 'tst_aaaaaaaa',
  questionsPerGame: 1,
  questions: [{ id: 'qst_aaaaaaaa', text: 'Q?', options: ['a', 'b', 'c', 'd'] as [string, string, string, string], correctIndex: 0 as const }],
};

const fullCourse: LoadedCourse = {
  card: { state: 'ready', value: { id: ID_A, title: 'General Science', description: 'Physics and more', order: 1 } },
  overview: { state: 'ready', value: blocks },
  content: { state: 'ready', value: blocks },
  test: { state: 'ready', value: testData },
};

const emptyCourse: LoadedCourse = {
  card: { state: 'ready', value: { id: ID_C, title: 'Empty Course', order: 3 } },
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

function checkedGrid(): Element {
  const groups = document.querySelectorAll('[data-np-check]');
  expect(groups).toHaveLength(1);
  return groups[0] as Element;
}

beforeEach(() => {
  hookMock.mockReset();
  loadMock.mockReset();
});

afterEach(() => {
  setWindowWidth(originalWidth);
});

describe.each([360, 768, 1366])('layout at %i px', (width) => {
  it('Home: the card grid is checked, has one item per course, no sideways scroll, no overlap', () => {
    hookMock.mockReturnValue({ state: homeState, retry: vi.fn() });
    setWindowWidth(width);
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomeScreen />
      </MemoryRouter>,
    );
    expect(checkedGrid().children).toHaveLength(3);
    expect(runLayoutCheck()).toEqual([]);
  });

  it.each([fullCourse, emptyCourse])('Course (case %#): exactly 4 checked tiles, no sideways scroll, no overlap', async (course) => {
    loadMock.mockResolvedValue(course);
    setWindowWidth(width);
    render(
      <MemoryRouter initialEntries={[`/course/${ID_A}`]}>
        <Routes>
          <Route path="/course/:courseId" element={<CourseScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { level: 1 });
    expect(checkedGrid().children).toHaveLength(4);
    expect(runLayoutCheck()).toEqual([]);
  });
});
