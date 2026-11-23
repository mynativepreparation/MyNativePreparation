import Dexie, { type Table } from 'dexie';
import { migrateDraft, type CourseDraft } from './model';

// Local drafts of the Admin editor (P10 T6, DECISIONS Q24): one row per course, kept in the browser's IndexedDB so a reload
// loses nothing. This is its OWN small database (`np-admin-drafts`), separate from the user's encrypted `np-local` database
// (boundary rule 4 keeps `core/storage/db.ts` private). Drafts are public course material, so they are stored readable.
// NEVER put the GitHub token (or anything secret) in here.
// Every method returns a result and never throws: the UI maps `code` to a friendly string.

export const DRAFT_DB_NAME = 'np-admin-drafts';

export interface DraftRecord {
  /** The course id (primary key), same as `draft.course.id`. */
  id: string;
  draft: CourseDraft;
  /** The developer deleted the course. The real delete happens when publishing (P11); until then it can be restored. */
  deleted: boolean;
  /** Milliseconds since 1970 of the last save. */
  updatedAt: number;
}

export type StoreCode = 'storage_unavailable' | 'quota_exceeded';
export type StoreResult<T> = { ok: true; value: T } | { ok: false; code: StoreCode };

export interface DraftStore {
  /** All drafts (also the deleted ones), sorted by course order, then title, then id. */
  list(): Promise<StoreResult<DraftRecord[]>>;
  get(id: string): Promise<StoreResult<DraftRecord | undefined>>;
  /** Creates or replaces the draft of `draft.course.id`. Saving a course always clears its "deleted" mark. */
  put(draft: CourseDraft): Promise<StoreResult<DraftRecord>>;
  /** Marks (or, with `false`, restores) a course. The value is false when no such draft exists. */
  markDeleted(id: string, deleted?: boolean): Promise<StoreResult<boolean>>;
  /** Removes the draft row for good (an unknown id is fine). */
  remove(id: string): Promise<StoreResult<true>>;
  /** Closes the connection (used by tests). */
  close(): void;
}

class DraftDb extends Dexie {
  // `declare` is required: with ES2022 class fields a plain field would overwrite the table Dexie creates.
  declare drafts: Table<DraftRecord, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ drafts: 'id, updatedAt' });
  }
}

/** Maps any storage failure to a code. The original message is dropped on purpose (no raw errors in the UI). */
export function storeErrorCode(error: unknown): StoreCode {
  const name = typeof error === 'object' && error !== null && 'name' in error ? (error as { name?: unknown }).name : undefined;
  return name === 'QuotaExceededError' ? 'quota_exceeded' : 'storage_unavailable';
}

async function guard<T>(run: () => Promise<T>): Promise<StoreResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, code: storeErrorCode(error) };
  }
}

/** Rows saved by an older editor hold one `test` and no `tests`: bring them to the current shape (nothing is lost; the next Save writes the new shape). */
function migrateRow(row: DraftRecord): DraftRecord {
  return { ...row, draft: migrateDraft(row.draft) };
}

function byOrder(a: DraftRecord, b: DraftRecord): number {
  return (
    a.draft.course.order - b.draft.course.order ||
    a.draft.course.title.localeCompare(b.draft.course.title) ||
    a.id.localeCompare(b.id)
  );
}

export function openDraftStore(options: { name?: string; now?: () => number } = {}): DraftStore {
  const db = new DraftDb(options.name ?? DRAFT_DB_NAME);
  const now = options.now ?? Date.now;

  return {
    list: () =>
      guard(async () => {
        const rows = await db.drafts.toArray();
        return rows.map(migrateRow).sort(byOrder);
      }),

    get: (id) =>
      guard(async () => {
        const row = await db.drafts.get(id);
        return row === undefined ? undefined : migrateRow(row);
      }),

    put: (draft) =>
      guard(async () => {
        const record: DraftRecord = { id: draft.course.id, draft, deleted: false, updatedAt: now() };
        await db.drafts.put(record);
        return record;
      }),

    markDeleted: (id, deleted = true) =>
      guard(() =>
        db.transaction('rw', db.drafts, async () => {
          const row = await db.drafts.get(id);
          if (row === undefined) return false;
          await db.drafts.put({ ...row, deleted, updatedAt: now() });
          return true;
        }),
      ),

    remove: (id) =>
      guard(async () => {
        await db.drafts.delete(id);
        return true as const;
      }),

    close: () => {
      db.close();
    },
  };
}
