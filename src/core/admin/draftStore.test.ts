// @vitest-environment node
// Draft store tests (P10 T6). Every test opens its own private database name, so nothing is shared and "np-admin-drafts" is never touched.
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DRAFT_DB_NAME, openDraftStore, storeErrorCode, type DraftStore, type StoreResult } from './draftStore';
import { createCourseDraft, newTextBlock, type CourseDraft } from './model';

let counter = 0;
const opened: { store: DraftStore; name: string }[] = [];

function makeStore(now: () => number = () => 1000, name?: string): { store: DraftStore; name: string } {
  counter += 1;
  const dbName = name ?? `np-test-drafts-${counter}`;
  const store = openDraftStore({ name: dbName, now });
  opened.push({ store, name: dbName });
  return { store, name: dbName };
}

afterEach(async () => {
  for (const { store, name } of opened.splice(0)) {
    store.close();
    await Dexie.delete(name);
  }
});

function value<T>(result: StoreResult<T>): T {
  if (!result.ok) throw new Error(`store failed: ${result.code}`);
  return result.value;
}

function draftOf(title: string, order: number): CourseDraft {
  return createCourseDraft({ title, order });
}

describe('draft store', () => {
  it('uses its own database name, not the user database', () => {
    expect(DRAFT_DB_NAME).toBe('np-admin-drafts');
  });

  it('starts empty', async () => {
    const { store } = makeStore();
    expect(value(await store.list())).toEqual([]);
  });

  it('keeps a draft with its blocks and image bytes', async () => {
    const { store } = makeStore();
    const draft = draftOf('ગણિત', 2);
    draft.content.push(newTextBlock('text', 'પહેલો ફકરો'));
    draft.images.push({ path: 'images/1.webp', mime: 'image/webp', bytes: new Uint8Array([1, 2, 3]) });
    const saved = value(await store.put(draft));
    expect(saved).toEqual({ id: draft.course.id, draft, deleted: false, updatedAt: 1000 });
    const loaded = value(await store.get(draft.course.id));
    expect(loaded?.draft.course).toEqual(draft.course);
    expect(loaded?.draft.content).toEqual(draft.content);
    expect(loaded?.draft.images.map((i) => Array.from(i.bytes))).toEqual([[1, 2, 3]]);
    expect(loaded?.updatedAt).toBe(1000);
  });

  it('get of an unknown id is fine and empty', async () => {
    const { store } = makeStore();
    expect(value(await store.get('crs_missing'))).toBeUndefined();
  });

  it('saving the same course again replaces it', async () => {
    let t = 1000;
    const { store } = makeStore(() => t);
    const draft = draftOf('A', 1);
    value(await store.put(draft));
    draft.course.title = 'B';
    t = 2000;
    value(await store.put(draft));
    const rows = value(await store.list());
    expect(rows.map((r) => r.draft.course.title)).toEqual(['B']);
    expect(rows.map((r) => r.updatedAt)).toEqual([2000]);
  });

  it('lists by order, then by title', async () => {
    const { store } = makeStore();
    value(await store.put(draftOf('B', 2)));
    value(await store.put(draftOf('Z', 1)));
    value(await store.put(draftOf('A', 2)));
    const rows = value(await store.list());
    expect(rows.map((r) => r.draft.course.title)).toEqual(['Z', 'A', 'B']);
  });

  it('marks a course as deleted and restores it, and keeps it in the list', async () => {
    let t = 1000;
    const { store } = makeStore(() => t);
    const draft = draftOf('A', 1);
    value(await store.put(draft));
    t = 3000;
    expect(value(await store.markDeleted(draft.course.id))).toBe(true);
    const gone = value(await store.get(draft.course.id));
    expect(gone?.deleted).toBe(true);
    expect(gone?.updatedAt).toBe(3000);
    expect(gone?.draft).toEqual(draft);
    expect(value(await store.list()).map((r) => r.deleted)).toEqual([true]);
    expect(value(await store.markDeleted(draft.course.id, false))).toBe(true);
    expect(value(await store.get(draft.course.id))?.deleted).toBe(false);
  });

  it('markDeleted on an unknown id says false and creates nothing', async () => {
    const { store } = makeStore();
    expect(value(await store.markDeleted('crs_missing'))).toBe(false);
    expect(value(await store.list())).toEqual([]);
  });

  it('saving a deleted course clears the deleted mark', async () => {
    const { store } = makeStore();
    const draft = draftOf('A', 1);
    value(await store.put(draft));
    value(await store.markDeleted(draft.course.id));
    value(await store.put(draft));
    expect(value(await store.get(draft.course.id))?.deleted).toBe(false);
  });

  it('removes a draft for good, and an unknown id is fine', async () => {
    const { store } = makeStore();
    const draft = draftOf('A', 1);
    value(await store.put(draft));
    expect(value(await store.remove(draft.course.id))).toBe(true);
    expect(value(await store.list())).toEqual([]);
    expect(value(await store.remove('crs_missing'))).toBe(true);
  });

  it('keeps drafts after the connection is closed and opened again (a reload)', async () => {
    const first = makeStore();
    const draft = draftOf('A', 1);
    value(await first.store.put(draft));
    first.store.close();
    const second = makeStore(() => 1000, first.name);
    const rows = value(await second.store.list());
    expect(rows.map((r) => r.id)).toEqual([draft.course.id]);
  });

  it('returns a code instead of throwing when the database is not usable', async () => {
    const { store } = makeStore();
    store.close();
    expect(await store.list()).toEqual({ ok: false, code: 'storage_unavailable' });
    expect(await store.put(draftOf('A', 1))).toEqual({ ok: false, code: 'storage_unavailable' });
  });
});

describe('storeErrorCode', () => {
  it('maps a full disk to quota_exceeded', () => {
    expect(storeErrorCode(new DOMException('full', 'QuotaExceededError'))).toBe('quota_exceeded');
    expect(storeErrorCode(Object.assign(new Error('full'), { name: 'QuotaExceededError' }))).toBe('quota_exceeded');
  });

  it('maps everything else to storage_unavailable', () => {
    expect(storeErrorCode(new Error('boom'))).toBe('storage_unavailable');
    expect(storeErrorCode('boom')).toBe('storage_unavailable');
    expect(storeErrorCode(null)).toBe('storage_unavailable');
    expect(storeErrorCode(undefined)).toBe('storage_unavailable');
  });
});
