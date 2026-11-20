import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { HomeScreen } from './HomeScreen';
import type { CoursesState } from './useCourses';

// useCourses is mocked: this file tests the SCREEN. The hook is covered in useCourses.test.tsx.
const { hookMock, retryMock } = vi.hoisted(() => ({ hookMock: vi.fn(), retryMock: vi.fn() }));

vi.mock('./useCourses', () => ({ useCourses: hookMock }));

const ID_A = 'crs_aaaaaaaa';
const ID_B = 'crs_bbbbbbbb';
const ID_C = 'crs_cccccccc';

function showing(state: CoursesState) {
  hookMock.mockReturnValue({ state, retry: retryMock });
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/course/:courseId" element={<p>COURSE SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const readyState: CoursesState = {
  status: 'ready',
  courses: [
    { id: ID_A, title: 'General Science', card: { id: ID_A, title: 'General Science', description: 'Physics and more', order: 1 } },
    { id: ID_B, title: 'With Cover', card: { id: ID_B, title: 'With Cover', cover: 'images/cover.webp', order: 2 } },
    { id: ID_C, title: 'Empty Course', card: null },
  ],
};

const cardButton = (title: string) => screen.getByText(title).closest('button') as HTMLButtonElement;

beforeEach(() => {
  hookMock.mockReset();
  retryMock.mockReset();
});

describe('HomeScreen: ready', () => {
  it('shows one card per course, in the order given, with exactly one h1', () => {
    showing(readyState);
    renderHome();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const titles = screen.getAllByRole('listitem').map((item) => item.querySelector('.np-home__title')?.textContent);
    expect(titles).toEqual(['General Science', 'With Cover', 'Empty Course']);
    expect(screen.getByText('Physics and more')).toBeInTheDocument();
  });

  it('tapping an available card opens that course', async () => {
    showing(readyState);
    renderHome();
    fireEvent.click(cardButton('General Science'));
    expect(await screen.findByText('COURSE SCREEN')).toBeInTheDocument();
  });

  it('a course without a usable card is disabled, shows the Gujarati message and cannot be opened', () => {
    showing(readyState);
    renderHome();
    const disabled = cardButton('Empty Course');
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    const noteId = disabled.getAttribute('aria-describedby');
    expect(noteId).toBeTruthy();
    expect(document.getElementById(noteId ?? '')).toHaveTextContent(t('course.unavailable'));
    fireEvent.click(disabled);
    expect(screen.queryByText('COURSE SCREEN')).not.toBeInTheDocument();
    expect(cardButton('General Science')).not.toHaveAttribute('aria-disabled');
  });

  it('a cover is a lazy image whose alt text is the course title; no cover shows no image', () => {
    showing(readyState);
    renderHome();
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    const cover = images[0];
    expect(cover).toHaveAttribute('alt', 'With Cover');
    expect(cover).toHaveAttribute('loading', 'lazy');
    expect(cover?.getAttribute('src')).toContain(`courses/${ID_B}/images/cover.webp`);
  });

  it('shows titles as plain text, never as HTML', () => {
    showing({
      status: 'ready',
      courses: [{ id: ID_A, title: '<b>Bold</b>', card: { id: ID_A, title: '<b>Bold</b>', order: 1 } }],
    });
    renderHome();
    expect(screen.getByText('<b>Bold</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('HomeScreen: other states', () => {
  it('loading: says so for screen readers and shows no course', () => {
    showing({ status: 'loading' });
    renderHome();
    expect(screen.getByRole('status')).toHaveTextContent(t('home.loading'));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('empty: a friendly message', () => {
    showing({ status: 'empty' });
    renderHome();
    expect(screen.getByRole('status')).toHaveTextContent(t('home.empty'));
  });

  it('error: a calm message with Try again that calls retry', () => {
    showing({ status: 'error', reason: 'unavailable' });
    renderHome();
    expect(screen.getByRole('status')).toHaveTextContent(t('home.error.unavailable'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('home.retry') }));
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it('error: a broken manifest has its own text', () => {
    showing({ status: 'error', reason: 'invalid' });
    renderHome();
    expect(screen.getByRole('status')).toHaveTextContent(t('home.error.invalid'));
  });
});
