import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { checkMnemonic } from '../../core/identity/mnemonic';
import { deleteSetting, setSetting } from '../../core/storage/repo';
import { RegisterScreen } from './RegisterScreen';

// Official BIP39 test phrase (valid). Generation and identity creation are mocked: this file tests the SCREEN.
// (Real key generation and the real crypto are covered in core/identity tests and in the owner's browser check, T13.)
const { WORDS, createIdentityMock } = vi.hoisted(() => ({
  WORDS: 'legal winner thank year wave sausage worth useful legal winner thank yellow',
  createIdentityMock: vi.fn(),
}));

vi.mock('../../core/identity/mnemonic', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateMnemonic12: () => WORDS,
}));

vi.mock('../../core/identity/session', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createIdentity: createIdentityMock,
}));

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/fingerprint" element={<p>FINGERPRINT SCREEN</p>} />
        <Route path="/welcome" element={<p>WELCOME SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const continueButton = () => screen.getByRole('button', { name: t('register.continue') });
const savedCheckbox = () => screen.getByRole('checkbox', { name: t('register.saved') });

beforeEach(async () => {
  createIdentityMock.mockReset();
  createIdentityMock.mockResolvedValue({ status: 'ok', persisted: true });
  setClipboard(undefined);
  localStorage.clear();
  sessionStorage.clear();
  await deleteSetting('identity.onboarded');
});

afterEach(() => {
  setClipboard(undefined);
});

describe('RegisterScreen: the words', () => {
  it('shows the 12 words in order with their numbers', () => {
    const { container } = renderRegister();
    const shown = Array.from(container.querySelectorAll('.np-register__word')).map((el) => el.textContent);
    expect(shown.join(' ')).toBe(WORDS);
    expect(shown).toHaveLength(12);
    expect(container.querySelectorAll('li')).toHaveLength(12);
    expect(container.querySelectorAll('.np-register__num')[11]).toHaveTextContent('12');
    // the phrase on screen is a valid key
    expect(checkMnemonic(shown.join(' ')).ok).toBe(true);
  });

  it('has the key as the main heading and the strong "cannot be recovered" warning', () => {
    renderRegister();
    expect(screen.getByRole('heading', { level: 1, name: t('register.title') })).toBeInTheDocument();
    expect(screen.getByText(t('register.warning'))).toBeInTheDocument();
    expect(t('register.warning')).toContain('Nobody can recover them');
  });

  it('does not create the identity just by showing the words', () => {
    renderRegister();
    expect(createIdentityMock).not.toHaveBeenCalled();
  });

  it('keeps the words out of localStorage and sessionStorage', async () => {
    renderRegister();
    fireEvent.click(savedCheckbox());
    fireEvent.click(continueButton());
    expect(await screen.findByText('FINGERPRINT SCREEN')).toBeInTheDocument();
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    for (const word of ['legal', 'winner', 'sausage', 'yellow']) {
      expect(stored).not.toContain(word);
    }
  });
});

describe('RegisterScreen: Continue', () => {
  it('is disabled until the "I have saved my 12 words" box is checked', () => {
    renderRegister();
    expect(continueButton()).toBeDisabled();
    fireEvent.click(savedCheckbox());
    expect(continueButton()).toBeEnabled();
    fireEvent.click(savedCheckbox());
    expect(continueButton()).toBeDisabled();
  });

  it('does nothing while the box is unchecked', () => {
    renderRegister();
    fireEvent.click(continueButton());
    expect(createIdentityMock).not.toHaveBeenCalled();
  });

  it('creates the identity with the shown words, then goes to the fingerprint offer', async () => {
    renderRegister();
    fireEvent.click(savedCheckbox());
    fireEvent.click(continueButton());
    expect(await screen.findByText('FINGERPRINT SCREEN')).toBeInTheDocument();
    expect(createIdentityMock).toHaveBeenCalledTimes(1);
    expect(createIdentityMock).toHaveBeenCalledWith(WORDS);
  });

  it('shows "Creating your key…" and ignores a second press while working', async () => {
    let finish: (value: unknown) => void = () => undefined;
    createIdentityMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderRegister();
    fireEvent.click(savedCheckbox());
    fireEvent.click(continueButton());

    const busy = await screen.findByRole('button', { name: t('register.creating') });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(createIdentityMock).toHaveBeenCalledTimes(1);

    await act(async () => finish({ status: 'ok', persisted: true }));
    expect(await screen.findByText('FINGERPRINT SCREEN')).toBeInTheDocument();
  });

  it.each([
    ['a refused result', () => createIdentityMock.mockResolvedValue({ status: 'invalid_words', problem: 'bad_checksum' })],
    ['an unexpected error', () => createIdentityMock.mockRejectedValue(new Error('boom'))],
  ])('shows a readable error after %s, stays on the screen and lets the person try again', async (_label, arrange) => {
    arrange();
    renderRegister();
    fireEvent.click(savedCheckbox());
    fireEvent.click(continueButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('register.error'));
    expect(alert).not.toHaveTextContent('boom');
    expect(screen.queryByText('FINGERPRINT SCREEN')).not.toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
  });

  it('Back returns to Welcome', () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: t('register.back') }));
    expect(screen.getByText('WELCOME SCREEN')).toBeInTheDocument();
  });
});

describe('RegisterScreen: Copy', () => {
  it('copies exactly the 12 words and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: t('register.copy') }));
    expect(await screen.findByRole('status')).toHaveTextContent(t('register.copied'));
    expect(writeText).toHaveBeenCalledWith(WORDS);
  });

  it('shows a message and keeps the words visible when the clipboard refuses', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    const { container } = renderRegister();
    fireEvent.click(screen.getByRole('button', { name: t('register.copy') }));
    expect(await screen.findByRole('status')).toHaveTextContent(t('register.copyFailed'));
    expect(container.querySelectorAll('.np-register__word')).toHaveLength(12);
  });

  it('shows the same message when the browser has no clipboard at all', async () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: t('register.copy') }));
    expect(await screen.findByRole('status')).toHaveTextContent(t('register.copyFailed'));
  });
});

describe('RegisterScreen: a device that already has data', () => {
  it('warns that a new key cannot open the old data', async () => {
    await setSetting('identity.onboarded', true);
    renderRegister();
    expect(await screen.findByText(t('register.replaceWarning'))).toBeInTheDocument();
  });

  it('shows no such warning on a fresh device', async () => {
    renderRegister();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await waitFor(() => expect(screen.queryByText(t('register.replaceWarning'))).not.toBeInTheDocument());
  });
});
