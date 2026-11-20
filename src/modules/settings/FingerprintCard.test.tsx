import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import type { PlatformAuth } from '../../core/identity/biometric';
import { FingerprintCard } from './FingerprintCard';

// The lock logic and the session are mocked: this file tests the CARD. The real logic is covered in core/identity/*.test.ts.
const { stateMock, enableMock, disableMock, getEnrolKeyMock, clearEnrolKeyMock, unlockMock } = vi.hoisted(() => ({
  stateMock: vi.fn(),
  enableMock: vi.fn(),
  disableMock: vi.fn(),
  getEnrolKeyMock: vi.fn(),
  clearEnrolKeyMock: vi.fn(),
  unlockMock: vi.fn(),
}));

vi.mock('../../core/identity/biometric', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFingerprintState: stateMock,
  enableFingerprint: enableMock,
  disableFingerprint: disableMock,
}));

vi.mock('../../core/identity/session', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getEnrolKey: getEnrolKeyMock,
  clearEnrolKey: clearEnrolKeyMock,
  unlock: unlockMock,
}));

function fakeAuth(available: boolean): PlatformAuth {
  return {
    isAvailable: async () => available,
    supportsPrf: async () => false,
    enroll: async () => ({ status: 'unsupported' }),
    verify: async () => ({ status: 'unsupported' }),
  };
}

const turnOnButton = () => screen.getByRole('button', { name: t('fingerprint.card.turnOn') });
const turnOffButton = () => screen.getByRole('button', { name: t('fingerprint.card.turnOff') });
const continueButton = () => screen.getByRole('button', { name: t('fingerprint.card.wordsContinue') });
const wordsBox = () => screen.getByLabelText(t('fingerprint.card.wordsLabel'));

// Renders the card in the "off" state and waits until Turn on can be pressed.
async function renderOff(auth: PlatformAuth = fakeAuth(true)) {
  stateMock.mockResolvedValue({ enabled: false });
  render(<FingerprintCard auth={auth} />);
  await waitFor(() => expect(turnOnButton()).toBeEnabled());
}

const fakeKey = { extractable: true } as unknown as CryptoKey;
const WORDS = 'one two three four five six seven eight nine ten eleven twelve';

beforeEach(() => {
  stateMock.mockReset();
  enableMock.mockReset();
  disableMock.mockReset();
  getEnrolKeyMock.mockReset();
  clearEnrolKeyMock.mockReset();
  unlockMock.mockReset();
  stateMock.mockResolvedValue({ enabled: false });
  getEnrolKeyMock.mockReturnValue(fakeKey);
});

describe('FingerprintCard: what it shows', () => {
  it('off: heading, optional intro, off state and an enabled Turn on', async () => {
    await renderOff();
    expect(screen.getByRole('heading', { level: 2, name: t('fingerprint.card.title') })).toBeInTheDocument();
    expect(screen.getByText(t('fingerprint.card.intro'))).toBeInTheDocument();
    expect(screen.getByText(t('fingerprint.card.stateOff'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('fingerprint.card.turnOff') })).not.toBeInTheDocument();
  });

  it('off on a device with no fingerprint or screen lock: says so and disables Turn on', async () => {
    stateMock.mockResolvedValue({ enabled: false });
    render(<FingerprintCard auth={fakeAuth(false)} />);
    expect(await screen.findByText(t('fingerprint.card.unavailable'))).toBeInTheDocument();
    expect(turnOnButton()).toBeDisabled();
  });

  it('on at PRF level: says the data is protected and offers Turn off', async () => {
    stateMock.mockResolvedValue({ enabled: true, level: 'prf' });
    render(<FingerprintCard auth={fakeAuth(true)} />);
    expect(await screen.findByText(t('fingerprint.screen.donePrf'))).toBeInTheDocument();
    expect(turnOffButton()).toBeEnabled();
    expect(screen.queryByRole('button', { name: t('fingerprint.card.turnOn') })).not.toBeInTheDocument();
  });

  it('on at gate level: says honestly it protects the app screen, not the files', async () => {
    stateMock.mockResolvedValue({ enabled: true, level: 'gate' });
    render(<FingerprintCard auth={fakeAuth(true)} />);
    expect(await screen.findByText(t('fingerprint.screen.doneGate'))).toBeInTheDocument();
    expect(t('fingerprint.screen.doneGate')).toContain('not the files');
  });

  it('if the state cannot be read it is treated as off, never a crash', async () => {
    stateMock.mockRejectedValue(new Error('boom'));
    render(<FingerprintCard auth={fakeAuth(true)} />);
    expect(await screen.findByText(t('fingerprint.card.stateOff'))).toBeInTheDocument();
  });
});

describe('FingerprintCard: turning on with the enrolment key', () => {
  it('PRF level: turns on, forgets the enrolment key and now shows Turn off', async () => {
    enableMock.mockResolvedValue({ status: 'ok', level: 'prf' });
    const auth = fakeAuth(true);
    await renderOff(auth);
    fireEvent.click(turnOnButton());
    expect(await screen.findByText(t('fingerprint.screen.donePrf'))).toBeInTheDocument();
    expect(enableMock).toHaveBeenCalledWith(fakeKey, auth);
    expect(clearEnrolKeyMock).toHaveBeenCalled();
    expect(turnOffButton()).toBeEnabled();
  });

  it('gate level: shows the gate wording', async () => {
    enableMock.mockResolvedValue({ status: 'ok', level: 'gate' });
    await renderOff();
    fireEvent.click(turnOnButton());
    expect(await screen.findByText(t('fingerprint.screen.doneGate'))).toBeInTheDocument();
  });

  it('cancelling the phone prompt is a calm note, not an error, and Turn on stays', async () => {
    enableMock.mockResolvedValue({ status: 'cancelled' });
    await renderOff();
    fireEvent.click(turnOnButton());
    expect(await screen.findByText(t('fingerprint.card.cancelled'))).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
    expect(clearEnrolKeyMock).not.toHaveBeenCalled();
  });

  it('"unsupported" from the lock is a calm note, not an error', async () => {
    enableMock.mockResolvedValue({ status: 'unsupported' });
    await renderOff();
    fireEvent.click(turnOnButton());
    expect(await screen.findByText(t('fingerprint.card.unavailable'))).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a failure shows an alert and the enrolment key is kept for another try', async () => {
    enableMock.mockResolvedValue({ status: 'failed', reason: 'authenticator' });
    await renderOff();
    fireEvent.click(turnOnButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('fingerprint.card.failed'));
    expect(clearEnrolKeyMock).not.toHaveBeenCalled();
  });

  it('an unexpected exception is treated as a failure, never a crash', async () => {
    enableMock.mockRejectedValue(new Error('boom'));
    await renderOff();
    fireEvent.click(turnOnButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('fingerprint.card.failed'));
  });
});

describe('FingerprintCard: turning on without an enrolment key (page was reloaded)', () => {
  it('asks for the 12 words first and does not call the lock yet', async () => {
    getEnrolKeyMock.mockReturnValue(null);
    await renderOff();
    fireEvent.click(turnOnButton());
    expect(await screen.findByText(t('fingerprint.card.wordsPrompt'))).toBeInTheDocument();
    expect(wordsBox()).toBeInTheDocument();
    expect(enableMock).not.toHaveBeenCalled();
    expect(unlockMock).not.toHaveBeenCalled();
  });

  it('right words: unlocks once, turns the lock on and removes the words box', async () => {
    getEnrolKeyMock.mockReturnValueOnce(null).mockReturnValue(fakeKey);
    unlockMock.mockResolvedValue({ status: 'ok' });
    enableMock.mockResolvedValue({ status: 'ok', level: 'prf' });
    const auth = fakeAuth(true);
    await renderOff(auth);
    fireEvent.click(turnOnButton());
    fireEvent.change(await screen.findByLabelText(t('fingerprint.card.wordsLabel')), { target: { value: WORDS } });
    fireEvent.click(continueButton());
    expect(await screen.findByText(t('fingerprint.screen.donePrf'))).toBeInTheDocument();
    expect(unlockMock).toHaveBeenCalledTimes(1);
    expect(unlockMock).toHaveBeenCalledWith(WORDS);
    expect(enableMock).toHaveBeenCalledWith(fakeKey, auth);
    expect(screen.queryByLabelText(t('fingerprint.card.wordsLabel'))).not.toBeInTheDocument();
  });

  it('wrong words (wrong_key): shows an alert and never turns the lock on', async () => {
    getEnrolKeyMock.mockReturnValue(null);
    unlockMock.mockResolvedValue({ status: 'wrong_key' });
    await renderOff();
    fireEvent.click(turnOnButton());
    fireEvent.change(await screen.findByLabelText(t('fingerprint.card.wordsLabel')), { target: { value: WORDS } });
    fireEvent.click(continueButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('fingerprint.card.wrongKey'));
    expect(enableMock).not.toHaveBeenCalled();
  });

  it('empty words: shows an alert without calling unlock', async () => {
    getEnrolKeyMock.mockReturnValue(null);
    await renderOff();
    fireEvent.click(turnOnButton());
    await screen.findByLabelText(t('fingerprint.card.wordsLabel'));
    fireEvent.click(continueButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('fingerprint.card.badWords'));
    expect(unlockMock).not.toHaveBeenCalled();
  });

  it('an exception while unlocking is treated as a failure, never a crash', async () => {
    getEnrolKeyMock.mockReturnValue(null);
    unlockMock.mockRejectedValue(new Error('boom'));
    await renderOff();
    fireEvent.click(turnOnButton());
    fireEvent.change(await screen.findByLabelText(t('fingerprint.card.wordsLabel')), { target: { value: WORDS } });
    fireEvent.click(continueButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('fingerprint.card.failed'));
  });

  it('Cancel closes the words box, forgets what was typed and brings Turn on back', async () => {
    getEnrolKeyMock.mockReturnValue(null);
    await renderOff();
    fireEvent.click(turnOnButton());
    fireEvent.change(await screen.findByLabelText(t('fingerprint.card.wordsLabel')), { target: { value: WORDS } });
    fireEvent.click(screen.getByRole('button', { name: t('fingerprint.card.wordsCancel') }));
    expect(screen.queryByLabelText(t('fingerprint.card.wordsLabel'))).not.toBeInTheDocument();
    expect(turnOnButton()).toBeEnabled();
    fireEvent.click(turnOnButton());
    expect((await screen.findByLabelText(t('fingerprint.card.wordsLabel'))) as HTMLTextAreaElement).toHaveValue('');
    expect(unlockMock).not.toHaveBeenCalled();
  });
});

describe('FingerprintCard: turning off', () => {
  it('turns the lock off and goes back to the off state', async () => {
    stateMock.mockResolvedValue({ enabled: true, level: 'prf' });
    disableMock.mockResolvedValue({ status: 'ok' });
    render(<FingerprintCard auth={fakeAuth(true)} />);
    fireEvent.click(await screen.findByRole('button', { name: t('fingerprint.card.turnOff') }));
    expect(await screen.findByText(t('fingerprint.card.stateOff'))).toBeInTheDocument();
    expect(disableMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(t('fingerprint.screen.donePrf'))).not.toBeInTheDocument();
  });

  it('a failed turn-off keeps the lock shown as on and shows an alert', async () => {
    stateMock.mockResolvedValue({ enabled: true, level: 'gate' });
    disableMock.mockResolvedValue({ status: 'failed' });
    render(<FingerprintCard auth={fakeAuth(true)} />);
    fireEvent.click(await screen.findByRole('button', { name: t('fingerprint.card.turnOff') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('fingerprint.card.turnOffFailed'));
    expect(screen.getByText(t('fingerprint.screen.doneGate'))).toBeInTheDocument();
  });

  it('an exception while turning off is a failure, never a crash', async () => {
    stateMock.mockResolvedValue({ enabled: true, level: 'prf' });
    disableMock.mockRejectedValue(new Error('boom'));
    render(<FingerprintCard auth={fakeAuth(true)} />);
    fireEvent.click(await screen.findByRole('button', { name: t('fingerprint.card.turnOff') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('fingerprint.card.turnOffFailed'));
  });
});
