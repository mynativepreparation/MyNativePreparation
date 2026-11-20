import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StarRating } from './StarRating';

const starsOf = (container: HTMLElement) => Array.from(container.querySelectorAll('svg'));
const indexOf = (star: Element) => (star as SVGElement).style.getPropertyValue('--np-star-index');

describe('StarRating: defaults stay as before', () => {
  it('has no motion or tone classes and no per-star style', () => {
    const { container } = render(<StarRating value={3} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('np-stars');
    expect(root).not.toHaveClass('np-stars--animate');
    expect(root).not.toHaveClass('np-stars--star');
    starsOf(container).forEach((star) => expect(indexOf(star)).toBe(''));
  });

  it('still speaks the value and clamps it', () => {
    const { getByRole } = render(<StarRating value={4} />);
    expect(getByRole('img', { name: '4 of 5 stars' })).toBeInTheDocument();
    const high = render(<StarRating value={9} />);
    expect(high.getByRole('img', { name: '5 of 5 stars' })).toBeInTheDocument();
  });
});

describe('StarRating: tone', () => {
  it('"star" adds the star colour class, "accent" does not', () => {
    const star = render(<StarRating value={2} tone="star" />);
    expect(star.container.firstElementChild).toHaveClass('np-stars--star');
    const accent = render(<StarRating value={2} tone="accent" />);
    expect(accent.container.firstElementChild).not.toHaveClass('np-stars--star');
  });

  it('keeps the filled / outline difference, so it is not colour alone', () => {
    const { container } = render(<StarRating value={2} tone="star" />);
    const fills = starsOf(container).map((star) => star.getAttribute('fill'));
    expect(fills).toEqual(['currentColor', 'currentColor', 'none', 'none', 'none']);
  });
});

describe('StarRating: animate', () => {
  it('adds the animate class and numbers only the earned stars 0, 1, 2 ...', () => {
    const { container } = render(<StarRating value={3} animate />);
    expect(container.firstElementChild).toHaveClass('np-stars--animate');
    const stars = starsOf(container);
    expect(stars).toHaveLength(5);
    expect(stars.map(indexOf)).toEqual(['0', '1', '2', '', '']);
  });

  it('numbers nothing when no star was earned', () => {
    const { container } = render(<StarRating value={0} animate />);
    starsOf(container).forEach((star) => expect(indexOf(star)).toBe(''));
  });

  it('numbers all five for a perfect score', () => {
    const { container } = render(<StarRating value={5} animate tone="star" />);
    expect(starsOf(container).map(indexOf)).toEqual(['0', '1', '2', '3', '4']);
  });

  it('keeps the spoken label', () => {
    const { getByRole } = render(<StarRating value={4} animate label="You got 4 stars" />);
    expect(getByRole('img', { name: 'You got 4 stars' })).toBeInTheDocument();
  });
});

describe('StarRating.css', () => {
  const css = readFileSync(join('src', 'core', 'ui', 'StarRating.css'), 'utf8');

  it('uses only motion tokens for the pop and the delay', () => {
    expect(css).toContain('var(--np-motion-slow)');
    expect(css).toContain('var(--np-ease)');
    expect(css).toContain('var(--np-star-index');
    expect(css).toContain('var(--np-motion-medium)');
  });

  it('switches the pop off for reduced motion', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
  });

  it('colours earned stars with the star token', () => {
    expect(css).toContain('var(--np-color-star)');
  });
});
