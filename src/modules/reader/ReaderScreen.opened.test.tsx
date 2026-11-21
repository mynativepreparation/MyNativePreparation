import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../../core/content/loader';
import { t } from '../../core/i18n';
import readerModule from './index';

// P08 T4: opening the Overview or the Content records "course opened" (the report counts it).
// The loader, the repository and the zoom library are replaced: this file only tests that call.
const { courseMock, openedMock } = vi.hoisted(() => ({ courseMock: vi.fn(), openedMock: vi.fn() }));

vi.mock('../../core/content/loader', () => ({
  loadCourse: courseMock,
  contentUrl: (path: string) => `/content/${path}`,
}));

vi.mock('../../core/storage/repo', () => ({ markCourseOpened: openedMock }));

vi.mock('react-zoom-pan-pinch', async () => {
  const React = await import('react');
  const controls = { zoomIn: () => undefined, zoomOut: () => undefined, resetTransform: () => undefined };
  return {
    TransformWrapper: ({ children }: { children: ReactNode | ((c: typeof controls) => ReactNode) }) =>
      typeof children === 'function' ? children(controls) : children,
    TransformComponent: ({ children }: { children: ReactNode }) => React.createElement('div', null, children),
  };
});

const ID = 'crs-test0001';

const fullCourse: LoadedCourse = {
  card: { state: 'ready', value: { id: ID, title: 'General Science', order: 1 } },
  overview: { state: 'ready', value: [{ id: 'blk-ov000001', type: 'text', text: 'Overview body' }] },
  content: { state: 'ready', value: [{ id: 'blk-ct000001', type: 'text', text: 'Content body' }] },
  test: { state: 'empty' },
};

function renderAt(path: string) {
  const router = createMemoryRouter(
    [...readerModule.routes, { path: 'course/:courseId', element: <p>COURSE SCREEN</p> }],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  courseMock.mockReset();
  courseMock.mockResolvedValue(fullCourse);
  openedMock.mockReset();
  openedMock.mockResolvedValue(undefined);
});

describe('ReaderScreen: records "opened"', () => {
  it('records the course when the Overview is shown', async () => {
    renderAt(`/course/${ID}/overview`);
    await screen.findByText('Overview body');
    expect(openedMock).toHaveBeenCalledTimes(1);
    expect(openedMock).toHaveBeenCalledWith(ID);
  });

  it('records the course when the Content is shown', async () => {
    renderAt(`/course/${ID}/content`);
    await screen.findByText('Content body');
    expect(openedMock).toHaveBeenCalledTimes(1);
    expect(openedMock).toHaveBeenCalledWith(ID);
  });

  it('records nothing when the section is empty (nothing was opened)', async () => {
    courseMock.mockResolvedValue({ ...fullCourse, overview: { state: 'empty' } } satisfies LoadedCourse);
    renderAt(`/course/${ID}/overview`);
    // The title heading appears in the "not available" state too, and only after the data has been handled.
    await screen.findByRole('heading', { level: 1, name: t('course.tile.overview') });
    expect(openedMock).not.toHaveBeenCalled();
  });

  it('records nothing for an unknown course', async () => {
    courseMock.mockResolvedValue({ ...fullCourse, card: { state: 'empty' } } satisfies LoadedCourse);
    renderAt(`/course/${ID}/content`);
    await screen.findByRole('heading', { level: 1, name: t('course.tile.content') });
    expect(openedMock).not.toHaveBeenCalled();
  });

  it('keeps reading when the record cannot be saved (locked store, no database)', async () => {
    openedMock.mockRejectedValue(new Error('locked'));
    renderAt(`/course/${ID}/overview`);
    expect(await screen.findByText('Overview body')).toBeInTheDocument();
    expect(openedMock).toHaveBeenCalledWith(ID);
  });
});
