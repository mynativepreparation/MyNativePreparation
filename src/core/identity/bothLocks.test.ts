// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSessionRecords, getSessionRecord } from '../storage/sessionStore';
import { deleteSetting } from '../storage/repo';
import { disableFingerprint, enableFingerprint, getFingerprintState, unlockWithFingerprint, type PlatformAuth } from './biometric';
import { getEnrolKey } from './keyring';
import { disablePin, enablePin, getPinState, unlockWithPin } from './pin';
import { createIdentity, isUnlocked, lock, STORE_KEY_RECORD, unlock } from './session';
import { AUTH_ROUTES, decideRoute, loadIdentityStatus, markOnboarded } from './status';

// Both app locks on at the same time (P04 T12d, owner decision 2026-11-19, changed after the phone test):
// a good fingerprint opens the app straight away; without it (cancelled or failed) the PIN screen is the way in; the 12 words always work.
const WORDS = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const GOOD_PIN = '483920';
const PIN_OPTIONS = { iterations: 1000 };

interface FakeAuth extends PlatformAuth {
  verifyCalls: number;
  mode: 'ok' | 'cancelled';
}

/** A fake phone. `prf: true` gives the PRF level, `prf: false` the gate level. */
function fakePhone(prf: boolean): FakeAuth {
  const phone: FakeAuth = {
    verifyCalls: 0,
    mode: 'ok',
    isAvailable: async () => true,
    supportsPrf: async () => prf,
    enroll: async () => ({ status: 'ok', value: { credentialId: new Uint8Array([1, 2, 3, 4]), prfSupported: prf } }),
    verify: async (_id, salt) => {
      phone.verifyCalls += 1;
      if (phone.mode === 'cancelled') return { status: 'cancelled' };
      return { status: 'ok', value: { prf: salt === undefined ? null : new Uint8Array(32).fill(7) } };
    },
  };
  return phone;
}

const plainKeySaved = async () => Boolean(await getSessionRecord(STORE_KEY_RECORD));

/** Register, finish onboarding and return the extractable enrolment key (the one Settings uses to turn a lock on). */
async function registered(): Promise<CryptoKey> {
  expect((await createIdentity(WORDS)).status).toBe('ok');
  await markOnboarded();
  const key = getEnrolKey();
  if (key === null) throw new Error('no enrolment key after Register');
  return key;
}

/** Both locks on, fingerprint first and then PIN. */
async function bothOn(phone: FakeAuth): Promise<void> {
  const key = await registered();
  expect((await enableFingerprint(key, phone)).status).toBe('ok');
  expect((await enablePin(GOOD_PIN, { ...PIN_OPTIONS, storeKey: key })).status).toBe('ok');
  lock(); // a new page load
  phone.verifyCalls = 0;
}

beforeEach(async () => {
  lock();
  await clearSessionRecords();
  await deleteSetting('identity.check');
  await deleteSetting('identity.onboarded');
});

describe('both locks on (gate-level fingerprint + PIN)', () => {
  it('turning both on works in either order and the plain key stays for the fingerprint', async () => {
    const phone = fakePhone(false);
    const key = await registered();
    expect((await enableFingerprint(key, phone)).status).toBe('ok');
    expect((await enablePin(GOOD_PIN, { ...PIN_OPTIONS, storeKey: key })).status).toBe('ok');
    expect(await plainKeySaved()).toBe(true);
    expect((await getFingerprintState()).enabled).toBe(true);
    expect((await getPinState()).enabled).toBe(true);
  });

  it('PIN first, fingerprint second also works', async () => {
    const phone = fakePhone(false);
    const key = await registered();
    expect((await enablePin(GOOD_PIN, { ...PIN_OPTIONS, storeKey: key })).status).toBe('ok');
    expect(await plainKeySaved()).toBe(false); // PIN alone: no plain key
    expect((await enableFingerprint(key, phone)).status).toBe('ok');
    expect(await plainKeySaved()).toBe(true); // the gate level needs it to open the app
    expect((await getPinState()).enabled).toBe(true);
  });

  it('app open: a good fingerprint opens the app straight away, with no PIN', async () => {
    const phone = fakePhone(false);
    await bothOn(phone);
    const status = await loadIdentityStatus(phone);
    expect(status).toEqual({ unlocked: true, onboarded: true });
    expect(phone.verifyCalls).toBe(1);
    expect(isUnlocked()).toBe(true);
    expect(decideRoute(status, '/')).toBeNull();
  });

  it('app open: without the fingerprint (cancelled) the PIN screen opens, and the right PIN unlocks', async () => {
    const phone = fakePhone(false);
    await bothOn(phone);
    phone.mode = 'cancelled';
    const status = await loadIdentityStatus(phone);
    expect(status).toEqual({ unlocked: false, onboarded: true, pinLocked: true });
    expect(decideRoute(status, '/')).toBe(AUTH_ROUTES.pin);
    expect(isUnlocked()).toBe(false);
    expect((await unlockWithPin(GOOD_PIN)).status).toBe('ok');
    expect(isUnlocked()).toBe(true);
  });

  it('the 12 words still unlock when the fingerprint was cancelled', async () => {
    const phone = fakePhone(false);
    await bothOn(phone);
    phone.mode = 'cancelled';
    await loadIdentityStatus(phone);
    expect((await unlock(WORDS)).status).toBe('ok');
    expect(isUnlocked()).toBe(true);
  });

  it('turning the PIN off keeps the fingerprint working', async () => {
    const phone = fakePhone(false);
    const key = await registered();
    await enableFingerprint(key, phone);
    await enablePin(GOOD_PIN, { ...PIN_OPTIONS, storeKey: key });
    expect((await disablePin()).status).toBe('ok');
    expect(await plainKeySaved()).toBe(true);
    expect((await getPinState()).enabled).toBe(false);
    lock();
    expect((await unlockWithFingerprint(phone)).status).toBe('ok');
    expect(isUnlocked()).toBe(true);
  });

  it('turning the fingerprint off keeps the PIN lock and removes the plain key, so the PIN guards the data again', async () => {
    const phone = fakePhone(false);
    const key = await registered();
    await enableFingerprint(key, phone);
    await enablePin(GOOD_PIN, { ...PIN_OPTIONS, storeKey: key });
    expect((await disableFingerprint()).status).toBe('ok');
    expect(await plainKeySaved()).toBe(false);
    expect((await getFingerprintState()).enabled).toBe(false);
    expect((await getPinState()).enabled).toBe(true);
    lock();
    phone.verifyCalls = 0;
    expect(await loadIdentityStatus(phone)).toEqual({ unlocked: false, onboarded: true, pinLocked: true });
    expect(phone.verifyCalls).toBe(0);
  });
});

describe('both locks on (PRF-level fingerprint + PIN)', () => {
  it('no plain key is ever saved, a good fingerprint opens the app, no PIN', async () => {
    const phone = fakePhone(true);
    const key = await registered();
    expect(await enableFingerprint(key, phone)).toEqual({ status: 'ok', level: 'prf' });
    await enablePin(GOOD_PIN, { ...PIN_OPTIONS, storeKey: key });
    expect(await plainKeySaved()).toBe(false);
    lock();
    expect(await loadIdentityStatus(phone)).toEqual({ unlocked: true, onboarded: true });
    expect(isUnlocked()).toBe(true);
  });

  it('a cancelled fingerprint goes to the PIN screen and the PIN opens the key', async () => {
    const phone = fakePhone(true);
    await bothOn(phone);
    phone.mode = 'cancelled';
    expect(await loadIdentityStatus(phone)).toEqual({ unlocked: false, onboarded: true, pinLocked: true });
    expect((await unlockWithPin(GOOD_PIN)).status).toBe('ok');
    expect(isUnlocked()).toBe(true);
  });

  it('turning the PIN off keeps the plain key away, and the fingerprint alone still opens the app', async () => {
    const phone = fakePhone(true);
    const key = await registered();
    await enableFingerprint(key, phone);
    await enablePin(GOOD_PIN, { ...PIN_OPTIONS, storeKey: key });
    expect((await disablePin()).status).toBe('ok');
    expect(await plainKeySaved()).toBe(false);
    lock();
    expect(await loadIdentityStatus(phone)).toEqual({ unlocked: true, onboarded: true });
  });

  it('a 12-word login while both locks exist never brings the plain key back', async () => {
    const phone = fakePhone(true);
    await bothOn(phone);
    expect((await unlock(WORDS)).status).toBe('ok');
    expect(await plainKeySaved()).toBe(false);
  });
});
