// @vitest-environment node
// P08 T4: the "course opened" record in the repository (fake-indexeddb is loaded in src/test-setup.ts).
// Kept in its own file so repo.test.ts stays small. Every test starts with a store key set (as after Login).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deriveKey } from '../identity/kdf';
import { clearStoreKey, LockedError, setStoreKey } from '../identity/keyring';
import { db } from './db';
import { getOpenedCourseIds, getReadBlocks, markBlockRead, markCourseOpened, OPENED_MARK } from './repo';

// Official BIP39 test vector (same as repo.test.ts).
const WORDS_A = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  setStoreKey(await deriveKey(WORDS_A, 'store'));
});

afterAll(() => {
  clearStoreKey();
});

describe('opened courses', () => {
  it('the mark can never be a real block id', () => {
    expect(OPENED_MARK).not.toMatch(/^blk-[a-z0-9]{8}$/);
  });

  it('is empty before any course was opened', async () => {
    expect(await getOpenedCourseIds()).toEqual([]);
  });

  it('lists a course once, also when it was opened again', async () => {
    await markCourseOpened('crs-aaaaaaaa', 1000);
    await markCourseOpened('crs-aaaaaaaa', 2000);
    expect(await getOpenedCourseIds()).toEqual(['crs-aaaaaaaa']);
  });

  it('lists several courses, sorted', async () => {
    await markCourseOpened('crs-cccccccc');
    await markCourseOpened('crs-aaaaaaaa');
    await markCourseOpened('crs-bbbbbbbb');
    expect(await getOpenedCourseIds()).toEqual(['crs-aaaaaaaa', 'crs-bbbbbbbb', 'crs-cccccccc']);
  });

  it('a course with a read block counts as opened too', async () => {
    await markBlockRead('crs-aaaaaaaa', 'blk-aaaaaaaa');
    expect(await getOpenedCourseIds()).toEqual(['crs-aaaaaaaa']);
  });

  it('the mark does not show up as a read block, real blocks still do', async () => {
    await markCourseOpened('crs-aaaaaaaa');
    expect(await getReadBlocks('crs-aaaaaaaa')).toEqual([]);
    await markBlockRead('crs-aaaaaaaa', 'blk-aaaaaaaa');
    expect(await getReadBlocks('crs-aaaaaaaa')).toEqual(['blk-aaaaaaaa']);
  });

  it('the stored row keeps the time encrypted (the mark is the only plain part)', async () => {
    await markCourseOpened('crs-aaaaaaaa', 1234567890123);
    const rows = await db.readProgress.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.blockId).toBe(OPENED_MARK);
    expect(JSON.stringify(rows[0])).not.toContain('1234567890123');
  });

  it('both functions reject with LockedError while nobody is logged in', async () => {
    clearStoreKey();
    await expect(markCourseOpened('crs-aaaaaaaa')).rejects.toBeInstanceOf(LockedError);
    await expect(getOpenedCourseIds()).rejects.toBeInstanceOf(LockedError);
  });
});
