import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenedImage } from './BlockView';
import { ImageViewer } from './ImageViewer';

// The library itself (touch / mouse zoom) cannot be tested in jsdom, so it is replaced by a simple stand-in.
// These tests check OUR part: the dialog, focus, keys, buttons and scroll lock.
const controls = vi.hoisted(() => ({ zoomIn: vi.fn(), zoomOut: vi.fn(), resetTransform: vi.fn() }));

vi.mock('react-zoom-pan-pinch', async () => {
  const React = await import('react');
  return {
    TransformWrapper: ({ children }: { children: ReactNode | ((c: typeof controls) => ReactNode) }) =>
      typeof children === 'function' ? children(controls) : children,
    TransformComponent: ({ children }: { children: ReactNode }) =>
      React.createElement('div', { 'data-testid': 'stage' }, children),
  };
});

const IMAGE: OpenedImage = { src: '/content/courses/crs-test0001/images/a.svg', alt: 'A drawing' };

afterEach(() => {
  vi.clearAllMocks();
  document.body.style.overflow = '';
});

describe('ImageViewer', () => {
  it('is a modal dialog named after the image, showing the image', () => {
    render(<ImageViewer image={IMAGE} onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog', { name: 'A drawing' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const img = screen.getByAltText('A drawing');
    expect(img).toHaveAttribute('src', IMAGE.src);
  });

  it('has a fallback name when the image has no alt text', () => {
    render(<ImageViewer image={{ ...IMAGE, alt: '' }} onClose={() => undefined} />);
    expect(screen.getByRole('dialog', { name: 'Image viewer' })).toBeInTheDocument();
  });

  it('moves focus to the Close button when it opens', () => {
    render(<ImageViewer image={IMAGE} onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('closes with the Close button and with Esc', () => {
    const onClose = vi.fn();
    render(<ImageViewer image={IMAGE} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('has zoom in, zoom out and reset buttons wired to the library', () => {
    render(<ImageViewer image={IMAGE} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(controls.zoomIn).toHaveBeenCalledTimes(1);
    expect(controls.zoomOut).toHaveBeenCalledTimes(1);
    expect(controls.resetTransform).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab and Shift+Tab inside the dialog', () => {
    render(<ImageViewer image={IMAGE} onClose={() => undefined} />);
    const close = screen.getByRole('button', { name: 'Close' });
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    zoomIn.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus(); // last -> first
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(zoomIn).toHaveFocus(); // first -> last
  });

  it('locks page scrolling while open and restores it afterwards', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = render(<ImageViewer image={IMAGE} onClose={() => undefined} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('returns focus to the element that opened it', () => {
    function Harness() {
      const [image, setImage] = useState<OpenedImage | null>(null);
      return (
        <>
          <button onClick={() => setImage(IMAGE)}>open</button>
          {image && <ImageViewer image={image} onClose={() => setImage(null)} />}
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'open' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});
