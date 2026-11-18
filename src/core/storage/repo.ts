import { percentOf, starsForPercent } from '../content/scoring';
import { db, type AttemptRow } from './db';

// The repository: the ONLY way the rest of the app reads or writes local data (P03 plan).
// P04 wraps these functions with encryption, so keep every access to the tables in this file.

// ---------- profile ----------

export interface Profile {
  name?: string;
  email?: string;
  phone?: string;
}

const PROFILE_ID = 'me' as const;

function cleanProfile(input: Profile): Profile {
  const out: Profile = {};
  if (typeof input.name === 'string') out.name = input.name;
  if (typeof input.email === 'string') out.email = input.email;
  if (typeof input.phone === 'string') out.phone = input.phone;
  return out;
}

/** The saved profile, or `undefined` when none was saved yet. */
export async function getProfile(): Promise<Profile | undefined> {
  const row = await db.profile.get(PROFILE_ID);
  return row ? cleanProfile(row) : undefined;
}

/** Replaces the whole profile (there is only one). Fields left out are removed. */
export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put({ id: PROFILE_ID, ...cleanProfile(profile) });
}

// ---------- reading progress ----------

/** Marks a block as read. Marking it again only updates `readAt`. */
export async function markBlockRead(
  courseId: string,
  blockId: string,
  readAt: number = Date.now(),
): Promise<void> {
  await db.readProgress.put({ courseId, blockId, readAt });
}

/** Ids of the blocks read in a course, oldest first. Empty array when nothing was read. */
export async function getReadBlocks(courseId: string): Promise<string[]> {
  const rows = await db.readProgress.where('courseId').equals(courseId).toArray();
  rows.sort((a, b) => a.readAt - b.readAt || a.blockId.localeCompare(b.blockId));
  return rows.map((r) => r.blockId);
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

export type Attempt = AttemptRow & { id: number };

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
  const percent = percentOf(correct, asked);
  const row: AttemptRow = {
    courseId,
    testId,
    asked,
    correct,
    percent,
    stars: starsForPercent(percent),
    at: input.at ?? Date.now(),
  };
  const id = await db.attempts.add(row);
  return { ...row, id };
}

/** All attempts of a course, newest first. Empty array when there are none. */
export async function listAttempts(courseId: string): Promise<Attempt[]> {
  const rows = (await db.attempts.where('courseId').equals(courseId).toArray()) as Attempt[];
  return rows.sort((a, b) => b.at - a.at || b.id - a.id);
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
