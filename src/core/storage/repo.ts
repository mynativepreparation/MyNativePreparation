import { percentOf, starsForPercent } from '../content/scoring';
import { decryptJson, encryptJson } from '../identity/cipher';
import { getStoreKey } from '../identity/keyring';
import { db } from './db';

// The repository: the ONLY way the rest of the app reads or writes local data (P03 plan).
// P04: personal data is encrypted here with the store key (AES-256-GCM). Every function that touches personal data
// first asks for the key and rejects with `LockedError` while nobody is logged in.
// Each encrypted value is bound to its row by AAD `<table>:<key>`, so a ciphertext copied to another row cannot be read.
// A damaged, tampered or moved row makes the read reject with `DecryptError`; callers show it as "unreadable", never crash.
// Settings (`kv`) are plain and need no key.

// ---------- profile ----------

export interface Profile {
  name?: string;
  email?: string;
  phone?: string;
}

const PROFILE_ID = 'me' as const;
const PROFILE_AAD = `profile:${PROFILE_ID}`;

function cleanProfile(input: Profile): Profile {
  const out: Profile = {};
  if (typeof input.name === 'string') out.name = input.name;
  if (typeof input.email === 'string') out.email = input.email;
  if (typeof input.phone === 'string') out.phone = input.phone;
  return out;
}

/** The saved profile, or `undefined` when none was saved yet. Rejects with `LockedError` / `DecryptError`. */
export async function getProfile(): Promise<Profile | undefined> {
  const key = getStoreKey();
  const row = await db.profile.get(PROFILE_ID);
  if (!row) return undefined;
  return cleanProfile(await decryptJson<Profile>(key, row.blob, PROFILE_AAD));
}

/** Replaces the whole profile (there is only one). Fields left out are removed. */
export async function saveProfile(profile: Profile): Promise<void> {
  const key = getStoreKey();
  const blob = await encryptJson(key, cleanProfile(profile), PROFILE_AAD);
  await db.profile.put({ id: PROFILE_ID, blob });
}

// ---------- reading progress ----------

const progressAad = (courseId: string, blockId: string): string => `readProgress:${courseId}|${blockId}`;

interface ProgressDetails {
  readAt: number;
}

/** Marks a block as read. Marking it again only updates `readAt`. */
export async function markBlockRead(
  courseId: string,
  blockId: string,
  readAt: number = Date.now(),
): Promise<void> {
  const key = getStoreKey();
  const blob = await encryptJson(key, { readAt } satisfies ProgressDetails, progressAad(courseId, blockId));
  await db.readProgress.put({ courseId, blockId, blob });
}

/** Ids of the blocks read in a course, oldest first. Empty array when nothing was read. */
export async function getReadBlocks(courseId: string): Promise<string[]> {
  const key = getStoreKey();
  const rows = await db.readProgress.where('courseId').equals(courseId).toArray();
  const items = await Promise.all(
    rows.map(async (row) => {
      const details = await decryptJson<ProgressDetails>(key, row.blob, progressAad(row.courseId, row.blockId));
      return { blockId: row.blockId, readAt: details.readAt };
    }),
  );
  items.sort((a, b) => a.readAt - b.readAt || a.blockId.localeCompare(b.blockId));
  return items.map((item) => item.blockId);
}

// ---------- test attempts ----------

export interface NewAttempt {
  courseId: string;
  testId: string;
  /** Questions asked in the game (1 or more). */
  asked: number;
  /** Correct answers, from 0 to `asked`. */
  correct: number;
  /** Milliseconds since 1970; defaults to now. */
  at?: number;
}

export interface Attempt {
  id: number;
  courseId: string;
  testId: string;
  asked: number;
  correct: number;
  percent: number;
  stars: number;
  /** Milliseconds since 1970. */
  at: number;
}

interface AttemptDetails {
  asked: number;
  correct: number;
  percent: number;
  stars: number;
}

const attemptAad = (id: number): string => `attempts:${id}`;

/**
 * Saves one finished game. Percent and stars are computed here (scoring.ts, DECISIONS Q6) so that
 * stored values can never disagree with the rules. Throws a RangeError for impossible numbers.
 */
export async function addAttempt(input: NewAttempt): Promise<Attempt> {
  const { courseId, testId, asked, correct } = input;
  if (!Number.isInteger(asked) || asked < 1) {
    throw new RangeError('asked must be an integer of 1 or more');
  }
  if (!Number.isInteger(correct) || correct < 0 || correct > asked) {
    throw new RangeError('correct must be an integer from 0 to asked');
  }
  const key = getStoreKey();
  const percent = percentOf(correct, asked);
  const details: AttemptDetails = { asked, correct, percent, stars: starsForPercent(percent) };
  const at = input.at ?? Date.now();

  // The id is part of the AAD and is only known after the row exists, so the row is reserved first (blob `null`),
  // then filled. If encryption or saving fails, the reserved row is removed again.
  const id = await db.attempts.add({ courseId, testId, at, blob: null });
  try {
    const blob = await encryptJson(key, details, attemptAad(id));
    await db.attempts.update(id, { blob });
  } catch (error) {
    await db.attempts.delete(id).catch(() => undefined);
    throw error;
  }
  return { id, courseId, testId, at, ...details };
}

/** All attempts of a course, newest first. Empty array when there are none. Half-saved rows (no data yet) are skipped. */
export async function listAttempts(courseId: string): Promise<Attempt[]> {
  const key = getStoreKey();
  const rows = await db.attempts.where('courseId').equals(courseId).toArray();
  const attempts = await Promise.all(
    rows.flatMap((row) => {
      const { id, blob } = row;
      if (id === undefined || blob === null) return [];
      return [
        decryptJson<AttemptDetails>(key, blob, attemptAad(id)).then(
          (details): Attempt => ({ id, courseId: row.courseId, testId: row.testId, at: row.at, ...details }),
        ),
      ];
    }),
  );
  return attempts.sort((a, b) => b.at - a.at || b.id - a.id);
}

// ---------- small settings ----------

/** A saved setting, or `undefined`. `T` is the caller's promise about the stored JSON; it is not checked. */
export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row?.value as T | undefined;
}

/** Saves a setting (any JSON value). Saving the same key again replaces it. */
export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

/** Removes a setting. Removing a key that does not exist is fine. */
export async function deleteSetting(key: string): Promise<void> {
  await db.kv.delete(key);
}
