import Dexie, { type Table } from 'dexie';

// A tiny SEPARATE database for session material only (the saved store key, later the fingerprint-wrapped key).
// It is separate from `np-local` on purpose: "Log out" clears this database completely and cannot touch the user's data.
// Only src/core/identity/ should use this file. Nothing here ever holds the 12 words.

export interface SessionRecord {
  id: string;
  /** Any structured-cloneable value, including a non-extractable CryptoKey (IndexedDB stores it without exposing its bytes). */
  value: unknown;
}

export const SESSION_DB_NAME = 'np-session';

class SessionDb extends Dexie {
  // `declare`: with ES2022 class fields a plain field would overwrite the table Dexie creates.
  declare records: Table<SessionRecord, string>;

  constructor(name: string = SESSION_DB_NAME) {
    super(name);
    this.version(1).stores({ records: 'id' });
  }
}

const sessionDb = new SessionDb();

/** A saved record's value, or `undefined`. `T` is the caller's promise about the stored value; it is not checked. */
export async function getSessionRecord<T = unknown>(id: string): Promise<T | undefined> {
  const row = await sessionDb.records.get(id);
  return row?.value as T | undefined;
}

/** Saves a record. Saving the same id again replaces it. */
export async function putSessionRecord(id: string, value: unknown): Promise<void> {
  await sessionDb.records.put({ id, value });
}

/** Removes one record. A missing id is fine. */
export async function deleteSessionRecord(id: string): Promise<void> {
  await sessionDb.records.delete(id);
}

/** Removes every record (used by Log out). */
export async function clearSessionRecords(): Promise<void> {
  await sessionDb.records.clear();
}
