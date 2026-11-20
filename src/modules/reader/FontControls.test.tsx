import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FontControls } from './FontControls';

describe('FontControls', () => {
  it('shows the size as a percentage and has two named buttons in a group', () => {
    render(<FontControls scale={1.2} onDecrease={() => undefined} onIncrease={() => undefined} />);
    expect(screen.getByRole('group', { name: 'Text size' })).toBeInTheDocument();
    expect(screen.getByText('120%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Smaller text' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Larger text' })).toBeEnabled();
  });

  it('calls the right handler for each button', () => {
    const onDecrease = vi.fn();
    const onIncrease = vi.fn();
    render(<FontControls scale={1} onDecrease={onDecrease} onIncrease={onIncrease} />);
    fireEvent.click(screen.getByRole('button', { name: 'Smaller text' }));
    expect(onDecrease).toHaveBeenCalledTimes(1);
    expect(onIncrease).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(onIncrease).toHaveBeenCalledTimes(1);
  });

  it('disables A- at the smallest size and A+ at the largest', () => {
    const { rerender } = render(<FontControls scale={0.8} onDecrease={() => undefined} onIncrease={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Smaller text' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Larger text' })).toBeEnabled();
    rerender(<FontControls scale={2} onDecrease={() => undefined} onIncrease={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Smaller text' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Larger text' })).toBeDisabled();
  });
});
