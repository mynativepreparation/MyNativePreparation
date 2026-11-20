import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import type { PlatformAuth } from '../../core/identity/biometric';
import { FingerprintScreen } from './FingerprintScreen';

// enableFingerprint and the enrolment key are mocked: this file tests the SCREEN. The real lock logic is covered in core/identity/biometric.test.ts.
const { enableMock, getEnrolKeyMock, clearEnrolKeyMock } = vi.hoisted(() => ({
  enableMock: vi.fn(),
  getEnrolKeyMock: vi.fn(),
  clearEnrolKeyMock: vi.fn(),
}));

vi.mock('../../core/identity/biometric', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  enableFingerprint: enableMock,
}));

vi.mock('../../core/identity/session', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getEnrolKey: getEnrolKeyMock,
  clearEnrolKey: clearEnrolKeyMock,
}));

function fakeAuth(available: boolean): PlatformAuth {
  return {
    isAvailable: async () => available,
    supportsPrf: async () => false,
    enroll: async () => ({ status: 'unsupported' }),
    verify: async () => ({ status: 'unsupported' }),
  };
}

function renderScreen(auth: PlatformAuth = fakeAuth(true)) {
  return render(
    <MemoryRouter initialEntries={['/fingerprint']}>
      <Routes>
        <Route path="/fingerprint" element={<FingerprintScreen auth={auth} />} />
        <Route path="/info" element={<p>INFO SCREEN</p>} />
        <Route path="/pin-setup" element={<p>PIN SETUP SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const turnOnButton = () => screen.getByRole('button', { name: t('fingerprint.screen.turnOn') });
const skipButton = () => screen.getByRole('button', { name: t('fingerprint.screen.skip') });

const fakeKey = { extractable: true } as unknown as CryptoKey;

beforeEach(() => {
  enableMock.mockReset();
  getEnrolKeyMock.mockReset();
  clearEnrolKeyMock.mockReset();
  getEnrolKeyMock.mockReturnValue(fakeKey);
});

describe('FingerprintScreen: layout', () => {
  it('has a heading, says it is optional and that the 12 words still work', async () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1, name: t('fingerprint.title') })).toBeInTheDocument();
    expect(screen.getByText(t('fingerprint.screen.intro'))).toBeInTheDocument();
    expect(screen.getByText(t('fingerprint.screen.words'))).toBeInTheDocument();
    expect(t('fingerprint.screen.intro')).toContain('optional');
    expect(skipButton()).toBeEnabled();
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
  });

  it('disables Turn on and says so when the device has no fingerprint or screen lock', async () => {
    renderScreen(fakeAuth(false));
    expect(await screen.findByText(t('fingerprint.screen.unavailable'))).toBeInTheDocument();
    expect(turnOnButton()).toBeDisabled();
    expect(skipButton()).toBeEnabled();
  });
});

describe('FingerprintScreen: turning on', () => {
  it('PRF level: says the data is protected, forgets the enrolment key and continues to Info', async () => {
    enableMock.mockResolvedValue({ status: 'ok', level: 'prf' });
    const auth = fakeAuth(true);
    renderScreen(auth);
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
    fireEvent.click(turnOnButton());
    expect(await screen.findByText(t('fingerprint.screen.donePrf'))).toBeInTheDocument();
    expect(enableMock).toHaveBeenCalledWith(fakeKey, auth);
    expect(clearEnrolKeyMock).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t('fingerprint.screen.continue') }));
    expect(await screen.findByText('INFO SCREEN')).toBeInTheDocument();
  });

  it('gate level: says honestly that it protects the app screen, not the files', async () => {
    enableMock.mockResolvedValue({ status: 'ok', level: 'gate' });
    renderScreen();
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
    fireEvent.click(turnOnButton());
    expect(await screen.findByText(t('fingerprint.screen.doneGate'))).toBeInTheDocument();
    expect(t('fingerprint.screen.doneGate')).toContain('not the files');
  });

  it('cancelling the prompt is a calm note, not an error, and the buttons stay', async () => {
    enableMock.mockResolvedValue({ status: 'cancelled' });
    renderScreen();
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
    fireEvent.click(turnOnButton());
    expect(await screen.findByText(t('fingerprint.screen.cancelled'))).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(turnOnButton()).toBeEnabled();
    expect(skipButton()).toBeEnabled();
    expect(clearEnrolKeyMock).not.toHaveBeenCalled();
  });

  it('a failure shows an alert and still lets the person skip', async () => {
    enableMock.mockResolvedValue({ status: 'failed', reason: 'authenticator' });
    renderScreen();
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
    fireEvent.click(turnOnButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('fingerprint.screen.failed'));
    expect(skipButton()).toBeEnabled();
  });

  it('an unexpected exception is treated as a failure, never a crash', async () => {
    enableMock.mockRejectedValue(new Error('boom'));
    renderScreen();
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
    fireEvent.click(turnOnButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('fingerprint.screen.failed'));
  });

  it('without an enrolment key (page reloaded) asks for the 12 words and does not call the lock', async () => {
    getEnrolKeyMock.mockReturnValue(null);
    renderScreen();
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
    fireEvent.click(turnOnButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('fingerprint.screen.noKey'));
    expect(enableMock).not.toHaveBeenCalled();
  });
});

describe('FingerprintScreen: skipping', () => {
  it('Skip goes to the PIN offer, keeps the enrolment key for it and never touches the lock', async () => {
    renderScreen();
    fireEvent.click(skipButton());
    expect(await screen.findByText('PIN SETUP SCREEN')).toBeInTheDocument();
    expect(clearEnrolKeyMock).not.toHaveBeenCalled();
    expect(enableMock).not.toHaveBeenCalled();
  });
});
