// @vitest-environment node
// Fingerprint lock tests with a FAKE PlatformAuth: the real WebAuthn prompt cannot run here, the owner's browser check (T13) covers it.
// Session records live in fake-indexeddb (src/test-setup.ts). Tests outside src/core/storage reset state only through the repository and sessionStore.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserPlatformAuth,
  disableFingerprint,
  enableFingerprint,
  getFingerprintState,
  unlockWithFingerprint,
  type AuthFailureStatus,
  type AuthOutcome,
  type EnrollInfo,
  type PlatformAuth,
  type VerifyInfo,
} from './biometric';
import { decryptJson, encryptJson, toBase64Url } from './cipher';
import { deriveKey } from './kdf';
import { createIdentity, getStoreKey, isUnlocked, lock, logOut, restoreSession, unlock } from './session';
import { deleteSetting } from '../storage/repo';
import { clearSessionRecords, deleteSessionRecord, getSessionRecord, putSessionRecord } from '../storage/sessionStore';
import { wire } from '../wire/wire';

// Official BIP39 test vectors: valid phrases, different keys.
const WORDS_A = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const WORDS_B = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

/** Ids inside the session database (see session.ts and biometric.ts). */
const STORE_KEY = 'store-key';
const FINGERPRINT = 'fingerprint';

function bytes(length: number, fill: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(length).fill(fill);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * A pretend phone. Every setting can be changed per test.
 * `secret` is what the authenticator gives as the PRF secret when a salt is asked for (null = it gives nothing).
 * It always returns COPIES, because the real code overwrites the bytes it was given.
 */
class FakeAuth implements PlatformAuth {
  available = true;
  /** What enroll() reports as `prfSupported`. */
  prfCapable = true;
  secret: Uint8Array<ArrayBuffer> | null = bytes(32, 7);
  enrollStatus: 'ok' | AuthFailureStatus = 'ok';
  verifyStatus: 'ok' | AuthFailureStatus = 'ok';
  enrolls = 0;
  /** One entry per fingerprint prompt: the salt as text, or null when no salt was asked. */
  verifies: Array<string | null> = [];
  private readonly credentialId = bytes(16, 3);

  isAvailable(): Promise<boolean> {
    return Promise.resolve(this.available);
  }

  supportsPrf(): Promise<boolean> {
    return Promise.resolve(this.prfCapable);
  }

  enroll(): Promise<AuthOutcome<EnrollInfo>> {
    this.enrolls += 1;
    let outcome: AuthOutcome<EnrollInfo>;
    if (this.enrollStatus !== 'ok') {
      outcome = { status: this.enrollStatus };
    } else {
      outcome = { status: 'ok', value: { credentialId: Uint8Array.from(this.credentialId), prfSupported: this.prfCapable } };
    }
    return Promise.resolve(outcome);
  }

  verify(credentialId: Uint8Array<ArrayBuffer>, prfSalt?: Uint8Array<ArrayBuffer>): Promise<AuthOutcome<VerifyInfo>> {
    this.verifies.push(prfSalt === undefined ? null : new TextDecoder().decode(prfSalt));
    let outcome: AuthOutcome<VerifyInfo>;
    if (this.verifyStatus !== 'ok') {
      outcome = { status: this.verifyStatus };
    } else if (!sameBytes(credentialId, this.credentialId)) {
      outcome = { status: 'failed' };
    } else {
      outcome = { status: 'ok', value: { prf: prfSalt !== undefined && this.secret !== null ? Uint8Array.from(this.secret) : null } };
    }
    return Promise.resolve(outcome);
  }
}

let auth: FakeAuth;

beforeEach(async () => {
  auth = new FakeAuth();
  lock();
  await clearSessionRecords();
  await deleteSetting('identity.check');
});

async function register(words = WORDS_A): Promise<void> {
  expect((await createIdentity(words)).status).toBe('ok');
}

/** The extractable copy of the store key that the caller makes while the 12 words are in memory. */
function extractableKey(words = WORDS_A): Promise<CryptoKey> {
  return deriveKey(words, 'store', { extractable: true });
}

async function enable(fake: FakeAuth, words = WORDS_A) {
  await register(words);
  return enableFingerprint(await extractableKey(words), fake);
}

async function rawKeyText(key: CryptoKey): Promise<string> {
  return toBase64Url(new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key)));
}

describe('getFingerprintState', () => {
  it('is off on a device that never turned it on', async () => {
    expect(await getFingerprintState()).toEqual({ enabled: false });
  });

  it.each([
    ['text', 'text'],
    ['null', null],
    ['an unknown version', { v: 2, level: 'gate', credentialId: 'AAAA' }],
    ['an unknown level', { v: 1, level: 'face', credentialId: 'AAAA' }],
    ['no credential id', { v: 1, level: 'gate' }],
    ['the PRF level without a wrapped key', { v: 1, level: 'prf', credentialId: 'AAAA' }],
  ])('treats a damaged record (%s) as off, never throws', async (_label, junk) => {
    await putSessionRecord(FINGERPRINT, junk);
    expect(await getFingerprintState()).toEqual({ enabled: false });
  });
});

describe('enableFingerprint: refusals and cancelling change nothing', () => {
  it('refuses a key that is not extractable and never shows a prompt', async () => {
    await register();
    expect(await enableFingerprint(getStoreKey(), auth)).toEqual({ status: 'failed', reason: 'not_extractable' });
    expect(auth.enrolls).toBe(0);
    expect(await getFingerprintState()).toEqual({ enabled: false });
  });

  it('refuses while nobody is logged in', async () => {
    expect(await enableFingerprint(await extractableKey(), auth)).toEqual({ status: 'failed', reason: 'locked' });
    expect(auth.enrolls).toBe(0);
  });

  it('refuses a key that does not open the data on this device', async () => {
    await register(WORDS_A);
    expect(await enableFingerprint(await extractableKey(WORDS_B), auth)).toEqual({ status: 'failed', reason: 'wrong_key' });
    expect(auth.enrolls).toBe(0);
    expect(await getFingerprintState()).toEqual({ enabled: false });
  });

  it('says "unsupported" when this device has no fingerprint, face or screen lock', async () => {
    auth.available = false;
    expect(await enable(auth)).toEqual({ status: 'unsupported' });
    expect(auth.enrolls).toBe(0);
    expect(await getFingerprintState()).toEqual({ enabled: false });
  });

  it.each([['cancelled'], ['unsupported']] as const)('%s while creating the credential leaves everything as it was', async (status) => {
    auth.enrollStatus = status;
    expect(await enable(auth)).toEqual({ status });
    expect(await getFingerprintState()).toEqual({ enabled: false });
    expect(await getSessionRecord(FINGERPRINT)).toBeUndefined();
    expect(await getSessionRecord(STORE_KEY)).toBeDefined();
  });

  it('a prompt that fails for another reason is a coded failure, not a throw', async () => {
    auth.enrollStatus = 'failed';
    expect(await enable(auth)).toEqual({ status: 'failed', reason: 'authenticator' });
    expect(await getFingerprintState()).toEqual({ enabled: false });
  });

  it('cancelling the second prompt (the PRF secret) changes nothing either', async () => {
    await register();
    const key = await extractableKey();
    auth.verifyStatus = 'cancelled';
    expect(await enableFingerprint(key, auth)).toEqual({ status: 'cancelled' });
    expect(await getFingerprintState()).toEqual({ enabled: false });
    expect(await getSessionRecord(STORE_KEY)).toBeDefined();
    lock();
    expect(await restoreSession()).toBe('restored'); // a normal open still works as before
  });
});

describe('PRF level (the fingerprint really protects the key)', () => {
  it('turns on at the PRF level and asks the second prompt with the app salt', async () => {
    expect(await enable(auth)).toEqual({ status: 'ok', level: 'prf' });
    expect(await getFingerprintState()).toEqual({ enabled: true, level: 'prf' });
    expect(auth.enrolls).toBe(1);
    expect(auth.verifies).toEqual(['np/prf/v1']);
  });

  it('removes the plain saved key, so a normal open cannot get in without the fingerprint', async () => {
    await enable(auth);
    expect(await getSessionRecord(STORE_KEY)).toBeUndefined();
    lock();
    expect(await restoreSession()).toBe('none');
    expect(isUnlocked()).toBe(false);
  });

  it('stores the key only wrapped: neither the raw key nor the PRF secret appears in the saved record', async () => {
    await register();
    const key = await extractableKey();
    expect(await enableFingerprint(key, auth)).toEqual({ status: 'ok', level: 'prf' });
    const saved = JSON.stringify(await getSessionRecord(FINGERPRINT));
    expect(saved).not.toContain(await rawKeyText(key));
    expect(saved).not.toContain(toBase64Url(bytes(32, 7)));
  });

  it('the fingerprint opens the same data again after closing the app', async () => {
    await enable(auth);
    const envelope = await encryptJson(getStoreKey(), 'my progress', 'test:1');
    lock(); // simulates closing and reopening the tab
    auth.verifies.length = 0;

    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'ok' });
    expect(isUnlocked()).toBe(true);
    expect(auth.verifies).toEqual(['np/prf/v1']);
    expect(await decryptJson(getStoreKey(), envelope, 'test:1')).toBe('my progress');
    expect(getStoreKey().extractable).toBe(false);
  });

  it('announces "unlocked" once on success and nothing on a failure', async () => {
    await enable(auth);
    lock();
    const unlocked = vi.fn();
    const stop = wire.on('identity:unlocked', unlocked);

    auth.secret = bytes(32, 9);
    await unlockWithFingerprint(auth);
    expect(unlocked).not.toHaveBeenCalled();

    auth.secret = bytes(32, 7);
    await unlockWithFingerprint(auth);
    stop();
    expect(unlocked).toHaveBeenCalledTimes(1);
    expect(unlocked).toHaveBeenCalledWith({});
  });

  it('a wrong PRF secret never gives a key (new phone, reset lock, changed web address)', async () => {
    await enable(auth);
    lock();
    auth.secret = bytes(32, 9);
    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'failed', reason: 'unwrap_failed' });
    expect(isUnlocked()).toBe(false);
  });

  it.each([
    ['no secret at all', null],
    ['a secret of the wrong size', bytes(16, 7)],
    ['an empty secret', bytes(0, 0)],
  ])('%s never gives a key', async (_label, secret) => {
    await enable(auth);
    lock();
    auth.secret = secret;
    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'failed', reason: 'no_prf_output' });
    expect(isUnlocked()).toBe(false);
  });

  it('a damaged wrapped key never gives a key', async () => {
    await enable(auth);
    lock();
    const record = await getSessionRecord<{ wrapped: { ct: string } }>(FINGERPRINT);
    if (!record) throw new Error('the fingerprint record is missing');
    const first = record.wrapped.ct[0] === 'A' ? 'B' : 'A';
    await putSessionRecord(FINGERPRINT, { ...record, wrapped: { ...record.wrapped, ct: first + record.wrapped.ct.slice(1) } });

    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'failed', reason: 'unwrap_failed' });
    expect(isUnlocked()).toBe(false);
  });

  it('a key that does not open the data on this device is never adopted', async () => {
    await enable(auth, WORDS_A);
    const oldLock = await getSessionRecord<Record<string, unknown>>(FINGERPRINT);
    if (!oldLock) throw new Error('the fingerprint record is missing');
    // The data on this device now belongs to another identity (new Register with other words) ...
    await createIdentity(WORDS_B);
    // ... and an old lock record somehow survived (for example a failed clean-up): its key must still never be adopted.
    await putSessionRecord(FINGERPRINT, oldLock);
    lock();

    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'failed', reason: 'wrong_key' });
    expect(isUnlocked()).toBe(false);
  });

  it('a new Register removes an older fingerprint lock, because it belonged to the old key', async () => {
    await enable(auth, WORDS_A);
    await createIdentity(WORDS_B);
    expect(await getFingerprintState()).toEqual({ enabled: false });
    expect(await getSessionRecord(FINGERPRINT)).toBeUndefined();
  });

  it('turning it on again replaces an older lock', async () => {
    auth.prfCapable = false;
    expect(await enable(auth)).toEqual({ status: 'ok', level: 'gate' });
    expect(await getSessionRecord(STORE_KEY)).toBeDefined();

    auth.prfCapable = true;
    expect(await enableFingerprint(await extractableKey(), auth)).toEqual({ status: 'ok', level: 'prf' });
    expect(await getFingerprintState()).toEqual({ enabled: true, level: 'prf' });
    expect(await getSessionRecord(STORE_KEY)).toBeUndefined();
  });
});

describe('gate level (no PRF: the fingerprint only guards opening the app)', () => {
  it('is chosen when the authenticator does not support PRF, and no second prompt is shown', async () => {
    auth.prfCapable = false;
    expect(await enable(auth)).toEqual({ status: 'ok', level: 'gate' });
    expect(await getFingerprintState()).toEqual({ enabled: true, level: 'gate' });
    expect(auth.verifies).toEqual([]);
    expect(await getSessionRecord(STORE_KEY)).toBeDefined(); // the plain saved key stays: this is why the UI must say "protects the app screen"
  });

  it('is chosen, and reported truthfully, when PRF was promised but no secret came', async () => {
    auth.secret = null;
    expect(await enable(auth)).toEqual({ status: 'ok', level: 'gate' });
    expect(await getFingerprintState()).toEqual({ enabled: true, level: 'gate' });
    expect(await getSessionRecord(STORE_KEY)).toBeDefined();
  });

  it('falls back to the gate level when the second prompt fails for another reason', async () => {
    auth.verifyStatus = 'failed';
    expect(await enable(auth)).toEqual({ status: 'ok', level: 'gate' });
  });

  it('opens the app after the fingerprint prompt, without asking for a PRF secret', async () => {
    auth.prfCapable = false;
    await enable(auth);
    const envelope = await encryptJson(getStoreKey(), 'still here', 'test:1');
    lock();

    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'ok' });
    expect(auth.verifies).toEqual([null]);
    expect(await decryptJson(getStoreKey(), envelope, 'test:1')).toBe('still here');
  });

  it('cancelling the prompt does not open the app', async () => {
    auth.prfCapable = false;
    await enable(auth);
    lock();
    auth.verifyStatus = 'cancelled';
    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'cancelled' });
    expect(isUnlocked()).toBe(false);
  });

  it('a missing saved key is a coded failure, and the 12 words still work', async () => {
    auth.prfCapable = false;
    await enable(auth);
    lock();
    await deleteSessionRecord(STORE_KEY);
    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'failed', reason: 'no_saved_key' });
    expect(isUnlocked()).toBe(false);
    expect((await unlock(WORDS_A)).status).toBe('ok');
  });
});

describe('unlockWithFingerprint: other answers', () => {
  it('is "not_enabled" when the lock is off, and shows no prompt', async () => {
    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'failed', reason: 'not_enabled' });
    expect(auth.verifies).toEqual([]);
  });

  it('a damaged credential id counts as "not_enabled"', async () => {
    await putSessionRecord(FINGERPRINT, { v: 1, level: 'gate', credentialId: '***' });
    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'failed', reason: 'not_enabled' });
    expect(auth.verifies).toEqual([]);
  });

  it('is already "ok" when the app is unlocked, without a second prompt', async () => {
    await enable(auth);
    auth.verifies.length = 0;
    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'ok' });
    expect(auth.verifies).toEqual([]);
  });

  it.each([
    ['cancelled', { status: 'cancelled' }],
    ['unsupported', { status: 'unsupported' }],
    ['failed', { status: 'failed', reason: 'authenticator' }],
  ] as const)('a prompt that answers "%s" is passed on and nothing is unlocked', async (status, expected) => {
    await enable(auth);
    lock();
    auth.verifyStatus = status;
    expect(await unlockWithFingerprint(auth)).toEqual(expected);
    expect(isUnlocked()).toBe(false);
  });

  it('a credential the phone no longer knows is a coded failure, not a throw', async () => {
    await enable(auth);
    lock();
    const record = await getSessionRecord<{ credentialId: string }>(FINGERPRINT);
    if (!record) throw new Error('the fingerprint record is missing');
    await putSessionRecord(FINGERPRINT, { ...record, credentialId: toBase64Url(bytes(16, 4)) });
    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'failed', reason: 'authenticator' });
    expect(isUnlocked()).toBe(false);
  });
});

describe('the 12 words always work', () => {
  it('after the fingerprint secret changed', async () => {
    await enable(auth);
    lock();
    auth.secret = bytes(32, 9);
    expect((await unlockWithFingerprint(auth)).status).toBe('failed');
    expect((await unlock(WORDS_A)).status).toBe('ok');
    expect(isUnlocked()).toBe(true);
  });

  it('after the fingerprint was cancelled, unsupported or failed', async () => {
    await enable(auth);
    for (const status of ['cancelled', 'unsupported', 'failed'] as const) {
      lock();
      auth.verifyStatus = status;
      expect((await unlockWithFingerprint(auth)).status).toBe(status);
      expect(isUnlocked()).toBe(false);
      expect((await unlock(WORDS_A)).status).toBe('ok');
    }
  });

  it('after the fingerprint lock was turned off', async () => {
    await enable(auth);
    lock();
    await disableFingerprint();
    expect((await unlock(WORDS_A)).status).toBe('ok');
  });
});

describe('disableFingerprint', () => {
  it('while logged in: removes the record and puts the plain saved key back, so a normal open works again', async () => {
    await enable(auth);
    expect(await getSessionRecord(STORE_KEY)).toBeUndefined();

    expect(await disableFingerprint()).toEqual({ status: 'ok' });
    expect(await getFingerprintState()).toEqual({ enabled: false });
    expect(await getSessionRecord(FINGERPRINT)).toBeUndefined(); // the wrapped key is gone with it
    expect(await getSessionRecord(STORE_KEY)).toBeDefined();
    lock();
    expect(await restoreSession()).toBe('restored');
  });

  it('while logged out at the PRF level: removes the record, the next open asks for the 12 words', async () => {
    await enable(auth);
    lock();
    expect(await disableFingerprint()).toEqual({ status: 'ok' });
    expect(await getFingerprintState()).toEqual({ enabled: false });
    expect(await restoreSession()).toBe('none');
    expect((await unlock(WORDS_A)).status).toBe('ok');
  });

  it('while logged out at the gate level: the app does not become openable without the fingerprint', async () => {
    auth.prfCapable = false;
    await enable(auth);
    lock();
    expect(await disableFingerprint()).toEqual({ status: 'ok' });
    expect(await getSessionRecord(STORE_KEY)).toBeUndefined();
    expect(await restoreSession()).toBe('none');
    expect(isUnlocked()).toBe(false);
  });

  it('is fine when the lock was never on', async () => {
    expect(await disableFingerprint()).toEqual({ status: 'ok' });
    expect(await getFingerprintState()).toEqual({ enabled: false });
  });
});

describe('Log out', () => {
  it('removes the fingerprint record and the wrapped key, and the 12 words log in again', async () => {
    await enable(auth);
    const envelope = await encryptJson(getStoreKey(), 'my progress', 'test:1');

    await logOut();
    expect(await getFingerprintState()).toEqual({ enabled: false });
    expect(await getSessionRecord(FINGERPRINT)).toBeUndefined();
    expect(await unlockWithFingerprint(auth)).toEqual({ status: 'failed', reason: 'not_enabled' });

    expect((await unlock(WORDS_A)).status).toBe('ok');
    expect(await decryptJson(getStoreKey(), envelope, 'test:1')).toBe('my progress');
  });
});

describe('nothing secret leaks', () => {
  it('no result, no saved record and no wire payload contains the 12 words or the key', async () => {
    const heard: unknown[] = [];
    const stops = [wire.on('identity:unlocked', (p) => heard.push(p)), wire.on('identity:locked', (p) => heard.push(p))];

    await register();
    const key = await extractableKey();
    const results: unknown[] = [await enableFingerprint(key, auth)];
    lock();
    auth.secret = bytes(32, 9);
    results.push(await unlockWithFingerprint(auth));
    auth.secret = null;
    results.push(await unlockWithFingerprint(auth));
    auth.secret = bytes(32, 7);
    results.push(await unlockWithFingerprint(auth));
    stops.forEach((stop) => stop());

    const all = JSON.stringify(results) + JSON.stringify(heard) + JSON.stringify(await getSessionRecord(FINGERPRINT));
    for (const text of ['abandon', 'about', await rawKeyText(key), toBase64Url(bytes(32, 7)), toBase64Url(bytes(32, 9))]) {
      expect(all).not.toContain(text);
    }
  });
});

describe('browserPlatformAuth outside a browser', () => {
  it('answers "unsupported" and never throws', async () => {
    expect(await browserPlatformAuth.isAvailable()).toBe(false);
    expect(await browserPlatformAuth.supportsPrf()).toBe(false);
    expect(await browserPlatformAuth.enroll()).toEqual({ status: 'unsupported' });
    expect(await browserPlatformAuth.verify(bytes(16, 1), bytes(9, 1))).toEqual({ status: 'unsupported' });
  });

  it('is what enableFingerprint uses when no PlatformAuth is given', async () => {
    await register();
    expect(await enableFingerprint(await extractableKey())).toEqual({ status: 'unsupported' });
    expect(await getFingerprintState()).toEqual({ enabled: false });
  });
});
