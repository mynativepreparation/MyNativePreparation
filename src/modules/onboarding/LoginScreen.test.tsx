import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t, tf } from '../../core/i18n';
import { LoginScreen } from './LoginScreen';

// unlock and markOnboarded are mocked: this file tests the SCREEN. The real key check is covered in core/identity/session.test.ts
// and the real onboarded flag in core/identity/status.test.ts.
const { unlockMock, markOnboardedMock } = vi.hoisted(() => ({ unlockMock: vi.fn(), markOnboardedMock: vi.fn() }));

vi.mock('../../core/identity/session', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  unlock: unlockMock,
}));
vi.mock('../../core/identity/status', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  markOnboarded: markOnboardedMock,
}));

// Official BIP39 test phrase (valid) and two broken variants. They are test data only.
const VALID = `${'abandon '.repeat(11)}about`;
const BAD_CHECKSUM = 'abandon '.repeat(12).trim();
const UNKNOWN_AT_12 = `${'abandon '.repeat(11)}zzzzzz`;

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/welcome" element={<p>WELCOME SCREEN</p>} />
        <Route path="/" element={<p>HOME SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const field = () => screen.getByLabelText(t('login.label'));
const loginButton = () => screen.getByRole('button', { name: t('login.button') });
const type = (value: string) => fireEvent.change(field(), { target: { value } });

beforeEach(() => {
  unlockMock.mockReset();
  markOnboardedMock.mockReset();
  unlockMock.mockResolvedValue({ status: 'ok', persisted: true });
  markOnboardedMock.mockResolvedValue(undefined);
});

describe('LoginScreen: layout', () => {
  it('has one heading, the intro, one multi-line field and two buttons', () => {
    renderLogin();
    expect(screen.getByRole('heading', { level: 1, name: t('login.title') })).toBeInTheDocument();
    expect(screen.getByText(t('login.intro'))).toBeInTheDocument();
    expect(field().tagName).toBe('TEXTAREA');
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('keeps the words private from the browser: no autofill, no spell check, no auto capital', () => {
    renderLogin();
    expect(field()).toHaveAttribute('autocomplete', 'off');
    expect(field()).toHaveAttribute('autocapitalize', 'off');
    expect(field()).toHaveAttribute('spellcheck', 'false');
  });

  it('shows no message before anything is typed', () => {
    renderLogin();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('LoginScreen: live messages', () => {
  it('says how many words it found when there are not 12', () => {
    renderLogin();
    type('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon');
    expect(screen.getByRole('status')).toHaveTextContent('This looks like 11 words, we need 12.');
  });

  it('uses the singular text for one word', () => {
    renderLogin();
    type('abandon');
    expect(screen.getByRole('status')).toHaveTextContent(t('login.wrongCountOne'));
  });

  it('names the position (never the word) of a word that is not on the list', () => {
    renderLogin();
    type(UNKNOWN_AT_12);
    const hint = screen.getByRole('status');
    expect(hint).toHaveTextContent(tf('login.unknownWord', { n: 12 }));
    expect(hint).not.toHaveTextContent('zzzzzz');
  });

  it('explains a phrase with a bad checksum', () => {
    renderLogin();
    type(BAD_CHECKSUM);
    expect(screen.getByRole('status')).toHaveTextContent(t('login.badChecksum'));
  });

  it('shows no message for a valid phrase, also pasted with line breaks, capitals and extra spaces', () => {
    renderLogin();
    type(VALID);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    type(`  ABANDON abandon\nabandon abandon\tabandon abandon\n\nabandon abandon abandon abandon abandon About  `);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(field()).not.toHaveAttribute('aria-invalid');
  });

  it('marks the field invalid while a message is shown and links the message to it', () => {
    renderLogin();
    type('abandon abandon');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAttribute('aria-describedby', 'np-login-message');
    expect(document.getElementById('np-login-message')).toHaveTextContent('This looks like 2 words');
  });
});

describe('LoginScreen: pressing Login', () => {
  it('with an empty field asks for the words and does not call unlock', async () => {
    renderLogin();
    fireEvent.click(loginButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('login.empty'));
    expect(unlockMock).not.toHaveBeenCalled();
  });

  it('with a broken phrase explains the reason (the live message) and goes nowhere', async () => {
    unlockMock.mockResolvedValue({ status: 'invalid_words', problem: 'wrong_count', count: 5 });
    renderLogin();
    type('one two three four five');
    fireEvent.click(loginButton());
    await waitFor(() => expect(loginButton()).toBeEnabled());
    expect(screen.getByRole('status')).toHaveTextContent('This looks like 5 words, we need 12.');
    expect(screen.queryByText('HOME SCREEN')).not.toBeInTheDocument();
    expect(markOnboardedMock).not.toHaveBeenCalled();
  });

  it('with the right words marks the person as onboarded and goes Home', async () => {
    renderLogin();
    type(VALID);
    fireEvent.click(loginButton());
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
    expect(unlockMock).toHaveBeenCalledTimes(1);
    expect(unlockMock).toHaveBeenCalledWith(VALID);
    expect(markOnboardedMock).toHaveBeenCalledTimes(1);
  });

  it('also works with the Enter key (form submit)', async () => {
    renderLogin();
    type(VALID);
    fireEvent.submit(field().closest('form') as HTMLFormElement);
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });

  it('with a wrong key shows the wrong-key message, keeps the typed words and does not mark onboarding', async () => {
    unlockMock.mockResolvedValue({ status: 'wrong_key' });
    renderLogin();
    type(VALID);
    fireEvent.click(loginButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('login.wrongKey'));
    expect(field()).toHaveValue(VALID);
    expect(markOnboardedMock).not.toHaveBeenCalled();
    expect(screen.queryByText('HOME SCREEN')).not.toBeInTheDocument();
    await waitFor(() => expect(loginButton()).toBeEnabled());
  });

  it('clears the wrong-key message as soon as the person edits the words', async () => {
    unlockMock.mockResolvedValue({ status: 'wrong_key' });
    renderLogin();
    type(VALID);
    fireEvent.click(loginButton());
    await screen.findByRole('alert');
    type(`${VALID} `);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables the button while checking and calls unlock only once', async () => {
    let finish: (value: unknown) => void = () => undefined;
    unlockMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderLogin();
    type(VALID);
    fireEvent.click(loginButton());

    await waitFor(() => expect(screen.getByRole('button', { name: t('login.checking') })).toBeDisabled());
    fireEvent.submit(field().closest('form') as HTMLFormElement);
    expect(unlockMock).toHaveBeenCalledTimes(1);

    finish({ status: 'ok', persisted: true });
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });
});

describe('LoginScreen: when something throws', () => {
  it('shows a readable message, never the raw error or the words, and lets the person try again', async () => {
    unlockMock.mockRejectedValueOnce(new Error(`disk full while saving ${VALID}`));
    renderLogin();
    type(VALID);
    fireEvent.click(loginButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('login.failed'));
    expect(alert).not.toHaveTextContent('disk full');
    expect(alert).not.toHaveTextContent('abandon');
    await waitFor(() => expect(loginButton()).toBeEnabled());

    fireEvent.click(loginButton());
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
    expect(unlockMock).toHaveBeenCalledTimes(2);
  });

  it('shows the failed message when saving the onboarded flag throws, and stays on Login', async () => {
    markOnboardedMock.mockRejectedValueOnce(new Error('storage broken'));
    renderLogin();
    type(VALID);
    fireEvent.click(loginButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('login.failed'));
    expect(alert).not.toHaveTextContent('storage broken');
    expect(screen.queryByText('HOME SCREEN')).not.toBeInTheDocument();
  });
});

describe('LoginScreen: privacy of the words', () => {
  it('never puts the typed words into any message the screen shows', async () => {
    renderLogin();
    for (const words of [BAD_CHECKSUM, UNKNOWN_AT_12, 'abandon abandon', VALID]) type(words);

    unlockMock.mockResolvedValue({ status: 'wrong_key' });
    type(VALID);
    fireEvent.click(loginButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').not.toMatch(/abandon|about|zzzzzz/i);
    expect(document.getElementById('np-login-message')?.textContent ?? '').not.toMatch(/abandon|about|zzzzzz/i);
  });

  it('does not store the words in localStorage or sessionStorage', async () => {
    localStorage.clear();
    sessionStorage.clear();
    renderLogin();
    type(VALID);
    fireEvent.click(loginButton());
    await screen.findByText('HOME SCREEN');
    expect(JSON.stringify({ ...localStorage })).not.toContain('abandon');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('abandon');
  });
});

describe('LoginScreen: Back', () => {
  it('goes back to Welcome', () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: t('login.back') }));
    expect(screen.getByText('WELCOME SCREEN')).toBeInTheDocument();
  });
});
