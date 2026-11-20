import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntroView } from './IntroView';

afterEach(() => cleanup());

describe('IntroView', () => {
  it('shows the test title, the question count and the rules', () => {
    render(<IntroView title="Fractions quiz" questionCount={10} onStart={() => {}} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Fractions quiz' })).toBeTruthy();
    expect(screen.getByText('10 questions')).toBeTruthy();
    expect(screen.getByText('One question at a time. No timer and no negative marking.')).toBeTruthy();
  });

  it('uses a friendly default title when the test has none or only spaces', () => {
    const { rerender } = render(<IntroView questionCount={5} onStart={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Test yourself' })).toBeTruthy();

    rerender(<IntroView title="   " questionCount={5} onStart={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Test yourself' })).toBeTruthy();
  });

  it('says "1 question" in the singular', () => {
    render(<IntroView questionCount={1} onStart={() => {}} />);

    expect(screen.getByText('1 question')).toBeTruthy();
    expect(screen.queryByText('1 questions')).toBeNull();
  });

  it('is a labelled region named after the title', () => {
    render(<IntroView title="Fractions quiz" questionCount={3} onStart={() => {}} />);

    expect(screen.getByRole('region', { name: 'Fractions quiz' })).toBeTruthy();
  });

  it('calls onStart once when Start is pressed', () => {
    const onStart = vi.fn();
    render(<IntroView questionCount={3} onStart={onStart} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('does not start by itself', () => {
    const onStart = vi.fn();
    render(<IntroView questionCount={3} onStart={onStart} />);

    expect(onStart).not.toHaveBeenCalled();
  });

  it('moves the focus to the heading when it appears', () => {
    render(<IntroView title="Fractions quiz" questionCount={3} onStart={() => {}} />);

    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }));
  });

  it('draws the image as decoration (empty alt) only when an address is given', () => {
    const { container, rerender } = render(<IntroView questionCount={3} onStart={() => {}} />);
    expect(container.querySelector('img')).toBeNull();

    rerender(<IntroView imageSrc="" questionCount={3} onStart={() => {}} />);
    expect(container.querySelector('img')).toBeNull();

    rerender(<IntroView imageSrc="/media/cover.png" questionCount={3} onStart={() => {}} />);
    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('/media/cover.png');
    expect(image?.getAttribute('alt')).toBe('');
  });

  it('shows long titles as plain text without breaking the markup', () => {
    const title = 'A'.repeat(300);
    render(<IntroView title={title} questionCount={3} onStart={() => {}} />);

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(title);
  });
});
