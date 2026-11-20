// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSessionRecords } from '../storage/sessionStore';
import { deleteSetting } from '../storage/repo';
import { wire } from '../wire/wire';
import { enablePin, unlockWithPin } from './pin';
import { createIdentity, isUnlocked, lock, logOut } from './session';
import { AUTH_ROUTES, decideRoute, loadIdentityStatus, markOnboarded, type IdentityStatus } from './status';

const WORDS = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const GOOD_PIN = '483920';

beforeEach(async () => {
  lock();
  await clearSessionRecords();
  await deleteSetting('identity.check');
  await deleteSetting('identity.onboarded');
});

const newUser: IdentityStatus = { unlocked: false, onboarded: false };
const returningLocked: IdentityStatus = { unlocked: false, onboarded: true };
const midOnboarding: IdentityStatus = { unlocked: true, onboarded: false };
const insideApp: IdentityStatus = { unlocked: true, onboarded: true };

describe('decideRoute', () => {
  it.each([
    ['/', AUTH_ROUTES.welcome],
    ['/settings', AUTH_ROUTES.welcome],
    ['/info', AUTH_ROUTES.welcome],
    ['/welcome', null],
    ['/register', null],
    ['/login', null],
  ])('first run, %s -> %s', (path, expected) => {
    expect(decideRoute(newUser, path)).toBe(expected);
  });

  it.each([
    ['/', AUTH_ROUTES.login],
    ['/settings', AUTH_ROUTES.login],
    ['/privacy', AUTH_ROUTES.login],
    ['/login', null],
    ['/welcome', null],
    ['/register', null],
  ])('onboarded but locked, %s -> %s', (path, expected) => {
    expect(decideRoute(returningLocked, path)).toBe(expected);
  });

  it.each([
    ['/', AUTH_ROUTES.info],
    ['/settings', AUTH_ROUTES.info],
    ['/register', null],
    ['/login', null],
    ['/fingerprint', null],
    ['/info', null],
    ['/privacy', null],
  ])('logged in, onboarding not finished, %s -> %s', (path, expected) => {
    expect(decideRoute(midOnboarding, path)).toBe(expected);
  });

  it.each([
    ['/', null],
    ['/settings', null],
    ['/welcome', AUTH_ROUTES.home],
    ['/register', AUTH_ROUTES.home],
    ['/login', AUTH_ROUTES.home],
    ['/fingerprint', AUTH_ROUTES.home],
    ['/info', AUTH_ROUTES.home],
    ['/privacy', AUTH_ROUTES.home],
  ])('logged in and onboarded, %s -> %s', (path, expected) => {
    expect(decideRoute(insideApp, path)).toBe(expected);
  });

  it.each([
    ['/', AUTH_ROUTES.pin],
    ['/settings', AUTH_ROUTES.pin],
    ['/privacy', AUTH_ROUTES.pin],
    ['/pin', null],
    ['/login', null],
    ['/welcome', null],
    ['/register', null],
  ])('PIN lock on and the app locked, %s -> %s', (path, expected) => {
    expect(decideRoute({ unlocked: false, onboarded: true, pinLocked: true }, path)).toBe(expected);
  });

  it('the PIN screens only make sense at the right time', () => {
    expect(decideRoute(insideApp, '/pin')).toBe(AUTH_ROUTES.home);
    expect(decideRoute(insideApp, '/pin-setup')).toBe(AUTH_ROUTES.home);
    expect(decideRoute(midOnboarding, '/pin-setup')).toBeNull();
    expect(decideRoute(midOnboarding, '/pin')).toBe(AUTH_ROUTES.info);
    expect(decideRoute(newUser, '/pin')).toBe(AUTH_ROUTES.welcome);
  });

  it('ignores a trailing slash', () => {
    expect(decideRoute(newUser, '/login/')).toBeNull();
    expect(decideRoute(insideApp, '/login/')).toBe(AUTH_ROUTES.home);
  });
});

describe('loadIdentityStatus', () => {
  it('first run: not unlocked, not onboarded', async () => {
    expect(await loadIdentityStatus()).toEqual({ unlocked: false, onboarded: false });
  });

  it('after Register and closing the tab: unlocked again WITHOUT the 12 words, onboarding still open', async () => {
    expect((await createIdentity(WORDS)).status).toBe('ok');
    lock(); // simulates a new page load
    expect(await loadIdentityStatus()).toEqual({ unlocked: true, onboarded: false });
  });

  it('markOnboarded is remembered and announced on the wire', async () => {
    const heard = vi.fn();
    const stop = wire.on('identity:onboarded', heard);
    await markOnboarded();
    stop();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith({});
    expect(await loadIdentityStatus()).toEqual({ unlocked: false, onboarded: true });
  });

  it('after Log out: locked but still onboarded, so the app goes to Login', async () => {
    await createIdentity(WORDS);
    await markOnboarded();
    await logOut();
    const status = await loadIdentityStatus();
    expect(status).toEqual({ unlocked: false, onboarded: true });
    expect(decideRoute(status, '/')).toBe(AUTH_ROUTES.login);
  });

  it('PIN lock on and the page reloaded: not unlocked, asks for the PIN, and the PIN screen is the way in', async () => {
    await createIdentity(WORDS);
    await markOnboarded();
    expect((await enablePin(GOOD_PIN, { iterations: 1000 })).status).toBe('ok');
    lock(); // simulates a new page load: the plain key is gone, only the PIN-wrapped copy is left
    const status = await loadIdentityStatus();
    expect(status).toEqual({ unlocked: false, onboarded: true, pinLocked: true });
    expect(decideRoute(status, '/')).toBe(AUTH_ROUTES.pin);
    expect(decideRoute(status, '/login')).toBeNull();
  });

  it('PIN lock on: the right PIN opens the app again without the 12 words', async () => {
    await createIdentity(WORDS);
    await markOnboarded();
    expect((await enablePin(GOOD_PIN, { iterations: 1000 })).status).toBe('ok');
    lock();
    expect(isUnlocked()).toBe(false);
    expect((await unlockWithPin(GOOD_PIN)).status).toBe('ok');
    expect(isUnlocked()).toBe(true);
  });

  it('PIN lock on and then Log out: the lock is gone with the session, so the app goes to Login', async () => {
    await createIdentity(WORDS);
    await markOnboarded();
    await enablePin(GOOD_PIN, { iterations: 1000 });
    await logOut();
    const status = await loadIdentityStatus();
    expect(status).toEqual({ unlocked: false, onboarded: true });
    expect(decideRoute(status, '/')).toBe(AUTH_ROUTES.login);
  });

  it('a normal app open of an onboarded user goes straight in', async () => {
    await createIdentity(WORDS);
    await markOnboarded();
    lock();
    const status = await loadIdentityStatus();
    expect(status).toEqual({ unlocked: true, onboarded: true });
    expect(decideRoute(status, '/')).toBeNull();
  });
});
