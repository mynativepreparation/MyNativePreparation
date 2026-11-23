import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { LoginScreen } from './LoginScreen';

// Owner report 2026-11-22: a deep link (#/admin) was lost after unlocking. Login now goes to the address carried in the router state.
const { unlockMock, markOnboardedMock } = vi.hoisted(() => ({ unlockMock: vi.fn(), markOnboardedMock: vi.fn() }));

vi.mock('../../core/identity/session', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  unlock: unlockMock,
}));
vi.mock('../../core/identity/status', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  markOnboarded: markOnboardedMock,
}));

const VALID = `${'abandon '.repeat(11)}about`;

type Entry = string | { pathname: string; state?: unknown };

function renderLogin(entry: Entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/admin" element={<p>ADMIN SCREEN</p>} />
        <Route path="/" element={<p>HOME SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function submitWords() {
  fireEvent.change(screen.getByLabelText(t('login.label')), { target: { value: VALID } });
  fireEvent.click(screen.getByRole('button', { name: t('login.button') }));
}

beforeEach(() => {
  unlockMock.mockReset();
  markOnboardedMock.mockReset();
  unlockMock.mockResolvedValue({ status: 'ok', persisted: true });
  markOnboardedMock.mockResolvedValue(undefined);
});

describe('LoginScreen: going back to the address that was asked for', () => {
  it('after a successful login it opens the carried address (#/admin), not Home', async () => {
    renderLogin({ pathname: '/login', state: { from: '/admin' } });
    submitWords();
    expect(await screen.findByText('ADMIN SCREEN')).toBeInTheDocument();
    expect(screen.queryByText('HOME SCREEN')).not.toBeInTheDocument();
  });

  it('without a carried address it still goes Home', async () => {
    renderLogin('/login');
    submitWords();
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });

  it('a foreign or looping address in the state is ignored: Home', async () => {
    renderLogin({ pathname: '/login', state: { from: '//evil.example/x' } });
    submitWords();
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });

  it('a wrong key stays on Login and goes nowhere', async () => {
    unlockMock.mockResolvedValue({ status: 'wrong_key' });
    renderLogin({ pathname: '/login', state: { from: '/admin' } });
    submitWords();
    expect(await screen.findByRole('alert')).toHaveTextContent(t('login.wrongKey'));
    expect(screen.queryByText('ADMIN SCREEN')).not.toBeInTheDocument();
  });
});
