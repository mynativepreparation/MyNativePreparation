import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { t, type TextKey } from '../../core/i18n';
import { runLayoutCheck } from '../../core/ui';
import type { UpdateWorker } from '../../core/update/checkForUpdate';
import { resetUpdateState, setUpdateState } from '../../core/update/updateStore';
import { SettingsScreen } from './SettingsScreen';

// P09 T6: layout, keyboard and motion guard for the Settings screen at 360 / 768 / 1366 px.
// jsdom has no layout engine (every box is 0 x 0), so this proves the wiring: every card renders at every window width, a very
// long Gujarati profile reaches the page in full, the groups that must never overlap carry `data-np-check`, and
// `runLayoutCheck` (the function the gallery button runs in a real browser) reports no problem in each Profile and Update
// state. The CSS rules that make long words wrap are checked on the stylesheet text. Real pixels are judged by the owner (T7).
// Light/dark and "tokens only" are enforced for every stylesheet by core/ui/styles.test.ts. The card logic has its own tests
// (ProfileCard, UpdateCard, AboutCard) and the order is in SettingsScreen.order.test.tsx.

const { getProfileMock, saveProfileMock } = vi.hoisted(() => ({ getProfileMock: vi.fn(), saveProfileMock: vi.fn() }));

vi.mock('../../core/storage/repo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getProfile: getProfileMock,
  saveProfile: saveProfileMock,
}));

const LONG_NAME = 'નીલકંઠેશ્વર મહાદેવપ્રસાદ ત્રિભુવનદાસ પટેલ ઠાકોરભાઈ';
const LONG_EMAIL = 'nilkantheshwar.mahadevprasad.patel@very-long-school-name.example.org';
const LONG_PHONE = '+91 98765 43210';
const PROFILE = { name: LONG_NAME, email: LONG_EMAIL, phone: LONG_PHONE };

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

interface FakeRegistration {
  installing: UpdateWorker | null;
  waiting: UpdateWorker | null;
  update: Mock<() => Promise<unknown>>;
}

function makeRegistration(update: () => Promise<unknown> = () => Promise.resolve()): FakeRegistration {
  return { installing: null, waiting: null, update: vi.fn<() => Promise<unknown>>(update) };
}

function setOnline(online: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online);
}

const originalWidth = window.innerWidth;

function setWidthValue(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

function setWindowWidth(width: number) {
  setWidthValue(width);
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const cardHeading = (title: string) => screen.getByRole('heading', { level: 2, name: title });

function settingsStack(): HTMLElement {
  const stack = document.querySelector<HTMLElement>('.np-settings__stack');
  if (!stack) throw new Error('The settings stack was not found.');
  return stack;
}

/** The controls a keyboard user can reach with Tab, in document order. */
function focusable(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'),
  ).filter((el) => !(el as HTMLButtonElement).disabled && el.getAttribute('tabindex') !== '-1');
}

async function showSettings() {
  getProfileMock.mockResolvedValue(PROFILE);
  render(<SettingsScreen />);
  await screen.findByLabelText(t('info.name'));
}

beforeEach(() => {
  getProfileMock.mockReset();
  saveProfileMock.mockReset();
  saveProfileMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetUpdateState();
  setWidthValue(originalWidth);
});

interface UpdateScenario {
  name: string;
  text: TextKey;
  press: boolean;
  arrange: () => void;
}

// Every message of the Update app card. `press` = the person taps "Check for updates" first.
const UPDATE_SCENARIOS: UpdateScenario[] = [
  {
    name: 'offline',
    text: 'update.offline',
    press: true,
    arrange: () => {
      setOnline(false);
      setUpdateState({ registration: makeRegistration() });
    },
  },
  {
    name: 'latest version',
    text: 'update.latest',
    press: true,
    arrange: () => {
      setOnline(true);
      setUpdateState({ registration: makeRegistration() });
    },
  },
  {
    name: 'check failed',
    text: 'update.error',
    press: true,
    arrange: () => {
      setOnline(true);
      setUpdateState({ registration: makeRegistration(() => Promise.reject(new Error('network'))) });
    },
  },
  {
    name: 'no service worker',
    text: 'update.unsupported',
    press: true,
    arrange: () => {
      setOnline(true);
    },
  },
  {
    name: 'new version ready',
    text: 'update.ready',
    press: false,
    arrange: () => {
      setOnline(true);
      setUpdateState({
        registration: makeRegistration(),
        needRefresh: true,
        apply: vi.fn(() => Promise.resolve()),
      });
    },
  },
];

describe.each([360, 768, 1366])('settings screen layout at %i px', (width) => {
  it('all seven cards, a very long Gujarati profile in full, marked groups, no sideways scroll, no overlap', async () => {
    setWindowWidth(width);
    await showSettings();

    expect(screen.getByLabelText(t('info.name'))).toHaveValue(LONG_NAME);
    expect(screen.getByLabelText(t('info.email'))).toHaveValue(LONG_EMAIL);
    expect(screen.getByLabelText(t('info.phone'))).toHaveValue(LONG_PHONE);

    // The groups whose children must never overlap are marked for runLayoutCheck, and hold what we expect.
    const stack = settingsStack();
    expect(stack).toHaveAttribute('data-np-check');
    const owners = CARD_TITLES.map((title) => Array.from(stack.children).find((child) => child.contains(cardHeading(title))));
    expect(owners.every((owner) => owner !== undefined)).toBe(true);
    expect(new Set(owners).size).toBe(CARD_TITLES.length);
    expect(screen.getByRole('group', { name: t('settings.theme') })).toHaveAttribute('data-np-check');

    expect(runLayoutCheck()).toEqual([]);
  });

  it('profile cannot be read: the friendly text and Try again, the other cards stay, no overlap', async () => {
    setWindowWidth(width);
    getProfileMock.mockRejectedValue(new Error('cannot read'));
    render(<SettingsScreen />);

    expect(await screen.findByRole('button', { name: t('profile.retry') })).toBeInTheDocument();
    expect(document.body.textContent).toContain(t('profile.loadFailed'));
    for (const title of CARD_TITLES) {
      expect(cardHeading(title)).toBeInTheDocument();
    }
    expect(runLayoutCheck()).toEqual([]);
  });

  it('profile saved: the long details are written as typed and the message shows, no overlap', async () => {
    setWindowWidth(width);
    await showSettings();
    fireEvent.click(button(t('profile.save')));

    await waitFor(() => expect(document.body.textContent).toContain(t('profile.saved')));
    expect(saveProfileMock).toHaveBeenCalledTimes(1);
    expect(saveProfileMock).toHaveBeenCalledWith(PROFILE);
    expect(runLayoutCheck()).toEqual([]);
  });

  it.each(UPDATE_SCENARIOS)('update card, $name: its message shows, no overlap', async ({ arrange, text, press }) => {
    setWindowWidth(width);
    arrange();
    await showSettings();
    if (press) fireEvent.click(button(t('update.check')));

    await waitFor(() => expect(document.body.textContent).toContain(t(text)));
    if (text === 'update.ready') {
      expect(button(t('update.now'))).toBeInTheDocument();
    }
    expect(runLayoutCheck()).toEqual([]);
  });
});

describe('settings screen keyboard', () => {
  it('Tab order follows the reading order: profile fields and Save, theme, Log out, Update app', async () => {
    await showSettings();
    const anchors = [
      screen.getByLabelText(t('info.name')),
      screen.getByLabelText(t('info.email')),
      screen.getByLabelText(t('info.phone')),
      button(t('profile.save')),
      button(t('theme.system')),
      button(t('theme.light')),
      button(t('theme.dark')),
      button(t('passphrase.logout')),
      button(t('update.check')),
    ];
    const order = focusable();
    const positions = anchors.map((el) => order.indexOf(el));
    expect(positions).not.toContain(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    document.querySelectorAll('[tabindex]').forEach((el) => {
      expect(Number(el.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    });
  });

  it('every control can take the focus', async () => {
    await showSettings();
    focusable().forEach((el) => {
      el.focus();
      expect(document.activeElement).toBe(el);
    });
  });

  it('profile cannot be read: Try again comes first, before the theme buttons', async () => {
    getProfileMock.mockRejectedValue(new Error('cannot read'));
    render(<SettingsScreen />);
    const retry = await screen.findByRole('button', { name: t('profile.retry') });
    const order = focusable();
    expect(order.indexOf(retry)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(retry)).toBeLessThan(order.indexOf(button(t('theme.system'))));
  });
});

describe('settings screen motion and wrapping (stylesheet rules)', () => {
  const dir = join('src', 'modules', 'settings');
  const sheet = (file: string): string => readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  // The declarations of every rule whose selector list contains `selector` (a rule may share its body with other selectors).
  const declarationsOf = (css: string, selector: string): string =>
    css
      .split('}')
      .map((rule) => rule.split('{'))
      .filter(([selectors]) => selectors.split(',').some((s) => s.trim() === selector))
      .map(([, body]) => body)
      .join(' ');

  it.each(['SettingsScreen.css', 'ProfileCard.css', 'UpdateCard.css', 'AboutCard.css'])(
    '%s adds no animation of its own and every transition uses motion tokens (base.css turns them off for reduced motion)',
    (file) => {
      const css = sheet(file);
      expect(css).not.toMatch(/@keyframes|animation/);
      (css.match(/transition[a-z-]*\s*:[^;]+;/g) ?? []).forEach((declaration) => {
        expect(declaration).toMatch(/none|var\(--np-/);
      });
    },
  );

  it.each([
    ['ProfileCard.css', '.np-profile__body'],
    ['ProfileCard.css', '.np-profile__loading'],
    ['ProfileCard.css', '.np-profile__error'],
    ['ProfileCard.css', '.np-profile__status'],
    ['UpdateCard.css', '.np-update__body'],
    ['UpdateCard.css', '.np-update__status'],
    ['AboutCard.css', '.np-about__name'],
    ['AboutCard.css', '.np-about__text'],
    ['AboutCard.css', '.np-about__heading'],
  ])('%s: %s lets a very long word wrap instead of overflowing', (file, selector) => {
    expect(declarationsOf(sheet(file), selector)).toContain('overflow-wrap: anywhere');
  });

  it('the cards stack with a token gap, and the theme buttons and Update buttons wrap on a narrow screen', () => {
    expect(declarationsOf(sheet('SettingsScreen.css'), '.np-settings__stack')).toMatch(/gap:\s*var\(--np-space/);
    expect(declarationsOf(sheet('SettingsScreen.css'), '.np-settings__modes')).toContain('flex-wrap: wrap');
    expect(declarationsOf(sheet('UpdateCard.css'), '.np-update__actions')).toContain('flex-wrap: wrap');
  });
});
