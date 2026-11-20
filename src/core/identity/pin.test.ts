// @vitest-environment node
// PIN lock tests on an in-memory IndexedDB (fake-indexeddb, loaded in src/test-setup.ts). Small PBKDF2 round counts keep them fast;
// the app itself always uses PIN_ITERATIONS. The wrapped store key is checked through the real key check, like the fingerprint unlock.
import { beforeEach, describe, expect, it } from 'vitest';
import { checkPin, disablePin, enablePin, getPinState, MAX_PIN_TRIES, unlockWithPin } from './pin';
import { clearEnrolKey, createIdentity, isUnlocked, lock, logOut, PIN_RECORD, STORE_KEY_RECORD, unlock } from './session';
import { getSessionRecord, putSessionRecord } from '../storage/sessionStore';

const WORDS_A = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PIN = '135790';
const FAST = { iterations: 1000 };

beforeEach(async () => {
  await logOut();
  clearEnrolKey();
  await createIdentity(WORDS_A); // sets the key check and the in-memory enrolment key
});

describe('checkPin', () => {
  it('accepts exactly 6 digits that are not an obvious pattern', () => {
    expect(checkPin(PIN)).toEqual({ ok: true });
    expect(checkPin('123457')).toEqual({ ok: true });
  });

  it('rejects the wrong length and non-digits', () => {
    expect(checkPin('')).toEqual({ ok: false, reason: 'wrong_length' });
    expect(checkPin('12345')).toEqual({ ok: false, reason: 'wrong_length' });
    expect(checkPin('1234567')).toEqual({ ok: false, reason: 'wrong_length' });
    expect(checkPin('12a456')).toEqual({ ok: false, reason: 'not_digits' });
    expect(checkPin('12 456')).toEqual({ ok: false, reason: 'not_digits' });
  });

  it('rejects obvious patterns', () => {
    for (const easy of ['000000', '111111', '123456', '654321', '234567']) {
      expect(checkPin(easy)).toEqual({ ok: false, reason: 'too_easy' });
    }
  });
});

describe('enablePin', () => {
  it('turns the lock on, removes the plain saved key and forgets the enrolment key', async () => {
    await putSessionRecord(STORE_KEY_RECORD, 'plain-key-stand-in');
    expect(await enablePin(PIN, FAST)).toEqual({ status: 'ok' });
    expect(await getPinState()).toEqual({ enabled: true, triesLeft: MAX_PIN_TRIES });
    expect(await getSessionRecord(STORE_KEY_RECORD)).toBeFalsy();
    // the enrolment key is gone, so a second call has nothing to wrap
    expect(await enablePin('246802', FAST)).toEqual({ status: 'needs_words' });
  });

  it('never saves the PIN itself', async () => {
    await enablePin(PIN, FAST);
    expect(JSON.stringify(await getSessionRecord(PIN_RECORD))).not.toContain(PIN);
  });

  it('refuses a bad PIN without changing anything', async () => {
    expect(await enablePin('111111', FAST)).toEqual({ status: 'invalid_pin', problem: 'too_easy' });
    expect(await enablePin('12345', FAST)).toEqual({ status: 'invalid_pin', problem: 'wrong_length' });
    expect((await getPinState()).enabled).toBe(false);
  });

  it('needs the 12 words typed in this page session', async () => {
    clearEnrolKey();
    expect(await enablePin(PIN, FAST)).toEqual({ status: 'needs_words' });
    expect((await getPinState()).enabled).toBe(false);
  });
});

describe('unlockWithPin', () => {
  beforeEach(async () => {
    await enablePin(PIN, FAST);
    lock();
  });

  it('opens the app with the right PIN', async () => {
    expect(isUnlocked()).toBe(false);
    expect(await unlockWithPin(PIN)).toEqual({ status: 'ok' });
    expect(isUnlocked()).toBe(true);
  });

  it('a wrong PIN never unlocks and counts down the tries', async () => {
    expect(await unlockWithPin('246802')).toEqual({ status: 'wrong_pin', triesLeft: MAX_PIN_TRIES - 1 });
    expect(await unlockWithPin('246803')).toEqual({ status: 'wrong_pin', triesLeft: MAX_PIN_TRIES - 2 });
    expect(isUnlocked()).toBe(false);
    expect(await getPinState()).toEqual({ enabled: true, triesLeft: MAX_PIN_TRIES - 2 });
  });

  it('a right PIN resets the wrong-try counter', async () => {
    await unlockWithPin('246802');
    await unlockWithPin('246803');
    expect(await unlockWithPin(PIN)).toEqual({ status: 'ok' });
    expect((await getPinState()).triesLeft).toBe(MAX_PIN_TRIES);
  });

  it('the last wrong PIN removes the lock; the 12 words still work', async () => {
    for (let n = 1; n < MAX_PIN_TRIES; n += 1) await unlockWithPin('246802');
    expect(await unlockWithPin('246802')).toEqual({ status: 'too_many_tries' });
    expect((await getPinState()).enabled).toBe(false);
    expect(await unlockWithPin(PIN)).toEqual({ status: 'no_pin' });
    expect((await unlock(WORDS_A)).status).toBe('ok');
    expect(isUnlocked()).toBe(true);
  });

  it('a PIN that is not 6 digits costs no try', async () => {
    expect(await unlockWithPin('123')).toEqual({ status: 'invalid_pin', problem: 'wrong_length' });
    expect(await unlockWithPin('12ab56')).toEqual({ status: 'invalid_pin', problem: 'not_digits' });
    expect((await getPinState()).triesLeft).toBe(MAX_PIN_TRIES);
  });
});

describe('PIN lock and the 12 words', () => {
  it('a 12-word login keeps the PIN lock and does not bring the plain key back', async () => {
    await enablePin(PIN, FAST);
    lock();
    expect((await unlock(WORDS_A)).status).toBe('ok');
    expect((await getPinState()).enabled).toBe(true);
    expect(await getSessionRecord(STORE_KEY_RECORD)).toBeFalsy();
  });

  it('Log out removes the PIN lock', async () => {
    await enablePin(PIN, FAST);
    await logOut();
    expect((await getPinState()).enabled).toBe(false);
    expect(isUnlocked()).toBe(false);
  });
});

describe('disablePin', () => {
  it('needs the unlocked app', async () => {
    await enablePin(PIN, FAST);
    lock();
    expect(await disablePin()).toEqual({ status: 'locked' });
    expect((await getPinState()).enabled).toBe(true);
  });

  it('turns the lock off while unlocked', async () => {
    await enablePin(PIN, FAST);
    lock();
    await unlockWithPin(PIN);
    const result = await disablePin();
    expect(result.status).toBe('ok');
    expect((await getPinState()).enabled).toBe(false);
  });
});

describe('damaged records', () => {
  it('a record that is not shaped like a PIN lock counts as no lock and never throws', async () => {
    await putSessionRecord(PIN_RECORD, { garbage: true });
    expect(await getPinState()).toEqual({ enabled: false, triesLeft: MAX_PIN_TRIES });
    expect(await unlockWithPin(PIN)).toEqual({ status: 'no_pin' });
  });
});
