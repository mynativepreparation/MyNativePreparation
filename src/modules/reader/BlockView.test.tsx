import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Block } from '../../core/content/types';
import { BlockView } from './BlockView';

const IMG_URL = '/content/courses/crs-test0001/images/a.svg';

const block = (id: string, rest: Omit<Block, 'id'>): Block => ({ id: `blk-${id.padEnd(8, '0')}`, ...rest });

describe('BlockView', () => {
  it('shows title, subtitle and text in the developer\u2019s order', () => {
    const { container } = render(
      <BlockView
        courseId="crs-test0001"
        blocks={[
          block('b1', { type: 'subtitle', text: 'Second' }),
          block('b2', { type: 'title', text: 'First' }),
          block('b3', { type: 'text', text: 'Body' }),
        ]}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(Array.from(root.children).map((c) => c.tagName)).toEqual(['H3', 'H2', 'DIV']);
    expect(screen.getByRole('heading', { level: 2, name: 'First' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Second' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('splits text into paragraphs on blank lines and keeps single line breaks', () => {
    const { container } = render(
      <BlockView
        courseId="crs-test0001"
        blocks={[block('b1', { type: 'text', text: 'One\nstill one\r\n\r\n  \nTwo' })]}
      />,
    );
    const paragraphs = Array.from(container.querySelectorAll('p')).map((p) => p.textContent);
    expect(paragraphs).toEqual(['One\nstill one', 'Two']);
  });

  it('shows text as plain text, never as HTML', () => {
    const { container } = render(
      <BlockView
        courseId="crs-test0001"
        blocks={[
          block('b1', { type: 'text', text: '<b>bold</b><script>alert(1)</script>' }),
          block('b2', { type: 'title', text: '<i>title</i>' }),
        ]}
      />,
    );
    expect(container.querySelector('b, i, script')).toBeNull();
    expect(screen.getByText('<b>bold</b><script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('<i>title</i>');
  });

  it('skips parts that are missing or empty and renders nothing for no blocks', () => {
    const { container, rerender } = render(
      <BlockView
        courseId="crs-test0001"
        blocks={[
          block('b1', { type: 'title' }),
          block('b2', { type: 'subtitle', text: '   ' }),
          block('b3', { type: 'text', text: '\n\n  \n' }),
          block('b4', { type: 'image' }),
        ]}
      />,
    );
    expect(container.firstElementChild?.children).toHaveLength(0);
    rerender(<BlockView courseId="crs-test0001" blocks={[]} />);
    expect(container.firstElementChild?.children).toHaveLength(0);
  });

  it('shows an image lazily with its alt text and the course-folder URL', () => {
    render(
      <BlockView
        courseId="crs-test0001"
        blocks={[block('b1', { type: 'image', src: 'images/a.svg', alt: 'A drawing' })]}
      />,
    );
    const img = screen.getByAltText('A drawing');
    expect(img).toHaveAttribute('src', IMG_URL);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(screen.queryByRole('button')).toBeNull(); // not tappable without onOpenImage
  });

  it('makes the image a button that reports its URL and alt text when tapped', () => {
    const onOpenImage = vi.fn();
    render(
      <BlockView
        courseId="crs-test0001"
        onOpenImage={onOpenImage}
        blocks={[block('b1', { type: 'image', src: 'images/a.svg', alt: 'A drawing' })]}
      />,
    );
    const button = screen.getByRole('button', { name: 'Open image: A drawing' });
    fireEvent.click(button);
    expect(onOpenImage).toHaveBeenCalledWith({ src: IMG_URL, alt: 'A drawing' });
  });

  it('names the button "Open image" when the image has no alt text', () => {
    render(
      <BlockView
        courseId="crs-test0001"
        onOpenImage={() => undefined}
        blocks={[block('b1', { type: 'image', src: 'images/a.svg', alt: '' })]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Open image' })).toBeInTheDocument();
  });
});
