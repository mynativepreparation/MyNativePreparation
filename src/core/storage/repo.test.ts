// @vitest-environment node
// Repository tests on an in-memory IndexedDB (fake-indexeddb, loaded in src/test-setup.ts).
// P04: personal data is encrypted, so every test starts with a store key set (as after Login).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DecryptError } from '../identity/cipher';
import { deriveKey } from '../identity/kdf';
import { clearStoreKey, LockedError, setStoreKey } from '../identity/keyring';
import { db } from './db';
import {
  addAttempt,
  deleteSetting,
  getProfile,
  getReadBlocks,
  getSetting,
  listAttempts,
  markBlockRead,
  saveProfile,
  setSetting,
} from './repo';

// Official BIP39 test vectors: two valid phrases that make two different keys.
const WORDS_A = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const WORDS_B = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  setStoreKey(await deriveKey(WORDS_A, 'store'));
});

afterAll(() => {
  clearStoreKey();
});

describe('profile', () => {
  it('is undefined before anything is saved', async () => {
    expect(await getProfile()).toBeUndefined();
  });

  it('round-trips name, email and phone', async () => {
    await saveProfile({ name: 'Asha', email: 'asha@example.com', phone: '9000000000' });
    expect(await getProfile()).toEqual({ name: 'Asha', email: 'asha@example.com', phone: '9000000000' });
  });

  it('round-trips Gujarati text', async () => {
    await saveProfile({ name: 'આશા પટેલ' });
    expect(await getProfile()).toEqual({ name: 'આશા પટેલ' });
  });

  it('saving again replaces the whole profile (upsert) and keeps a single row', async () => {
    await saveProfile({ name: 'Asha', email: 'asha@example.com' });
    await saveProfile({ name: 'Bhavin' });
    expect(await getProfile()).toEqual({ name: 'Bhavin' });
    expect(await db.profile.count()).toBe(1);
  });

  it('accepts an empty profile', async () => {
    await saveProfile({});
    expect(await getProfile()).toEqual({});
  });
});

describe('read progress', () => {
  it('is an empty array when nothing was read', async () => {
    expect(await getReadBlocks('crs-aaaa0001')).toEqual([]);
  });

  it('returns the read blocks of a course, oldest first', async () => {
    await markBlockRead('crs-aaaa0001', 'blk-bbbb0002', 2000);
    await markBlockRead('crs-aaaa0001', 'blk-bbbb0001', 1000);
    expect(await getReadBlocks('crs-aaaa0001')).toEqual(['blk-bbbb0001', 'blk-bbbb0002']);
  });

  it('marking the same block again keeps one entry and updates readAt', async () => {
    await markBlockRead('crs-aaaa0001', 'blk-bbbb0001', 1000);
    await markBlockRead('crs-aaaa0001', 'blk-bbbb0002', 3000);
    await markBlockRead('crs-aaaa0001', 'blk-bbbb0001', 5000); // now the newest
    expect(await db.readProgress.count()).toBe(2);
    expect(await getReadBlocks('crs-aaaa0001')).toEqual(['blk-bbbb0002', 'blk-bbbb0001']);
  });

  it('keeps courses separate', async () => {
    await markBlockRead('crs-aaaa0001', 'blk-bbbb0001');
    await markBlockRead('crs-aaaa0002', 'blk-bbbb0009');
    expect(await getReadBlocks('crs-aaaa0001')).toEqual(['blk-bbbb0001']);
    expect(await getReadBlocks('crs-aaaa0002')).toEqual(['blk-bbbb0009']);
  });
});

describe('attempts', () => {
  const base = { courseId: 'crs-aaaa0001', testId: 'tst-cccc0001' };

  it('is an empty array when there are none', async () => {
    expect(await listAttempts('crs-aaaa0001')).toEqual([]);
  });

  it('saves an attempt with percent and stars computed from the rules', async () => {
    const saved = await addAttempt({ ...base, asked: 5, correct: 4, at: 1000 });
    expect(saved).toEqual({ ...base, id: expect.any(Number), asked: 5, correct: 4, percent: 80, stars: 4, at: 1000 });
    expect(await listAttempts('crs-aaaa0001')).toEqual([saved]);
  });

  it('computes the star boundaries through the repository', async () => {
    expect((await addAttempt({ ...base, asked: 10, correct: 9 })).stars).toBe(5);
    expect((await addAttempt({ ...base, asked: 10, correct: 4 })).stars).toBe(2);
    expect((await addAttempt({ ...base, asked: 10, correct: 0 })).stars).toBe(1);
  });

  it('lists newest first and only for the asked course', async () => {
    const first = await addAttempt({ ...base, asked: 5, correct: 1, at: 1000 });
    const second = await addAttempt({ ...base, asked: 5, correct: 5, at: 3000 });
    await addAttempt({ courseId: 'crs-aaaa0002', testId: 'tst-cccc0002', asked: 5, correct: 3, at: 2000 });
    expect((await listAttempts('crs-aaaa0001')).map((a) => a.id)).toEqual([second.id, first.id]);
    expect(await listAttempts('crs-aaaa0002')).toHaveLength(1);
  });

  it('gives every attempt its own id', async () => {
    const a = await addAttempt({ ...base, asked: 5, correct: 1 });
    const b = await addAttempt({ ...base, asked: 5, correct: 1 });
    expect(a.id).not.toBe(b.id);
  });

  it.each([
    ['asked is 0', { asked: 0, correct: 0 }],
    ['asked is not a whole number', { asked: 2.5, correct: 1 }],
    ['correct is more than asked', { asked: 5, correct: 6 }],
    ['correct is negative', { asked: 5, correct: -1 }],
    ['correct is not a whole number', { asked: 5, correct: 1.5 }],
    ['asked is NaN', { asked: Number.NaN, correct: 0 }],
  ])('rejects impossible numbers (%s) and saves nothing', async (_label, numbers) => {
    await expect(addAttempt({ ...base, ...numbers })).rejects.toBeInstanceOf(RangeError);
    expect(await db.attempts.count()).toBe(0);
  });
});

describe('settings', () => {
  it('is undefined for an unknown key', async () => {
    expect(await getSetting('np.language')).toBeUndefined();
  });

  it('round-trips strings, numbers, booleans (including false) and objects', async () => {
    await setSetting('s', 'gu');
    await setSetting('n', 3);
    await setSetting('b', false);
    await setSetting('o', { sound: true, volume: [1, 2] });
    expect(await getSetting<string>('s')).toBe('gu');
    expect(await getSetting<number>('n')).toBe(3);
    expect(await getSetting<boolean>('b')).toBe(false);
    expect(await getSetting('o')).toEqual({ sound: true, volume: [1, 2] });
  });

  it('saving the same key again replaces the value and leaves other keys alone', async () => {
    await setSetting('a', 1);
    await setSetting('b', 2);
    await setSetting('a', 10);
    expect(await getSetting('a')).toBe(10);
    expect(await getSetting('b')).toBe(2);
    expect(await db.kv.count()).toBe(2);
  });

  it('deleteSetting removes only that key and is fine for a missing key', async () => {
    await setSetting('a', 1);
    await setSetting('b', 2);
    await deleteSetting('a');
    await deleteSetting('never-saved');
    expect(await getSetting('a')).toBeUndefined();
    expect(await getSetting('b')).toBe(2);
  });

  it('works while locked and stays plain (non-personal settings only)', async () => {
    clearStoreKey();
    await setSetting('np.theme', 'dark');
    expect(await getSetting('np.theme')).toBe('dark');
    expect((await db.kv.get('np.theme'))?.value).toBe('dark');
  });
});

describe('locked', () => {
  beforeEach(() => {
    clearStoreKey();
  });

  it('every personal-data function rejects with LockedError', async () => {
    await expect(getProfile()).rejects.toBeInstanceOf(LockedError);
    await expect(saveProfile({ name: 'x' })).rejects.toBeInstanceOf(LockedError);
    await expect(markBlockRead('crs-aaaa0001', 'blk-bbbb0001')).rejects.toBeInstanceOf(LockedError);
    await expect(getReadBlocks('crs-aaaa0001')).rejects.toBeInstanceOf(LockedError);
    await expect(addAttempt({ courseId: 'c', testId: 't', asked: 1, correct: 1 })).rejects.toBeInstanceOf(LockedError);
    await expect(listAttempts('c')).rejects.toBeInstanceOf(LockedError);
  });

  it('a rejected write saves nothing', async () => {
    await expect(saveProfile({ name: 'x' })).rejects.toBeInstanceOf(LockedError);
    await expect(addAttempt({ courseId: 'c', testId: 't', asked: 1, correct: 1 })).rejects.toBeInstanceOf(LockedError);
    expect(await db.profile.count()).toBe(0);
    expect(await db.attempts.count()).toBe(0);
  });
});

describe('encryption at rest', () => {
  const secret = { name: 'Zarathustra Quillfeather', email: 'zq@example.test', phone: '9123456789' };

  it('raw rows hold no plaintext name, email, phone, score or percent', async () => {
    await saveProfile(secret);
    await markBlockRead('crs-aaaa0001', 'blk-bbbb0001', 1234567890123);
    await addAttempt({ courseId: 'crs-aaaa0001', testId: 'tst-cccc0001', asked: 8, correct: 7, at: 5000 });

    const raw = JSON.stringify([
      await db.profile.toArray(),
      await db.readProgress.toArray(),
      await db.attempts.toArray(),
    ]);
    for (const text of [secret.name, 'Zarathustra', secret.email, secret.phone, '1234567890123']) {
      expect(raw).not.toContain(text);
    }
    for (const field of ['name', 'email', 'phone', 'readAt', 'asked', 'correct', 'percent', 'stars']) {
      expect(raw).not.toContain(`"${field}"`);
    }
  });

  it('the same profile saved twice gives different ciphertext (new IV every time)', async () => {
    await saveProfile(secret);
    const first = JSON.stringify(await db.profile.toArray());
    await saveProfile(secret);
    expect(JSON.stringify(await db.profile.toArray())).not.toBe(first);
  });

  it('a different key cannot read the data (DecryptError)', async () => {
    await saveProfile(secret);
    await markBlockRead('crs-aaaa0001', 'blk-bbbb0001');
    await addAttempt({ courseId: 'crs-aaaa0001', testId: 'tst-cccc0001', asked: 2, correct: 1 });

    setStoreKey(await deriveKey(WORDS_B, 'store'));
    await expect(getProfile()).rejects.toBeInstanceOf(DecryptError);
    await expect(getReadBlocks('crs-aaaa0001')).rejects.toBeInstanceOf(DecryptError);
    await expect(listAttempts('crs-aaaa0001')).rejects.toBeInstanceOf(DecryptError);
  });

  it('a tampered row is "unreadable" (DecryptError), never a crash or wrong data', async () => {
    await saveProfile(secret);
    const row = await db.profile.get('me');
    if (!row) throw new Error('profile row missing');
    const flipped = (row.blob.ct[0] === 'A' ? 'B' : 'A') + row.blob.ct.slice(1);
    await db.profile.put({ id: 'me', blob: { ...row.blob, ct: flipped } });

    await expect(getProfile()).rejects.toBeInstanceOf(DecryptError);
  });

  it('a ciphertext moved to another row cannot be read (AAD)', async () => {
    const a = await addAttempt({ courseId: 'crs-aaaa0001', testId: 'tst-cccc0001', asked: 5, correct: 5, at: 1000 });
    const b = await addAttempt({ courseId: 'crs-aaaa0001', testId: 'tst-cccc0001', asked: 5, correct: 0, at: 2000 });
    const rowA = await db.attempts.get(a.id);
    if (!rowA?.blob) throw new Error('attempt row missing');
    await db.attempts.update(b.id, { blob: rowA.blob });

    await expect(listAttempts('crs-aaaa0001')).rejects.toBeInstanceOf(DecryptError);
  });

  it('a half-saved attempt row (no data yet) is skipped, not an error', async () => {
    await db.attempts.add({ courseId: 'crs-aaaa0001', testId: 'tst-cccc0001', at: 1, blob: null });
    const saved = await addAttempt({ courseId: 'crs-aaaa0001', testId: 'tst-cccc0001', asked: 2, correct: 2, at: 2 });
    expect(await listAttempts('crs-aaaa0001')).toEqual([saved]);
  });
});
