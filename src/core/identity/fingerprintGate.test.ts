// @vitest-environment node
// T12b part 1: the two fixes found while reviewing T12a.
//  (1) App open: with the fingerprint lock on, loadIdentityStatus shows the fingerprint prompt FIRST (gate level too), never opens without it.
//  (2) A 12-word login never brings the plain saved key back under a PRF-level lock; a NEW Register starts clean.
// A FAKE PlatformAuth is used, like in biometric.test.ts: the real WebAuthn prompt is checked in the owner's browser (T13).
import { beforeEach, describe, expect, it } from 'vitest';
import {
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
import { deriveKey } from './kdf';
import { createIdentity, isUnlocked, lock, restoreSession, unlock } from './session';
import { AUTH_ROUTES, decideRoute, loadIdentityStatus, markOnboarded } from './status';
import { deleteSetting } from '../storage/repo';
import { clearSessionRecords } from '../storage/sessionStore';

// Official BIP39 test vectors: valid phrases, different keys.
const WORDS_A = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const WORDS_B = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

function bytes(length: number, fill: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(length).fill(fill);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** A pretend phone (same behaviour as the one in biometric.test.ts). */
class FakeAuth implements PlatformAuth {
  available = true;
  /** What enroll() reports as `prfSupported` (false = the gate level). */
  prfCapable = true;
  secret: Uint8Array<ArrayBuffer> | null = bytes(32, 7);
  verifyStatus: 'ok' | AuthFailureStatus = 'ok';
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
    return Promise.resolve({
      status: 'ok',
      value: { credentialId: Uint8Array.from(this.credentialId), prfSupported: this.prfCapable },
    });
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
  await deleteSetting('identity.onboarded');
});

/** Register + turn the fingerprint lock on (the extractable key is made while the words are in memory, as in the real flow). */
async function registerWithLock(fake: FakeAuth, words = WORDS_A) {
  expect((await createIdentity(words)).status).toBe('ok');
  return enableFingerprint(await deriveKey(words, 'store', { extractable: true }), fake);
}

describe('app open with the fingerprint lock on (loadIdentityStatus)', () => {
  it('PRF level: the prompt is shown and a good fingerprint opens the app', async () => {
    expect(await registerWithLock(auth)).toEqual({ status: 'ok', level: 'prf' });
    lock(); // a new page load
    const before = auth.verifies.length;
    expect(await loadIdentityStatus(auth)).toEqual({ unlocked: true, onboarded: false });
    expect(auth.verifies.length).toBe(before + 1);
    expect(isUnlocked()).toBe(true);
  });

  it('PRF level: a cancelled prompt means locked -> Login, and the 12 words still open', async () => {
    await registerWithLock(auth);
    await markOnboarded();
    lock();
    auth.verifyStatus = 'cancelled';
    const status = await loadIdentityStatus(auth);
    expect(status).toEqual({ unlocked: false, onboarded: true });
    expect(decideRoute(status, '/')).toBe(AUTH_ROUTES.login);
    expect(isUnlocked()).toBe(false);
    expect((await unlock(WORDS_A)).status).toBe('ok');
    expect(isUnlocked()).toBe(true);
  });

  it.each<AuthFailureStatus>(['cancelled', 'unsupported', 'failed'])('PRF level: a %s prompt never opens the app', async (status) => {
    await registerWithLock(auth);
    lock();
    auth.verifyStatus = status;
    expect(await loadIdentityStatus(auth)).toEqual({ unlocked: false, onboarded: false });
    expect(isUnlocked()).toBe(false);
  });

  it('PRF level: a missing PRF secret never opens the app', async () => {
    await registerWithLock(auth);
    lock();
    auth.secret = null;
    expect(await loadIdentityStatus(auth)).toEqual({ unlocked: false, onboarded: false });
    expect(isUnlocked()).toBe(false);
  });

  it('gate level: the app no longer opens WITHOUT the prompt (this was the bug)', async () => {
    auth.prfCapable = false;
    expect(await registerWithLock(auth)).toEqual({ status: 'ok', level: 'gate' });
    lock();
    auth.verifyStatus = 'cancelled';
    const before = auth.verifies.length;
    expect(await loadIdentityStatus(auth)).toEqual({ unlocked: false, onboarded: false });
    expect(auth.verifies.length).toBe(before + 1);
    expect(isUnlocked()).toBe(false);

    auth.verifyStatus = 'ok';
    expect(await loadIdentityStatus(auth)).toEqual({ unlocked: true, onboarded: false });
    expect(isUnlocked()).toBe(true);
  });

  it('no fingerprint lock: no prompt, the saved login comes back as before', async () => {
    await createIdentity(WORDS_A);
    lock();
    expect(await loadIdentityStatus(auth)).toEqual({ unlocked: true, onboarded: false });
    expect(auth.verifies).toHaveLength(0);
  });

  it('two readers at the same time share ONE prompt', async () => {
    await registerWithLock(auth);
    lock();
    const before = auth.verifies.length;
    const [first, second] = await Promise.all([loadIdentityStatus(auth), loadIdentityStatus(auth)]);
    expect(first).toEqual({ unlocked: true, onboarded: false });
    expect(second).toEqual(first);
    expect(auth.verifies.length).toBe(before + 1);
  });
});

describe('12-word login under a fingerprint lock (session persistence rule)', () => {
  it('PRF level: the login works but the plain key does NOT come back, the fingerprint still opens', async () => {
    await registerWithLock(auth);
    lock();
    expect(await unlock(WORDS_A)).toEqual({ status: 'ok', persisted: true });
    expect(isUnlocked()).toBe(true);

    lock(); // a new page load without the fingerprint
    expect(await restoreSession()).toBe('none');
    expect(await getFingerprintState()).toEqual({ enabled: true, level: 'prf' });
    expect((await unlockWithFingerprint(auth)).status).toBe('ok');
    expect(isUnlocked()).toBe(true);
  });

  it('gate level: the plain key is kept, as the gate level needs it', async () => {
    auth.prfCapable = false;
    await registerWithLock(auth);
    lock();
    expect(await unlock(WORDS_A)).toEqual({ status: 'ok', persisted: true });
    lock();
    expect(await restoreSession()).toBe('restored');
    expect(await getFingerprintState()).toEqual({ enabled: true, level: 'gate' });
  });

  it('a NEW Register starts clean: the old fingerprint lock is gone and the new key is saved normally', async () => {
    await registerWithLock(auth, WORDS_A);
    lock();
    expect((await createIdentity(WORDS_B)).status).toBe('ok');
    expect(await getFingerprintState()).toEqual({ enabled: false });
    lock();
    expect(await restoreSession()).toBe('restored');
  });

  it('after the lock is turned off, a 12-word login saves the plain key again', async () => {
    await registerWithLock(auth);
    expect((await disableFingerprint()).status).toBe('ok');
    lock();
    expect((await unlock(WORDS_A)).status).toBe('ok');
    lock();
    expect(await restoreSession()).toBe('restored');
  });
});
