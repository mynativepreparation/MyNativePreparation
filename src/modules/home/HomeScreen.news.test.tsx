import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t, tf } from '../../core/i18n';
import { runLayoutCheck } from '../../core/ui';
import { HomeScreen } from './HomeScreen';
import type { CoursesState } from './useCourses';

// The "new or updated courses" line on Home (P11 T8 step c). useCourses and useContentSync are mocked: this file tests how the SCREEN shows
// the note. The hooks are covered in useCourses.refresh.test.tsx and useContentSync.test.tsx. jsdom has no layout engine, so the width
// check proves the wiring (the same function the gallery button runs in a real browser reports no problem), like layout.test.tsx.

const { coursesMock, syncMock, refreshMock, dismissMock } = vi.hoisted(() => ({
  coursesMock: vi.fn(),
  syncMock: vi.fn(),
  refreshMock: vi.fn(),
  dismissMock: vi.fn(),
}));

vi.mock('./useCourses', () => ({ useCourses: coursesMock }));
vi.mock('./useContentSync', () => ({ useContentSync: syncMock }));

const ID_A = 'crs_aaaaaaaa';
const ID_B = 'crs_bbbbbbbb';

const readyState: CoursesState = {
  status: 'ready',
  courses: [
    { id: ID_A, title: 'General Science', card: { id: ID_A, title: 'General Science', description: 'Physics and more', order: 1 } },
    { id: ID_B, title: 'With Cover', card: { id: ID_B, title: 'With Cover', cover: 'images/cover.webp', order: 2 } },
  ],
};

const originalWidth = window.innerWidth;

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

function renderHome(note: { count: number } | null) {
  coursesMock.mockReturnValue({ state: readyState, retry: vi.fn(), refresh: refreshMock });
  syncMock.mockReturnValue({ note, dismiss: dismissMock });
  return render(
    <MemoryRouter>
      <HomeScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  coursesMock.mockReset();
  syncMock.mockReset();
  refreshMock.mockReset();
  dismissMock.mockReset();
});

afterEach(() => {
  setWindowWidth(originalWidth);
});

describe('HomeScreen: the news line', () => {
  it('is not there when nothing is new', () => {
    renderHome(null);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('home.news.dismiss') })).not.toBeInTheDocument();
  });

  it('gives the sync hook the reload function of the course list', () => {
    renderHome(null);
    expect(syncMock).toHaveBeenCalledWith(refreshMock);
  });

  it('says how many courses are new or updated, as a calm status line (not an alert)', () => {
    renderHome({ count: 2 });
    expect(screen.getByRole('status')).toHaveTextContent(tf('home.news', { count: 2 }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('has a Dismiss button that calls dismiss', () => {
    renderHome({ count: 1 });
    fireEvent.click(screen.getByRole('button', { name: t('home.news.dismiss') }));
    expect(dismissMock).toHaveBeenCalledTimes(1);
  });

  it('sits between the intro and the course list, and the courses stay on screen', () => {
    renderHome({ count: 1 });
    const intro = screen.getByText(t('home.intro'));
    const line = screen.getByRole('status');
    const list = screen.getByRole('list');
    expect(intro.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe.each([360, 768, 1366])('HomeScreen news line at %i px', (width) => {
  it('keeps the card grid checked and reports no sideways scroll and no overlap', () => {
    setWindowWidth(width);
    renderHome({ count: 12 });
    const groups = document.querySelectorAll('[data-np-check]');
    expect(groups).toHaveLength(1);
    expect((groups[0] as Element).children).toHaveLength(2);
    expect(runLayoutCheck()).toEqual([]);
  });
});
