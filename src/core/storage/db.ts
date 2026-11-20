import type { Envelope } from '../identity/cipher';
import Dexie, { type Table } from 'dexie';

// Local database schema v2 (P04). ONLY `repo.ts` (and tests in this folder) may import this file:
// every read and write goes through the repository, which encrypts and decrypts (boundary rule 4 in scripts/check-boundaries.mjs).
//
// Rows keep their plain primary keys and index fields (course, block and test ids, test dates), because the database must be able to
// look rows up. Everything else personal lives in ONE encrypted `blob` per row (AES-256-GCM, see core/identity/cipher.ts).
// Not hidden, and said so in the privacy text: course ids, which blocks were opened, and the dates of tests.

export interface ProfileRow {
  /** Always "me": there is exactly one profile. */
  id: 'me';
  /** Encrypted `{ name?, email?, phone? }`. */
  blob: Envelope;
}

export interface ReadProgressRow {
  courseId: string;
  blockId: string;
  /** Encrypted `{ readAt }`. */
  blob: Envelope;
}

export interface AttemptRow {
  /** Set by the database (auto-increment). */
  id?: number;
  courseId: string;
  testId: string;
  /** Milliseconds since 1970 (plain, so attempts can be indexed by date). */
  at: number;
  /** Encrypted `{ asked, correct, percent, stars }`. `null` only for the split second between reserving the id and saving the encrypted data. */
  blob: Envelope | null;
}

export interface KvRow {
  key: string;
  /** Any JSON value. Plain on purpose: only non-personal settings (and the encrypted key check) live here. */
  value: unknown;
}

export const DB_NAME = 'np-local';

const STORES = {
  profile: 'id',
  readProgress: '[courseId+blockId], courseId',
  attempts: '++id, courseId, testId, at',
  kv: 'key',
} as const;

export class LocalDb extends Dexie {
  // `declare` is required: with ES2022 class fields a plain field would overwrite the table Dexie creates.
  declare profile: Table<ProfileRow, string>;
  declare readProgress: Table<ReadProgressRow, [string, string]>;
  declare attempts: Table<AttemptRow, number>;
  declare kv: Table<KvRow, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    // v1 (P03) stored readable rows. Version 1 stays declared so Dexie can upgrade from it.
    this.version(1).stores(STORES);
    // v2 (P04): same tables and indexes, but personal fields move into an encrypted blob.
    // Nothing was released with v1, so the upgrade simply deletes the old readable rows (the `kv` table is kept).
    this.version(2)
      .stores(STORES)
      .upgrade(async (tx) => {
        await Promise.all([
          tx.table('profile').clear(),
          tx.table('readProgress').clear(),
          tx.table('attempts').clear(),
        ]);
      });
  }
}

/** The one shared database of the app. Dexie opens it lazily on first use. */
export const db = new LocalDb();
