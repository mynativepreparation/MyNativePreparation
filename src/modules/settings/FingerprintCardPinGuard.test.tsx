import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import type { PlatformAuth } from '../../core/identity/biometric';
import { FingerprintCard } from './FingerprintCard';

// Both locks may be on (T12d): a PIN lock does NOT block the fingerprint card any more.
// The other FingerprintCard behaviour is tested in FingerprintCard.test.tsx; the lock logic is mocked here.
const { fingerprintStateMock, enableMock, pinStateMock, getEnrolKeyMock } = vi.hoisted(() => ({
  fingerprintStateMock: vi.fn(),
  enableMock: vi.fn(),
  pinStateMock: vi.fn(),
  getEnrolKeyMock: vi.fn(),
}));

vi.mock('../../core/identity/biometric', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFingerprintState: fingerprintStateMock,
  enableFingerprint: enableMock,
}));

vi.mock('../../core/identity/pin', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPinState: pinStateMock,
}));

vi.mock('../../core/identity/session', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getEnrolKey: getEnrolKeyMock,
}));

const auth: PlatformAuth = {
  isAvailable: async () => true,
  supportsPrf: async () => false,
  enroll: async () => ({ status: 'unsupported' }),
  verify: async () => ({ status: 'unsupported' }),
};

const turnOnButton = () => screen.getByRole('button', { name: t('fingerprint.card.turnOn') });

beforeEach(() => {
  fingerprintStateMock.mockReset();
  fingerprintStateMock.mockResolvedValue({ enabled: false });
  enableMock.mockReset();
  pinStateMock.mockReset();
  getEnrolKeyMock.mockReset();
  getEnrolKeyMock.mockReturnValue({ extractable: true } as unknown as CryptoKey);
});

describe('FingerprintCard with a PIN lock', () => {
  it('PIN lock on: Turn on is enabled and enrols the fingerprint', async () => {
    pinStateMock.mockResolvedValue({ enabled: true, triesLeft: 5 });
    enableMock.mockResolvedValue({ status: 'ok', level: 'gate' });
    render(<FingerprintCard auth={auth} />);
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
    fireEvent.click(turnOnButton());
    await waitFor(() => expect(enableMock).toHaveBeenCalledTimes(1));
  });

  it('PIN lock off: Turn on works the same way', async () => {
    pinStateMock.mockResolvedValue({ enabled: false, triesLeft: 5 });
    enableMock.mockResolvedValue({ status: 'ok', level: 'gate' });
    render(<FingerprintCard auth={auth} />);
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
    fireEvent.click(turnOnButton());
    await waitFor(() => expect(enableMock).toHaveBeenCalledTimes(1));
  });

  it('a PIN state that cannot be read does not matter to the fingerprint card', async () => {
    pinStateMock.mockRejectedValue(new Error('no storage'));
    render(<FingerprintCard auth={auth} />);
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
  });
});
