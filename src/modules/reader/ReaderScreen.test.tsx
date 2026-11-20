import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../../core/content/loader';
import type { Block } from '../../core/content/types';
import { t } from '../../core/i18n';
import { FONT_SCALE_KEY } from './useFontScale';
import readerModule from './index';

// The loader and the zoom library are replaced: this file tests the screen (states, font size, opening an image).
const { courseMock } = vi.hoisted(() => ({ courseMock: vi.fn() }));

vi.mock('../../core/content/loader', () => ({
  loadCourse: courseMock,
  contentUrl: (path: string) => `/content/${path}`,
}));

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
const overviewBlocks: Block[] = [
  { id: 'blk-ov000001', type: 'title', text: 'Overview heading' },
  { id: 'blk-ov000002', type: 'text', text: 'Overview body' },
];
const contentBlocks: Block[] = [
  { id: 'blk-ct000001', type: 'text', text: 'Content body' },
  { id: 'blk-ct000002', type: 'image', src: 'images/a.svg', alt: 'A drawing' },
];

const fullCourse: LoadedCourse = {
  card: { state: 'ready', value: { id: ID, title: 'General Science', order: 1 } },
  overview: { state: 'ready', value: overviewBlocks },
  content: { state: 'ready', value: contentBlocks },
  test: { state: 'empty' },
};

function renderAt(path: string) {
  const router = createMemoryRouter(
    [...readerModule.routes, { path: 'course/:courseId', element: <p>COURSE SCREEN</p> }],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

const area = () => document.querySelector('.np-reader__area') as HTMLElement;

beforeEach(() => {
  courseMock.mockReset();
  courseMock.mockResolvedValue(fullCourse);
});

afterEach(() => {
  window.localStorage.clear();
});

describe('ReaderScreen: ready data', () => {
  it('shows the overview blocks with the section name and the course title', async () => {
    renderAt(`/course/${ID}/overview`);
    expect(await screen.findByRole('heading', { level: 1, name: t('course.tile.overview') })).toBeInTheDocument();
    expect(screen.getByText('General Science')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Overview heading' })).toBeInTheDocument();
    expect(screen.getByText('Overview body')).toBeInTheDocument();
    expect(courseMock).toHaveBeenCalledWith(ID);
  });

  it('shows the content blocks on the content route', async () => {
    renderAt(`/course/${ID}/content`);
    expect(await screen.findByRole('heading', { level: 1, name: t('course.tile.content') })).toBeInTheDocument();
    expect(screen.getByText('Content body')).toBeInTheDocument();
    expect(screen.queryByText('Overview body')).toBeNull();
  });

  it('Back returns to the course', async () => {
    renderAt(`/course/${ID}/overview`);
    await screen.findByText('Overview body');
    fireEvent.click(screen.getByRole('button', { name: t('course.backToCourse') }));
    expect(await screen.findByText('COURSE SCREEN')).toBeInTheDocument();
  });

  it('shows a loading status first', () => {
    courseMock.mockReturnValue(new Promise(() => undefined));
    renderAt(`/course/${ID}/overview`);
    expect(screen.getByRole('status')).toHaveTextContent(t('course.loading'));
  });
});

const unavailableCases: [string, LoadedCourse][] = [
  ['an empty section', { ...fullCourse, overview: { state: 'empty' } }],
  ['a broken section', { ...fullCourse, overview: { state: 'invalid', errors: ['bad'] } }],
  ['a section with no blocks', { ...fullCourse, overview: { state: 'ready', value: [] } }],
  ['an unknown course', { ...fullCourse, card: { state: 'empty' } }],
];

describe('ReaderScreen: not available (SPEC C3)', () => {
  it.each(unavailableCases)('%s shows the owner\u2019s text and Back', async (_name, loaded) => {
    courseMock.mockResolvedValue(loaded);
    renderAt(`/course/${ID}/overview`);
    expect(await screen.findByText(t('course.unavailable'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: t('course.tile.overview') })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: t('reader.font.group') })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('course.backToCourse') }));
    expect(await screen.findByText('COURSE SCREEN')).toBeInTheDocument();
  });

  it('a load error does not crash the screen', async () => {
    courseMock.mockRejectedValue(new Error('network'));
    renderAt(`/course/${ID}/content`);
    expect(await screen.findByText(t('course.unavailable'))).toBeInTheDocument();
  });
});

describe('ReaderScreen: font size', () => {
  it('starts at 1rem and A+ / A- change it', async () => {
    renderAt(`/course/${ID}/overview`);
    await screen.findByText('Overview body');
    expect(area().style.fontSize).toBe('1rem');
    fireEvent.click(screen.getByRole('button', { name: t('reader.font.larger') }));
    expect(area().style.fontSize).toBe('1.1rem');
    fireEvent.click(screen.getByRole('button', { name: t('reader.font.smaller') }));
    fireEvent.click(screen.getByRole('button', { name: t('reader.font.smaller') }));
    expect(area().style.fontSize).toBe('0.9rem');
  });

  it('a two-finger pinch on the text changes it', async () => {
    renderAt(`/course/${ID}/overview`);
    await screen.findByText('Overview body');
    fireEvent.pointerDown(area(), { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerDown(area(), { pointerId: 2, clientX: 100, clientY: 0 });
    fireEvent.pointerMove(area(), { pointerId: 2, clientX: 150, clientY: 0 });
    expect(area().style.fontSize).toBe('1.5rem');
  });

  it('starts from the remembered size', async () => {
    window.localStorage.setItem(FONT_SCALE_KEY, '1.3');
    renderAt(`/course/${ID}/overview`);
    await screen.findByText('Overview body');
    expect(area().style.fontSize).toBe('1.3rem');
  });
});

describe('ReaderScreen: images', () => {
  it('opens the full-screen viewer on tap and closes it again', async () => {
    renderAt(`/course/${ID}/content`);
    const button = await screen.findByRole('button', { name: 'Open image: A drawing' });
    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: 'A drawing' });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector('img')).toHaveAttribute('src', `/content/courses/${ID}/images/a.svg`);
    fireEvent.click(screen.getByRole('button', { name: t('reader.viewer.close') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('closes the viewer with Esc', async () => {
    renderAt(`/course/${ID}/content`);
    fireEvent.click(await screen.findByRole('button', { name: 'Open image: A drawing' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
