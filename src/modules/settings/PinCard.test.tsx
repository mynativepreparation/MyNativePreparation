import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t, type TextKey } from '../../core/i18n';
import { PinCard } from './PinCard';

// The lock logic and the session are mocked: this file tests the CARD. The real logic is covered in core/identity/pin.test.ts.
const { fingerprintMock, stateMock, enableMock, disableMock, getEnrolKeyMock, unlockMock } = vi.hoisted(() => ({
  fingerprintMock: vi.fn(),
  stateMock: vi.fn(),
  enableMock: vi.fn(),
  disableMock: vi.fn(),
  getEnrolKeyMock: vi.fn(),
  unlockMock: vi.fn(),
}));

vi.mock('../../core/identity/biometric', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFingerprintState: fingerprintMock,
}));

vi.mock('../../core/identity/pin', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPinState: stateMock,
  enablePin: enableMock,
  disablePin: disableMock,
}));

vi.mock('../../core/identity/session', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getEnrolKey: getEnrolKeyMock,
  unlock: unlockMock,
}));

const turnOnButton = () => screen.getByRole('button', { name: t('pin.card.turnOn') });
const turnOffButton = () => screen.getByRole('button', { name: t('pin.card.turnOff') });
const saveButton = () => screen.getByRole('button', { name: t('pin.card.save') });
const continueButton = () => screen.getByRole('button', { name: t('pin.card.wordsContinue') });
const pinField = () => screen.getByLabelText(t('pin.setup.pinLabel'));
const againField = () => screen.getByLabelText(t('pin.setup.againLabel'));
const wordsBox = () => screen.getByLabelText(t('pin.card.wordsLabel'));

const fakeKey = { extractable: true } as unknown as CryptoKey;
const WORDS = 'one two three four five six seven eight nine ten eleven twelve';
const GOOD_PIN = '483920';

const BAD_PINS: [string, TextKey][] = [
  ['12345', 'pin.setup.wrongLength'],
  ['12ab56', 'pin.setup.notDigits'],
  ['123456', 'pin.setup.tooEasy'],
  ['111111', 'pin.setup.tooEasy'],
];

const ENABLE_FAILURES: [Record<string, unknown>, TextKey][] = [
  [{ status: 'needs_words' }, 'pin.setup.noKey'],
  [{ status: 'invalid_pin', problem: 'too_easy' }, 'pin.setup.tooEasy'],
  [{ status: 'failed' }, 'pin.setup.failed'],
];

const DISABLE_FAILURES: [Record<string, unknown>][] = [[{ status: 'locked' }], [{ status: 'failed' }]];

// Renders the card in the "off" state and waits until Turn on can be pressed.
async function renderOff() {
  stateMock.mockResolvedValue({ enabled: false, triesLeft: 5 });
  render(<PinCard />);
  await waitFor(() => expect(turnOnButton()).toBeEnabled());
}

async function renderOn() {
  stateMock.mockResolvedValue({ enabled: true, triesLeft: 5 });
  render(<PinCard />);
  await waitFor(() => expect(turnOffButton()).toBeInTheDocument());
}

// Off state with an enrolment key, Turn on pressed: the PIN form is showing.
async function openPinForm() {
  getEnrolKeyMock.mockReturnValue(fakeKey);
  await renderOff();
  fireEvent.click(turnOnButton());
  expect(pinField()).toBeInTheDocument();
}

function typePins(pin: string, again: string = pin) {
  fireEvent.change(pinField(), { target: { value: pin } });
  fireEvent.change(againField(), { target: { value: again } });
}

beforeEach(() => {
  fingerprintMock.mockReset();
  fingerprintMock.mockResolvedValue({ enabled: false });
  stateMock.mockReset();
  enableMock.mockReset();
  disableMock.mockReset();
  getEnrolKeyMock.mockReset();
  unlockMock.mockReset();
});

describe('PinCard: states', () => {
  it('off: says so, is honest that a PIN is weaker than the 12 words and offers Turn on', async () => {
    await renderOff();
    expect(screen.getByRole('heading', { level: 2, name: t('pin.card.title') })).toBeInTheDocument();
    expect(screen.getByText(t('pin.card.stateOff'))).toBeInTheDocument();
    expect(t('pin.card.intro')).toContain('optional');
    expect(t('pin.card.intro')).toContain('12 words');
    expect(t('pin.card.intro')).toContain('not as strong');
  });

  it('on: says so and offers only Turn off', async () => {
    await renderOn();
    expect(screen.getByText(t('pin.card.stateOn'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('pin.card.turnOn') })).toBeNull();
  });

  it('the fingerprint lock is on: Turn on stays available (both locks may be on)', async () => {
    fingerprintMock.mockResolvedValue({ enabled: true, level: 'gate' });
    getEnrolKeyMock.mockReturnValue(fakeKey);
    await renderOff();
    fireEvent.click(turnOnButton());
    expect(pinField()).toBeInTheDocument();
  });

  it('a PIN state that cannot be read counts as off, never an error screen', async () => {
    stateMock.mockRejectedValue(new Error('no storage'));
    render(<PinCard />);
    await waitFor(() => expect(turnOnButton()).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('PinCard: turn on with the enrolment key in memory', () => {
  it('shows the PIN form, not the 12-word box', async () => {
    await openPinForm();
    expect(againField()).toBeInTheDocument();
    expect(screen.queryByLabelText(t('pin.card.wordsLabel'))).toBeNull();
    expect(screen.getByText(t('pin.setup.tries'))).toBeInTheDocument();
  });

  it.each(BAD_PINS)('PIN %s is refused before anything is saved', async (bad, key) => {
    await openPinForm();
    typePins(bad);
    fireEvent.click(saveButton());
    expect(screen.getByRole('alert')).toHaveTextContent(t(key));
    expect(enableMock).not.toHaveBeenCalled();
  });

  it('two different PINs are refused', async () => {
    await openPinForm();
    typePins(GOOD_PIN, '483921');
    fireEvent.click(saveButton());
    expect(screen.getByRole('alert')).toHaveTextContent(t('pin.setup.mismatch'));
    expect(enableMock).not.toHaveBeenCalled();
  });

  it('a good PIN typed twice turns the lock on and the card shows the on state', async () => {
    enableMock.mockResolvedValue({ status: 'ok' });
    await openPinForm();
    typePins(GOOD_PIN);
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(t('pin.card.stateOn'))).toBeInTheDocument());
    expect(enableMock).toHaveBeenCalledTimes(1);
    expect(enableMock).toHaveBeenCalledWith(GOOD_PIN);
    expect(screen.queryByLabelText(t('pin.setup.pinLabel'))).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(ENABLE_FAILURES)('result %j shows a plain message and stays off', async (result, key) => {
    enableMock.mockResolvedValue(result);
    await openPinForm();
    typePins(GOOD_PIN);
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t(key));
    expect(screen.queryByText(t('pin.card.stateOn'))).toBeNull();
  });

  it('an exception while saving is a plain message, and the typed PINs are cleared', async () => {
    enableMock.mockRejectedValue(new Error('boom'));
    await openPinForm();
    typePins(GOOD_PIN);
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('pin.setup.failed'));
    expect(pinField()).toHaveValue('');
    expect(againField()).toHaveValue('');
  });

  it('Cancel goes back to the Turn on button without saving', async () => {
    await openPinForm();
    typePins(GOOD_PIN);
    fireEvent.click(screen.getByRole('button', { name: t('pin.card.cancel') }));
    expect(turnOnButton()).toBeEnabled();
    expect(enableMock).not.toHaveBeenCalled();
  });
});

describe('PinCard: turn on without an enrolment key (after a reload)', () => {
  async function openWordsBox() {
    getEnrolKeyMock.mockReturnValue(null);
    await renderOff();
    fireEvent.click(turnOnButton());
    expect(wordsBox()).toBeInTheDocument();
  }

  it('asks for the 12 words once and does not turn anything on yet', async () => {
    await openWordsBox();
    expect(screen.queryByLabelText(t('pin.setup.pinLabel'))).toBeNull();
    expect(enableMock).not.toHaveBeenCalled();
    expect(wordsBox()).toHaveAttribute('autocomplete', 'off');
    expect(wordsBox()).toHaveAttribute('spellcheck', 'false');
  });

  it('empty words are refused without asking the session', async () => {
    await openWordsBox();
    fireEvent.click(continueButton());
    expect(screen.getByRole('alert')).toHaveTextContent(t('pin.card.badWords'));
    expect(unlockMock).not.toHaveBeenCalled();
  });

  it('words that do not open this device show the wrong-key message', async () => {
    unlockMock.mockResolvedValue({ status: 'wrong_key' });
    await openWordsBox();
    fireEvent.change(wordsBox(), { target: { value: WORDS } });
    fireEvent.click(continueButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('pin.card.wrongKey'));
    expect(screen.queryByLabelText(t('pin.setup.pinLabel'))).toBeNull();
  });

  it('words that are not valid show the bad-words message', async () => {
    unlockMock.mockResolvedValue({ status: 'invalid_words' });
    await openWordsBox();
    fireEvent.change(wordsBox(), { target: { value: 'one two three' } });
    fireEvent.click(continueButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('pin.card.badWords'));
  });

  it('good words make the enrolment key, clear the words box and open the PIN form', async () => {
    unlockMock.mockImplementation(async () => {
      getEnrolKeyMock.mockReturnValue(fakeKey);
      return { status: 'ok' };
    });
    await openWordsBox();
    fireEvent.change(wordsBox(), { target: { value: WORDS } });
    fireEvent.click(continueButton());
    expect(await screen.findByLabelText(t('pin.setup.pinLabel'))).toBeInTheDocument();
    expect(screen.queryByLabelText(t('pin.card.wordsLabel'))).toBeNull();
    expect(unlockMock).toHaveBeenCalledWith(WORDS);
    expect(document.body.textContent ?? '').not.toContain(WORDS);
  });

  it('good words but still no enrolment key (this browser could not make one) is a plain failure', async () => {
    unlockMock.mockResolvedValue({ status: 'ok' });
    await openWordsBox();
    fireEvent.change(wordsBox(), { target: { value: WORDS } });
    fireEvent.click(continueButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('pin.setup.failed'));
  });

  it('Cancel clears the words and goes back', async () => {
    await openWordsBox();
    fireEvent.change(wordsBox(), { target: { value: WORDS } });
    fireEvent.click(screen.getByRole('button', { name: t('pin.card.wordsCancel') }));
    expect(turnOnButton()).toBeEnabled();
    expect(screen.queryByLabelText(t('pin.card.wordsLabel'))).toBeNull();
    expect(document.body.textContent ?? '').not.toContain(WORDS);
  });
});

describe('PinCard: turn off', () => {
  it('turns the lock off and offers Turn on again', async () => {
    disableMock.mockResolvedValue({ status: 'ok', persisted: true });
    await renderOn();
    fireEvent.click(turnOffButton());
    await waitFor(() => expect(screen.getByText(t('pin.card.stateOff'))).toBeInTheDocument());
    expect(disableMock).toHaveBeenCalledTimes(1);
    expect(turnOnButton()).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('when the browser could not keep the key, the lock is off and a calm note says the 12 words are needed next time', async () => {
    disableMock.mockResolvedValue({ status: 'ok', persisted: false });
    await renderOn();
    fireEvent.click(turnOffButton());
    expect(await screen.findByText(t('pin.card.offNotSaved'))).toBeInTheDocument();
    expect(screen.getByText(t('pin.card.stateOff'))).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(DISABLE_FAILURES)('result %j keeps the lock on and shows a plain message', async (result) => {
    disableMock.mockResolvedValue(result);
    await renderOn();
    fireEvent.click(turnOffButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('pin.card.turnOffFailed'));
    expect(screen.getByText(t('pin.card.stateOn'))).toBeInTheDocument();
  });

  it('an exception while turning off is a plain message', async () => {
    disableMock.mockRejectedValue(new Error('boom'));
    await renderOn();
    fireEvent.click(turnOffButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(t('pin.card.turnOffFailed'));
  });
});
