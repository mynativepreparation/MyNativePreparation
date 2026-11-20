import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t, tf } from '../../core/i18n';
import { PinScreen } from './PinScreen';

// unlockWithPin is mocked: this file tests the SCREEN. The real lock logic is covered in core/identity/pin.test.ts.
const { unlockMock } = vi.hoisted(() => ({ unlockMock: vi.fn() }));

vi.mock('../../core/identity/pin', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  unlockWithPin: unlockMock,
}));

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/pin']}>
      <Routes>
        <Route path="/pin" element={<PinScreen />} />
        <Route path="/login" element={<p>LOGIN SCREEN</p>} />
        <Route path="/" element={<p>HOME SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const pinField = () => screen.getByLabelText(t('pin.enter.label')) as HTMLInputElement;
const openButton = () => screen.getByRole('button', { name: t('pin.enter.button') });
const wordsButton = () => screen.getByRole('button', { name: t('pin.enter.useWords') });

function enterAndSubmit(value: string) {
  fireEvent.change(pinField(), { target: { value } });
  fireEvent.click(openButton());
}

beforeEach(() => {
  unlockMock.mockReset();
});

describe('PinScreen', () => {
  it('has a heading, a PIN field and a way to use the 12 words instead', () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1, name: t('pin.enter.title') })).toBeInTheDocument();
    expect(pinField()).toHaveAttribute('type', 'password');
    expect(pinField()).toHaveAttribute('maxlength', '6');
    expect(wordsButton()).toBeEnabled();
  });

  it('a good PIN opens the app', async () => {
    unlockMock.mockResolvedValue({ status: 'ok' });
    renderScreen();
    enterAndSubmit('135790');
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
    expect(unlockMock).toHaveBeenCalledWith('135790');
  });

  it('a wrong PIN says how many tries are left and clears the field', async () => {
    unlockMock.mockResolvedValue({ status: 'wrong_pin', triesLeft: 3 });
    renderScreen();
    enterAndSubmit('246802');
    expect(await screen.findByRole('alert')).toHaveTextContent(tf('pin.enter.wrong', { n: 3 }));
    await waitFor(() => expect(pinField().value).toBe(''));
  });

  it('a PIN of the wrong shape is explained', async () => {
    unlockMock.mockResolvedValue({ status: 'invalid_pin', problem: 'wrong_length' });
    renderScreen();
    enterAndSubmit('123');
    expect(await screen.findByRole('alert')).toHaveTextContent(t('pin.enter.invalid'));
  });

  it('the last wrong PIN removes the lock and points to the 12 words', async () => {
    unlockMock.mockResolvedValue({ status: 'too_many_tries' });
    renderScreen();
    enterAndSubmit('246802');
    expect(await screen.findByRole('alert')).toHaveTextContent(t('pin.enter.tooMany'));
    expect(screen.queryByRole('button', { name: t('pin.enter.button') })).not.toBeInTheDocument();
    fireEvent.click(wordsButton());
    expect(await screen.findByText('LOGIN SCREEN')).toBeInTheDocument();
  });

  it('a failure or an exception shows an alert, never a crash', async () => {
    unlockMock.mockRejectedValue(new Error('boom'));
    renderScreen();
    enterAndSubmit('135790');
    expect(await screen.findByRole('alert')).toHaveTextContent(t('pin.enter.failed'));
  });

  it('"no PIN lock any more" sends the person to Login', async () => {
    unlockMock.mockResolvedValue({ status: 'no_pin' });
    renderScreen();
    enterAndSubmit('135790');
    expect(await screen.findByText('LOGIN SCREEN')).toBeInTheDocument();
  });

  it('"Use my 12 words instead" goes to Login', async () => {
    renderScreen();
    fireEvent.click(wordsButton());
    expect(await screen.findByText('LOGIN SCREEN')).toBeInTheDocument();
    expect(unlockMock).not.toHaveBeenCalled();
  });
});
