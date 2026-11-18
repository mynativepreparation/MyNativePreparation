// @vitest-environment node
// Repository tests on an in-memory IndexedDB (fake-indexeddb, loaded in src/test-setup.ts).
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  addAttempt,
  getProfile,
  getReadBlocks,
  getSetting,
  listAttempts,
  markBlockRead,
  saveProfile,
  setSetting,
} from './repo';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('profile', () => {
  it('is undefined before anything is saved', async () => {
    expect(await getProfile()).toBeUndefined();
  });

  it('round-trips name, email and phone', async () => {
    await saveProfile({ name: 'Asha', email: 'asha@example.com', phone: '9000000000' });
    expect(await getProfile()).toEqual({ name: 'Asha', email: 'asha@example.com', phone: '9000000000' });
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
    await markBlockRead('crs-aaaa0001', 'blk-bbbb0001', 5000);
    expect(await getReadBlocks('crs-aaaa0001')).toEqual(['blk-bbbb0001']);
    expect(await db.readProgress.get(['crs-aaaa0001', 'blk-bbbb0001'])).toEqual({
      courseId: 'crs-aaaa0001',
      blockId: 'blk-bbbb0001',
      readAt: 5000,
    });
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
});
