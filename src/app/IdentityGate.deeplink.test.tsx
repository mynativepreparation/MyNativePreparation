import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearStoreKey, setStoreKey } from '../core/identity/keyring';
import { deleteSetting, setSetting } from '../core/storage/repo';
import { clearSessionRecords } from '../core/storage/sessionStore';
import { wire } from '../core/wire/wire';
import { IdentityGate } from './IdentityGate';

// Owner report 2026-11-22: opening #/admin while the app is locked ended on Home. The Gate now carries the wanted address
// through the lock screen (router state `from`) and goes there after unlocking. No real crypto: a placeholder key stands for "logged in".
const FAKE_KEY = {} as unknown as CryptoKey;

type Entry = string | { pathname: string; state?: unknown };

beforeEach(async () => {
  clearStoreKey();
  await clearSessionRecords();
  await deleteSetting('identity.onboarded');
});

/** A fake lock screen that shows what it was handed in the router state. */
function LockStub({ name }: { name: string }) {
  const { state } = useLocation();
  return <p>{`${name} SCREEN from=${JSON.stringify(state)}`}</p>;
}

function renderAt(entry: Entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<IdentityGate />}>
          <Route index element={<p>HOME SCREEN</p>} />
          <Route path="admin" element={<p>ADMIN SCREEN</p>} />
          <Route path="settings" element={<p>SETTINGS SCREEN</p>} />
          <Route path="login" element={<LockStub name="LOGIN" />} />
          <Route path="welcome" element={<LockStub name="WELCOME" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('IdentityGate: deep links through the lock', () => {
  it('onboarded but locked: opens Login and hands it the address that was asked for', async () => {
    await setSetting('identity.onboarded', true);
    renderAt('/admin');
    expect(await screen.findByText('LOGIN SCREEN from={"from":"/admin"}')).toBeInTheDocument();
  });

  it('after unlocking, the person lands on the address that was asked for, not on Home', async () => {
    await setSetting('identity.onboarded', true);
    renderAt('/admin');
    await screen.findByText(/LOGIN SCREEN/);
    act(() => {
      setStoreKey(FAKE_KEY);
      wire.emit('identity:unlocked', {});
    });
    expect(await screen.findByText('ADMIN SCREEN')).toBeInTheDocument();
    expect(screen.queryByText('HOME SCREEN')).not.toBeInTheDocument();
  });

  it('a plain app open (Home) carries nothing and still goes Home after unlocking', async () => {
    await setSetting('identity.onboarded', true);
    renderAt('/');
    expect(await screen.findByText('LOGIN SCREEN from=null')).toBeInTheDocument();
    act(() => {
      setStoreKey(FAKE_KEY);
      wire.emit('identity:unlocked', {});
    });
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });

  it('logged in and onboarded: the address opens directly (no lock screen in between)', async () => {
    await setSetting('identity.onboarded', true);
    setStoreKey(FAKE_KEY);
    renderAt('/admin');
    expect(await screen.findByText('ADMIN SCREEN')).toBeInTheDocument();
  });

  it('a lock screen that still holds the address passes an unlocked person on to it', async () => {
    await setSetting('identity.onboarded', true);
    setStoreKey(FAKE_KEY);
    renderAt({ pathname: '/login', state: { from: '/settings' } });
    expect(await screen.findByText('SETTINGS SCREEN')).toBeInTheDocument();
  });

  it('ignores a foreign or looping address in the state: Home', async () => {
    await setSetting('identity.onboarded', true);
    setStoreKey(FAKE_KEY);
    renderAt({ pathname: '/login', state: { from: '//evil.example/x' } });
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });

  it('first run: a deep link still opens Welcome', async () => {
    renderAt('/admin');
    expect(await screen.findByText(/WELCOME SCREEN/)).toBeInTheDocument();
  });
});
