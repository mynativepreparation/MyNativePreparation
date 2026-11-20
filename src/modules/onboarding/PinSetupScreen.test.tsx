import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { PinSetupScreen } from './PinSetupScreen';

// enablePin and the enrolment key are mocked: this file tests the SCREEN. The real lock logic is covered in core/identity/pin.test.ts.
const { enableMock, clearEnrolKeyMock } = vi.hoisted(() => ({
  enableMock: vi.fn(),
  clearEnrolKeyMock: vi.fn(),
}));

vi.mock('../../core/identity/pin', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  enablePin: enableMock,
}));

vi.mock('../../core/identity/session', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  clearEnrolKey: clearEnrolKeyMock,
}));

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/pin-setup']}>
      <Routes>
        <Route path="/pin-setup" element={<PinSetupScreen />} />
        <Route path="/info" element={<p>INFO SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const pinField = () => screen.getByLabelText(t('pin.setup.pinLabel'));
const againField = () => screen.getByLabelText(t('pin.setup.againLabel'));
const turnOnButton = () => screen.getByRole('button', { name: t('pin.setup.turnOn') });
const skipButton = () => screen.getByRole('button', { name: t('pin.setup.skip') });

function submit(pin: string, again: string = pin) {
  fireEvent.change(pinField(), { target: { value: pin } });
  fireEvent.change(againField(), { target: { value: again } });
  fireEvent.click(turnOnButton());
}

beforeEach(() => {
  enableMock.mockReset();
  clearEnrolKeyMock.mockReset();
});

describe('PinSetupScreen: layout', () => {
  it('says it is optional, that the 12 words still work and that a PIN is weaker than them', () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1, name: t('pin.setup.title') })).toBeInTheDocument();
    expect(t('pin.setup.intro')).toContain('optional');
    expect(t('pin.setup.intro')).toContain('12 words');
    expect(screen.getByText(t('pin.setup.honest'))).toBeInTheDocument();
    expect(t('pin.setup.honest')).toContain('not as strong');
    expect(skipButton()).toBeEnabled();
  });
});

describe('PinSetupScreen: turning on', () => {
  it('a good PIN typed twice turns the lock on and then continues to Info', async () => {
    enableMock.mockResolvedValue({ status: 'ok' });
    renderScreen();
    submit('135790');
    expect(await screen.findByText(t('pin.setup.done'))).toBeInTheDocument();
    expect(enableMock).toHaveBeenCalledWith('135790');
    fireEvent.click(screen.getByRole('button', { name: t('pin.setup.continue') }));
    expect(await screen.findByText('INFO SCREEN')).toBeInTheDocument();
    expect(clearEnrolKeyMock).toHaveBeenCalled();
  });

  it('two different PINs are refused before anything is saved', () => {
    renderScreen();
    submit('135790', '135791');
    expect(screen.getByRole('alert')).toHaveTextContent(t('pin.setup.mismatch'));
    expect(enableMock).not.toHaveBeenCalled();
  });

  it('an easy PIN is refused with a reason', () => {
    renderScreen();
    submit('111111');
    expect(screen.getByRole('alert')).toHaveTextContent(t('pin.setup.tooEasy'));
    expect(enableMock).not.toHaveBeenCalled();
  });

  it('a PIN of the wrong length or with letters is refused', () => {
    renderScreen();
    submit('123');
    expect(screen.getByRole('alert')).toHaveTextContent(t('pin.setup.wrongLength'));
    submit('12ab56');
    expect(screen.getByRole('alert')).toHaveTextContent(t('pin.setup.notDigits'));
    expect(enableMock).not.toHaveBeenCalled();
  });

  it('without an enrolment key (page reloaded) asks for the 12 words', async () => {
    enableMock.mockResolvedValue({ status: 'needs_words' });
    renderScreen();
    submit('135790');
    expect(await screen.findByRole('alert')).toHaveTextContent(t('pin.setup.noKey'));
    expect(skipButton()).toBeEnabled();
  });

  it('a failure or an exception shows an alert and still lets the person skip', async () => {
    enableMock.mockRejectedValue(new Error('boom'));
    renderScreen();
    submit('135790');
    expect(await screen.findByRole('alert')).toHaveTextContent(t('pin.setup.failed'));
    expect(skipButton()).toBeEnabled();
  });
});

describe('PinSetupScreen: skipping', () => {
  it('Skip goes to Info, forgets the enrolment key and never touches the lock', async () => {
    renderScreen();
    fireEvent.click(skipButton());
    expect(await screen.findByText('INFO SCREEN')).toBeInTheDocument();
    expect(clearEnrolKeyMock).toHaveBeenCalled();
    expect(enableMock).not.toHaveBeenCalled();
  });
});
