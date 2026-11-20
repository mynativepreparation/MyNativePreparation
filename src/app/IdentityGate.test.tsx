import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearStoreKey, setStoreKey } from '../core/identity/keyring';
import { deleteSetting, setSetting } from '../core/storage/repo';
import { clearSessionRecords } from '../core/storage/sessionStore';
import { wire } from '../core/wire/wire';
import { IdentityGate } from './IdentityGate';

// No real crypto here: "logged in" is simulated by putting a placeholder key in memory (the guard only asks whether a key exists).
const FAKE_KEY = {} as unknown as CryptoKey;

beforeEach(async () => {
  clearStoreKey();
  await clearSessionRecords();
  await deleteSetting('identity.onboarded');
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<IdentityGate />}>
          <Route index element={<p>HOME SCREEN</p>} />
          <Route path="settings" element={<p>SETTINGS SCREEN</p>} />
          <Route path="welcome" element={<p>WELCOME SCREEN</p>} />
          <Route path="login" element={<p>LOGIN SCREEN</p>} />
          <Route path="register" element={<p>REGISTER SCREEN</p>} />
          <Route path="info" element={<p>INFO SCREEN</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('IdentityGate', () => {
  it('first run: the app opens on Welcome, whatever address was asked for', async () => {
    renderAt('/settings');
    expect(await screen.findByText('WELCOME SCREEN')).toBeInTheDocument();
    expect(screen.queryByText('SETTINGS SCREEN')).not.toBeInTheDocument();
  });

  it('shows a loading text first', () => {
    renderAt('/');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('onboarded but locked: goes to Login', async () => {
    await setSetting('identity.onboarded', true);
    renderAt('/');
    expect(await screen.findByText('LOGIN SCREEN')).toBeInTheDocument();
  });

  it('logged in and onboarded: goes straight in (no 12 words, no Login screen)', async () => {
    await setSetting('identity.onboarded', true);
    setStoreKey(FAKE_KEY);
    renderAt('/');
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });

  it('logged in and onboarded: a link to Login leads to Home', async () => {
    await setSetting('identity.onboarded', true);
    setStoreKey(FAKE_KEY);
    renderAt('/login');
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });

  it('logged in but onboarding not finished: opens Info, but Register may stay', async () => {
    setStoreKey(FAKE_KEY);
    renderAt('/');
    expect(await screen.findByText('INFO SCREEN')).toBeInTheDocument();
  });

  it('Register stays visible after the identity was created (no jump while the next screen loads)', async () => {
    renderAt('/register');
    expect(await screen.findByText('REGISTER SCREEN')).toBeInTheDocument();
    act(() => {
      setStoreKey(FAKE_KEY);
      wire.emit('identity:unlocked', {});
    });
    expect(screen.getByText('REGISTER SCREEN')).toBeInTheDocument();
  });

  it('Log out while using the app sends a returning user to Login at once', async () => {
    await setSetting('identity.onboarded', true);
    setStoreKey(FAKE_KEY);
    renderAt('/settings');
    expect(await screen.findByText('SETTINGS SCREEN')).toBeInTheDocument();

    act(() => {
      clearStoreKey();
      wire.emit('identity:locked', {});
    });
    expect(await screen.findByText('LOGIN SCREEN')).toBeInTheDocument();
  });

  it('finishing onboarding lets the person into the app', async () => {
    setStoreKey(FAKE_KEY);
    renderAt('/info');
    expect(await screen.findByText('INFO SCREEN')).toBeInTheDocument();

    act(() => {
      wire.emit('identity:onboarded', {});
    });
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });
});
