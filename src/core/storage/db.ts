import Dexie, { type Table } from 'dexie';

// Local database schema v1 (P03 plan). ONLY `repo.ts` (and tests in this folder) may import this file:
// every read and write goes through the repository so P04 can wrap it with encryption.
// Boundary rule 4 in scripts/check-boundaries.mjs enforces that.

export interface ProfileRow {
  /** Always "me": there is exactly one profile. */
  id: 'me';
  name?: string;
  email?: string;
  phone?: string;
}

export interface ReadProgressRow {
  courseId: string;
  blockId: string;
  /** Milliseconds since 1970. */
  readAt: number;
}

export interface AttemptRow {
  /** Set by the database (auto-increment). */
  id?: number;
  courseId: string;
  testId: string;
  asked: number;
  correct: number;
  percent: number;
  stars: number;
  /** Milliseconds since 1970. */
  at: number;
}

export interface KvRow {
  key: string;
  /** Any JSON value. */
  value: unknown;
}

export const DB_NAME = 'np-local';

export class LocalDb extends Dexie {
  // `declare` is required: with ES2022 class fields a plain field would overwrite the table Dexie creates.
  declare profile: Table<ProfileRow, string>;
  declare readProgress: Table<ReadProgressRow, [string, string]>;
  declare attempts: Table<AttemptRow, number>;
  declare kv: Table<KvRow, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      profile: 'id',
      readProgress: '[courseId+blockId], courseId',
      attempts: '++id, courseId, testId, at',
      kv: 'key',
    });
  }
}

/** The one shared database of the app. Dexie opens it lazily on first use. */
export const db = new LocalDb();
