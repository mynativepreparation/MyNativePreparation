import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../core/i18n';
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

describe('SettingsScreen fingerprint card', () => {
  it('shows the fingerprint lock card (its toggle logic is tested in FingerprintCard.test.tsx)', () => {
    render(<SettingsScreen />);
    expect(screen.getByRole('heading', { level: 2, name: t('fingerprint.card.title') })).toBeInTheDocument();
  });
});

describe('SettingsScreen PIN card', () => {
  it('shows the PIN lock card (its toggle logic is tested in PinCard.test.tsx)', () => {
    render(<SettingsScreen />);
    expect(screen.getByRole('heading', { level: 2, name: t('pin.card.title') })).toBeInTheDocument();
  });
});

describe('SettingsScreen passphrase card', () => {
  it('shows the passphrase information card with the Log out button (the real Settings screen is P09)', () => {
    render(<SettingsScreen />);
    expect(screen.getByRole('heading', { level: 2, name: t('passphrase.title') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('passphrase.logout') })).toBeInTheDocument();
  });
});
