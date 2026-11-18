import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsScreen } from './SettingsScreen';

describe('SettingsScreen theme selector', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts on System and switches to Dark', () => {
    render(<SettingsScreen />);
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('np.theme')).toBe('dark');
  });
});
