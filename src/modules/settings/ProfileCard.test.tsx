import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { DecryptError } from '../../core/identity/cipher';
import { LockedError } from '../../core/identity/keyring';
import type { Profile } from '../../core/storage/repo';
import { ProfileCard } from './ProfileCard';

// P09 T3: the Profile card. getProfile / saveProfile are mocked: this file tests the CARD. Real encryption of the profile
// is covered in core/storage/repo.test.ts, the input rule in core/identity/profileInput.test.ts.
const { getProfileMock, saveProfileMock } = vi.hoisted(() => ({ getProfileMock: vi.fn(), saveProfileMock: vi.fn() }));

vi.mock('../../core/storage/repo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getProfile: getProfileMock,
  saveProfile: saveProfileMock,
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const nameInput = () => screen.getByLabelText(t('info.name'));
const emailInput = () => screen.getByLabelText(t('info.email'));
const phoneInput = () => screen.getByLabelText(t('info.phone'));
const saveButton = () => screen.getByRole('button', { name: t('profile.save') });
const status = () => screen.getByRole('status');

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

async function renderReady(profile?: Profile) {
  getProfileMock.mockResolvedValue(profile);
  render(<ProfileCard />);
  await screen.findByLabelText(t('info.name'));
}

beforeEach(() => {
  getProfileMock.mockReset();
  saveProfileMock.mockReset();
  saveProfileMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProfileCard: loading and prefill', () => {
  it('shows the title and a small loading line first, no fields yet, then the fields', async () => {
    const pending = deferred<Profile | undefined>();
    getProfileMock.mockReturnValue(pending.promise);
    render(<ProfileCard />);
    expect(screen.getByRole('heading', { level: 2, name: t('profile.title') })).toBeInTheDocument();
    expect(status()).toHaveTextContent(t('profile.loading'));
    expect(screen.queryByLabelText(t('info.name'))).not.toBeInTheDocument();
    await act(async () => {
      pending.resolve({ name: 'Asha' });
    });
    expect(await screen.findByLabelText(t('info.name'))).toHaveValue('Asha');
    expect(screen.queryByText(t('profile.loading'))).not.toBeInTheDocument();
  });

  it('prefills name, email and phone from the saved profile (Gujarati name kept as saved), loading it once', async () => {
    await renderReady({ name: 'આશા પટેલ', email: 'asha@example.com', phone: '+91 98765 43210' });
    expect(nameInput()).toHaveValue('આશા પટેલ');
    expect(emailInput()).toHaveValue('asha@example.com');
    expect(phoneInput()).toHaveValue('+91 98765 43210');
    expect(getProfileMock).toHaveBeenCalledTimes(1);
  });

  it('no saved profile yet: three empty optional fields and a Save button', async () => {
    await renderReady(undefined);
    expect(nameInput()).toHaveValue('');
    expect(emailInput()).toHaveValue('');
    expect(phoneInput()).toHaveValue('');
    expect(saveButton()).toBeEnabled();
  });

  it('has a polite live region from the start, empty until something happens', async () => {
    await renderReady(undefined);
    expect(status()).toHaveAttribute('aria-live', 'polite');
    expect(status()).toBeEmptyDOMElement();
  });
});

const LOAD_ERRORS: Array<[string, () => Error]> = [
  ['LockedError', () => new LockedError()],
  ['DecryptError', () => new DecryptError('auth_failed')],
];

describe('ProfileCard: load problems', () => {
  it.each(LOAD_ERRORS)('%s while loading: friendly text, no fields, no raw message, and Try again loads again', async (_name, makeError) => {
    getProfileMock.mockRejectedValueOnce(makeError()).mockResolvedValueOnce({ name: 'Asha' });
    render(<ProfileCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('profile.loadFailed'));
    expect(document.body).not.toHaveTextContent('log in first');
    expect(document.body).not.toHaveTextContent('could not be decrypted');
    expect(screen.queryByLabelText(t('info.name'))).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('profile.retry') }));
    expect(await screen.findByLabelText(t('info.name'))).toHaveValue('Asha');
    expect(getProfileMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ProfileCard: saving', () => {
  it('saves exactly the filled fields, trimmed, and says so', async () => {
    await renderReady(undefined);
    type(nameInput(), '  Asha  ');
    type(emailInput(), 'asha@example.com');
    type(phoneInput(), ' 98765 43210 ');
    fireEvent.click(saveButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('profile.saved')));
    expect(saveProfileMock).toHaveBeenCalledTimes(1);
    expect(saveProfileMock).toHaveBeenCalledWith({ name: 'Asha', email: 'asha@example.com', phone: '98765 43210' });
    expect(getProfileMock).toHaveBeenCalledTimes(1);
  });

  it('only the name filled: the other fields are left out of the saved profile', async () => {
    await renderReady({ name: 'Asha', email: 'asha@example.com', phone: '1' });
    type(emailInput(), '');
    type(phoneInput(), '');
    fireEvent.click(saveButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('profile.saved')));
    expect(saveProfileMock).toHaveBeenCalledWith({ name: 'Asha' });
  });

  it('an empty form is allowed: it saves an empty profile and says no details are kept', async () => {
    await renderReady({ name: 'Asha', email: 'asha@example.com', phone: '98765 43210' });
    type(nameInput(), '');
    type(emailInput(), '');
    type(phoneInput(), '   ');
    fireEvent.click(saveButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('profile.savedEmpty')));
    expect(saveProfileMock).toHaveBeenCalledWith({});
  });

  it('a long Gujarati name is saved as typed', async () => {
    const longName = 'આશાબેન '.repeat(14).trim();
    await renderReady(undefined);
    type(nameInput(), longName);
    fireEvent.click(saveButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('profile.saved')));
    expect(saveProfileMock).toHaveBeenCalledWith({ name: longName });
  });

  it('a bad email shape: the field shows the error, nothing is saved, and typing again clears the error', async () => {
    await renderReady(undefined);
    type(emailInput(), 'asha@');
    fireEvent.click(saveButton());
    expect(screen.getByText(t('info.emailInvalid'))).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(saveProfileMock).not.toHaveBeenCalled();
    type(emailInput(), 'asha@example.com');
    expect(screen.queryByText(t('info.emailInvalid'))).not.toBeInTheDocument();
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveProfileMock).toHaveBeenCalledTimes(1));
  });

  it('while saving: the button is disabled and marked busy, and a second click saves nothing twice', async () => {
    const pending = deferred<void>();
    saveProfileMock.mockReturnValueOnce(pending.promise);
    await renderReady(undefined);
    type(nameInput(), 'Asha');
    fireEvent.click(saveButton());
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(saveButton());
    expect(saveProfileMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve();
    });
    await waitFor(() => expect(status()).toHaveTextContent(t('profile.saved')));
    expect(saveButton()).toBeEnabled();
  });

  it('a failed save: friendly text, no raw error, the typed values stay, and saving again works', async () => {
    saveProfileMock.mockRejectedValueOnce(new DecryptError('auth_failed'));
    await renderReady(undefined);
    type(nameInput(), 'Asha');
    fireEvent.click(saveButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('profile.saveFailed')));
    expect(document.body).not.toHaveTextContent('could not be decrypted');
    expect(nameInput()).toHaveValue('Asha');
    expect(saveButton()).toBeEnabled();

    fireEvent.click(saveButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('profile.saved')));
    expect(saveProfileMock).toHaveBeenCalledTimes(2);
  });

  it('editing a field after a message clears the message', async () => {
    await renderReady(undefined);
    type(nameInput(), 'Asha');
    fireEvent.click(saveButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('profile.saved')));
    type(nameInput(), 'Asha P');
    expect(status()).toBeEmptyDOMElement();
  });
});

describe('ProfileCard: privacy and style', () => {
  it('never logs the details (email, phone) to the console, not even when saving fails', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
    ];
    saveProfileMock.mockRejectedValueOnce(new Error('boom secret@example.com 9999900000'));
    await renderReady({ email: 'secret@example.com', phone: '9999900000' });
    type(nameInput(), 'Asha');
    fireEvent.click(saveButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('profile.saveFailed')));
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logged).not.toContain('secret@example.com');
    expect(logged).not.toContain('9999900000');
  });

  it('its stylesheet wraps long text (overflow-wrap: anywhere)', () => {
    const css = readFileSync('src/modules/settings/ProfileCard.css', 'utf8');
    expect(css).toContain('overflow-wrap: anywhere');
  });
});
