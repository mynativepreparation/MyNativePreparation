import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { SettingsScreen } from './SettingsScreen';

// P09 T5: the final order of the Settings screen, and that every card is there. The behaviour of each card is tested in its
// own file (ProfileCard, UpdateCard, AboutCard, ...). getProfile is mocked, so no real encrypted storage is used here.
const { getProfileMock } = vi.hoisted(() => ({ getProfileMock: vi.fn() }));

vi.mock('../../core/storage/repo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getProfile: getProfileMock,
}));

// SPEC C7 / P09 Goal: Profile, Theme, Fingerprint, PIN, Passphrase information (+ Log out), Update app, About.
const CARD_TITLES = [
  t('profile.title'),
  t('settings.theme'),
  t('fingerprint.card.title'),
  t('pin.card.title'),
  t('passphrase.title'),
  t('update.title'),
  t('about.title'),
];

const cardHeading = (title: string) => screen.getByRole('heading', { level: 2, name: title });

// compareDocumentPosition gives exactly FOLLOWING when `later` comes after `earlier` and neither contains the other.
function expectBefore(earlier: HTMLElement, later: HTMLElement) {
  expect(earlier.compareDocumentPosition(later)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(() => {
  getProfileMock.mockReset();
});

describe('SettingsScreen: card order', () => {
  it('shows all seven cards in the final order', async () => {
    getProfileMock.mockResolvedValue(undefined);
    render(<SettingsScreen />);
    await screen.findByLabelText(t('info.name'));

    const headings = CARD_TITLES.map(cardHeading);
    expect(headings).toHaveLength(7);
    for (let i = 1; i < headings.length; i++) {
      expectBefore(headings[i - 1], headings[i]);
    }
  });

  it('keeps the Log out button inside the passphrase card, before the Update app card', async () => {
    getProfileMock.mockResolvedValue(undefined);
    render(<SettingsScreen />);
    await screen.findByLabelText(t('info.name'));

    const logout = screen.getByRole('button', { name: t('passphrase.logout') });
    expectBefore(cardHeading(t('passphrase.title')), logout);
    expectBefore(logout, cardHeading(t('update.title')));
  });
});

describe('SettingsScreen: each card loads on its own', () => {
  it('shows every card at once while the profile is still loading', () => {
    getProfileMock.mockReturnValue(new Promise(() => undefined));
    render(<SettingsScreen />);

    for (const title of CARD_TITLES) {
      expect(cardHeading(title)).toBeInTheDocument();
    }
    expect(screen.getByText(t('profile.loading'))).toBeInTheDocument();
    expect(screen.queryByLabelText(t('info.name'))).not.toBeInTheDocument();
  });

  it('still shows every card when the profile cannot be read, with a Try again button on the profile card', async () => {
    getProfileMock.mockRejectedValue(new Error('cannot read'));
    render(<SettingsScreen />);

    expect(await screen.findByRole('button', { name: t('profile.retry') })).toBeInTheDocument();
    for (const title of CARD_TITLES) {
      expect(cardHeading(title)).toBeInTheDocument();
    }
  });
});
