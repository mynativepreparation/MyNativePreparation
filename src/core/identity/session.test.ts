// @vitest-environment node
// Session tests on an in-memory IndexedDB (fake-indexeddb, loaded in src/test-setup.ts).
// Tests outside src/core/storage may not import db.ts, so they reset state only through the repository and sessionStore.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptJson, encryptJson } from './cipher';
import { deriveKey } from './kdf';
import {
  createIdentity,
  getStoreKey,
  isUnlocked,
  LockedError,
  lock,
  logOut,
  restoreSession,
  unlock,
} from './session';
import { deleteSetting, getSetting, setSetting } from '../storage/repo';
import {
  clearSessionRecords,
  deleteSessionRecord,
  getSessionRecord,
  putSessionRecord,
} from '../storage/sessionStore';
import { wire } from '../wire/wire';

// Official BIP39 test vectors (all-zero and all-0x7f entropy): valid phrases, different keys.
const WORDS_A = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const WORDS_B = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

// SPIKE (T4): does a non-extractable CryptoKey survive a round trip through IndexedDB in this test environment?
// The answer decides whether the "persisted key" tests below run or are shown as skipped (then T13, the browser check, covers them).
let keySurvivesStorage = false;

beforeAll(async () => {
  try {
    const key = await deriveKey(WORDS_A, 'store');
    await putSessionRecord('spike', key);
    const back = await getSessionRecord<CryptoKey>('spike');
    await deleteSessionRecord('spike');
    if (back) {
      const envelope = await encryptJson(back, { ok: 1 }, 'spike');
      keySurvivesStorage = JSON.stringify(await decryptJson(key, envelope, 'spike')) === '{"ok":1}';
    }
  } catch {
    keySurvivesStorage = false;
  }
});

beforeEach(async () => {
  lock();
  await clearSessionRecords();
  await deleteSetting('identity.check');
});

async function create(words: string): Promise<void> {
  const result = await createIdentity(words);
  expect(result.status).toBe('ok');
}

describe('starting state', () => {
  it('is locked and getStoreKey throws LockedError', () => {
    expect(isUnlocked()).toBe(false);
    expect(() => getStoreKey()).toThrow(LockedError);
  });

  it('LockedError has a fixed message', () => {
    expect(new LockedError().message).toBe('The app is locked: log in first');
    expect(new LockedError().name).toBe('LockedError');
  });
});

describe('createIdentity (Register)', () => {
  it('unlocks with a usable, non-extractable AES-GCM key', async () => {
    await create(WORDS_A);
    expect(isUnlocked()).toBe(true);
    const key = getStoreKey();
    expect(key.algorithm.name).toBe('AES-GCM');
    expect(key.extractable).toBe(false);
    const envelope = await encryptJson(key, { hello: 'ગુજરાતી' }, 'test:1');
    expect(await decryptJson(key, envelope, 'test:1')).toEqual({ hello: 'ગુજરાતી' });
  });

  it('saves an encrypted key check that shows no readable text', async () => {
    await create(WORDS_A);
    const saved = await getSetting('identity.check');
    expect(saved).toBeDefined();
    const text = JSON.stringify(saved);
    expect(text).not.toContain('np-key-check');
    expect(text).not.toContain('abandon');
  });

  it('accepts messy input (capitals, line breaks, extra spaces)', async () => {
    const result = await createIdentity(`  ${WORDS_A.toUpperCase().replace(/ /g, '  \n')}  `);
    expect(result.status).toBe('ok');
  });

  it.each([
    ['11 words', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon', 'wrong_count'],
    ['an unknown word', WORDS_A.replace('about', 'zzzzzz'), 'unknown_word'],
    ['a bad checksum', WORDS_A.replace('about', 'abandon'), 'bad_checksum'],
    ['nothing', '', 'wrong_count'],
  ])('rejects %s, stays locked and saves nothing', async (_label, words, problem) => {
    const result = await createIdentity(words);
    expect(result).toMatchObject({ status: 'invalid_words', problem });
    expect(isUnlocked()).toBe(false);
    expect(await getSetting('identity.check')).toBeUndefined();
  });

  it('never throws for garbage input', async () => {
    for (const garbage of [undefined, null, 42, {}, [], '\u0000\u0000']) {
      const result = await createIdentity(garbage as unknown as string);
      expect(result.status).toBe('invalid_words');
    }
  });
});

describe('unlock (Login)', () => {
  it('same words open the same data again after lock()', async () => {
    await create(WORDS_A);
    const envelope = await encryptJson(getStoreKey(), 'secret note', 'test:1');
    lock();
    expect(isUnlocked()).toBe(false);

    const result = await unlock(WORDS_A);
    expect(result.status).toBe('ok');
    expect(await decryptJson(getStoreKey(), envelope, 'test:1')).toBe('secret note');
  });

  it('a different valid phrase gives wrong_key, stays locked and keeps the saved check', async () => {
    await create(WORDS_A);
    const checkBefore = JSON.stringify(await getSetting('identity.check'));
    lock();

    expect(await unlock(WORDS_B)).toEqual({ status: 'wrong_key' });
    expect(isUnlocked()).toBe(false);
    expect(JSON.stringify(await getSetting('identity.check'))).toBe(checkBefore);
  });

  it('a fresh device (no key check) accepts any valid words and creates the check', async () => {
    expect(await getSetting('identity.check')).toBeUndefined();
    expect((await unlock(WORDS_B)).status).toBe('ok');
    expect(isUnlocked()).toBe(true);
    expect(await getSetting('identity.check')).toBeDefined();

    lock();
    expect(await unlock(WORDS_A)).toEqual({ status: 'wrong_key' });
    expect((await unlock(WORDS_B)).status).toBe('ok');
  });

  it('a damaged key check is treated as wrong_key, not as a crash', async () => {
    await create(WORDS_A);
    lock();
    await deleteSetting('identity.check');
    await setSetting('identity.check', { v: 1, iv: 'AAAA', ct: 'BBBB' });
    expect(await unlock(WORDS_A)).toEqual({ status: 'wrong_key' });
  });

  it.each([
    ['11 words', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon', 'wrong_count'],
    ['13 words', `${WORDS_A} abandon`, 'wrong_count'],
    ['an unknown word', WORDS_A.replace('about', 'zzzzzz'), 'unknown_word'],
    ['a bad checksum', WORDS_A.replace('about', 'abandon'), 'bad_checksum'],
  ])('reports %s with a reason code', async (_label, words, problem) => {
    const result = await unlock(words);
    expect(result).toMatchObject({ status: 'invalid_words', problem });
  });

  it('reports the number of words and the position of an unknown word, never the word', async () => {
    const count = await unlock('abandon abandon abandon');
    expect(count).toMatchObject({ problem: 'wrong_count', count: 3 });
    const unknown = await unlock(WORDS_A.replace('about', 'zzzzzz'));
    expect(unknown).toMatchObject({ problem: 'unknown_word', wordNumber: 12 });
    expect(JSON.stringify(unknown)).not.toContain('zzzzzz');
  });
});

describe('the 12 words never leak', () => {
  it('are in no result, no saved check and no error text', async () => {
    const results = [
      await createIdentity(WORDS_A),
      await unlock(WORDS_B),
      await unlock(WORDS_A.replace('about', 'zzzzzz')),
      await unlock(WORDS_A.replace('about', 'abandon')),
    ];
    lock();
    const all = JSON.stringify(results) + JSON.stringify(await getSetting('identity.check')) + new LockedError().message;
    for (const word of ['abandon', 'legal', 'winner', 'sausage', 'zzzzzz']) {
      expect(all).not.toContain(word);
    }
  });
});

describe('wire events', () => {
  function listen() {
    const unlocked = vi.fn();
    const locked = vi.fn();
    const stops = [wire.on('identity:unlocked', unlocked), wire.on('identity:locked', locked)];
    return { unlocked, locked, stop: () => stops.forEach((s) => s()) };
  }

  it('createIdentity and unlock announce "unlocked" with an empty payload', async () => {
    const ear = listen();
    await create(WORDS_A);
    lock();
    await unlock(WORDS_A);
    ear.stop();
    expect(ear.unlocked).toHaveBeenCalledTimes(2);
    expect(ear.unlocked).toHaveBeenCalledWith({});
  });

  it('a wrong key or invalid words announce nothing', async () => {
    await create(WORDS_A);
    lock();
    const ear = listen();
    await unlock(WORDS_B);
    await unlock('not a key');
    ear.stop();
    expect(ear.unlocked).not.toHaveBeenCalled();
    expect(ear.locked).not.toHaveBeenCalled();
  });

  it('lock and logOut announce "locked" once, and only when something was unlocked', async () => {
    await create(WORDS_A);
    const ear = listen();
    lock();
    lock(); // already locked: no second event
    await unlock(WORDS_A);
    await logOut();
    ear.stop();
    expect(ear.locked).toHaveBeenCalledTimes(2);
    expect(ear.locked).toHaveBeenCalledWith({});
  });

  it('restoreSession announces "unlocked" only when it really restored a key', async () => {
    await create(WORDS_A);
    lock();
    await clearSessionRecords();
    const ear = listen();
    expect(await restoreSession()).toBe('none');
    ear.stop();
    expect(ear.unlocked).not.toHaveBeenCalled();
  });
});

describe('logOut', () => {
  it('locks, removes the saved key, but keeps the key check and the ability to log in again', async () => {
    await create(WORDS_A);
    const envelope = await encryptJson(getStoreKey(), 'my progress', 'test:1');

    await logOut();
    expect(isUnlocked()).toBe(false);
    expect(() => getStoreKey()).toThrow(LockedError);
    expect(await getSessionRecord('store-key')).toBeUndefined();
    expect(await restoreSession()).toBe('none');
    expect(await getSetting('identity.check')).toBeDefined();

    expect((await unlock(WORDS_A)).status).toBe('ok');
    expect(await decryptJson(getStoreKey(), envelope, 'test:1')).toBe('my progress');
  });

  it('is fine when nobody is logged in', async () => {
    await expect(logOut()).resolves.toBeUndefined();
    expect(isUnlocked()).toBe(false);
  });
});

describe('restoreSession (normal app open, Q16)', () => {
  it('is "none" on a device that never logged in', async () => {
    expect(await restoreSession()).toBe('none');
    expect(isUnlocked()).toBe(false);
  });

  it('is "restored" when already unlocked in this page', async () => {
    await create(WORDS_A);
    expect(await restoreSession()).toBe('restored');
  });

  it('brings back the saved key WITHOUT the 12 words and it opens the same data', async ({ skip }) => {
    if (!keySurvivesStorage) skip(); // this test environment cannot store a CryptoKey: covered by the owner browser check (T13)
    await create(WORDS_A);
    const envelope = await encryptJson(getStoreKey(), 'still here', 'test:1');

    lock(); // simulates closing and reopening the tab
    expect(isUnlocked()).toBe(false);

    expect(await restoreSession()).toBe('restored');
    expect(await decryptJson(getStoreKey(), envelope, 'test:1')).toBe('still here');
  });

  it('after Log out the saved key is gone and a normal open does not log in', async ({ skip }) => {
    if (!keySurvivesStorage) skip();
    await create(WORDS_A);
    await logOut();
    expect(await restoreSession()).toBe('none');
    expect(isUnlocked()).toBe(false);
  });

  it('throws away a saved key that does not match the key check', async ({ skip }) => {
    if (!keySurvivesStorage) skip();
    await create(WORDS_A);
    lock();
    await putSessionRecord('store-key', await deriveKey(WORDS_B, 'store'));

    expect(await restoreSession()).toBe('none');
    expect(isUnlocked()).toBe(false);
    expect(await getSessionRecord('store-key')).toBeUndefined();
  });

  it('ignores a saved value that is not a safe store key', async () => {
    await create(WORDS_A);
    lock();
    for (const junk of ['text', 42, { type: 'secret' }, null]) {
      await putSessionRecord('store-key', junk);
      expect(await restoreSession()).toBe('none');
      expect(isUnlocked()).toBe(false);
    }
  });

  it('ignores a saved key that is extractable (never trusted)', async ({ skip }) => {
    if (!keySurvivesStorage) skip();
    await create(WORDS_A);
    lock();
    await putSessionRecord('store-key', await deriveKey(WORDS_A, 'store', { extractable: true }));
    expect(await restoreSession()).toBe('none');
    expect(isUnlocked()).toBe(false);
  });
});
