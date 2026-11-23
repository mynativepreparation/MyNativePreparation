import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { PinScreen } from './PinScreen';

// Owner report 2026-11-22: a deep link (#/admin) was lost after unlocking with the PIN. The PIN screen now goes to the address carried
// in the router state, and passes it on to Login when the person uses the 12 words instead.
const { unlockMock } = vi.hoisted(() => ({ unlockMock: vi.fn() }));

type Entry = string | { pathname: string; state?: unknown };

vi.mock('../../core/identity/pin', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  unlockWithPin: unlockMock,
}));

function LoginStub() {
  const { state } = useLocation();
  return <p>{`LOGIN SCREEN from=${JSON.stringify(state)}`}</p>;
}

function renderPin(entry: Entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/pin" element={<PinScreen />} />
        <Route path="/login" element={<LoginStub />} />
        <Route path="/admin" element={<p>ADMIN SCREEN</p>} />
        <Route path="/" element={<p>HOME SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const enterPin = () => {
  fireEvent.change(screen.getByLabelText(t('pin.enter.label')), { target: { value: '135790' } });
  fireEvent.click(screen.getByRole('button', { name: t('pin.enter.button') }));
};

beforeEach(() => {
  unlockMock.mockReset();
  unlockMock.mockResolvedValue({ status: 'ok' });
});

describe('PinScreen: going back to the address that was asked for', () => {
  it('a good PIN opens the carried address (#/admin), not Home', async () => {
    renderPin({ pathname: '/pin', state: { from: '/admin' } });
    enterPin();
    expect(await screen.findByText('ADMIN SCREEN')).toBeInTheDocument();
    expect(screen.queryByText('HOME SCREEN')).not.toBeInTheDocument();
  });

  it('without a carried address a good PIN still goes Home', async () => {
    renderPin('/pin');
    enterPin();
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });

  it('"Use my 12 words instead" passes the carried address on to Login', async () => {
    renderPin({ pathname: '/pin', state: { from: '/admin' } });
    fireEvent.click(screen.getByRole('button', { name: t('pin.enter.useWords') }));
    expect(await screen.findByText('LOGIN SCREEN from={"from":"/admin"}')).toBeInTheDocument();
  });

  it('"Use my 12 words instead" without a carried address passes nothing (state stays empty)', async () => {
    renderPin('/pin');
    fireEvent.click(screen.getByRole('button', { name: t('pin.enter.useWords') }));
    expect(await screen.findByText('LOGIN SCREEN from=null')).toBeInTheDocument();
  });

  it('when no PIN exists any more it goes to Login and keeps the carried address', async () => {
    unlockMock.mockResolvedValue({ status: 'no_pin' });
    renderPin({ pathname: '/pin', state: { from: '/admin' } });
    enterPin();
    expect(await screen.findByText('LOGIN SCREEN from={"from":"/admin"}')).toBeInTheDocument();
  });
});
