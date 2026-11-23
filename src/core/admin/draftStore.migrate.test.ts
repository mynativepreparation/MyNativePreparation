// @vitest-environment node
// Old drafts in the browser (P10 T11r): a row saved by the older editor holds one `test` and no `tests`. Reading it must give the
// current shape. The rows are written straight into IndexedDB with Dexie, the way the older editor stored them.
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import type { Test } from '../content/types';
import { openDraftStore, type DraftStore, type StoreResult } from './draftStore';
import { createCourseDraft } from './model';

const T1: Test = {
  id: 'tst-aaaaaaaa',
  questionsPerGame: 1,
  questions: [{ id: 'qst-aaaaaaaa', text: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }],
};
const T2: Test = { ...T1, id: 'tst-bbbbbbbb', questions: [{ ...T1.questions[0]!, id: 'qst-bbbbbbbb' }] };

let counter = 0;
const names: string[] = [];
const stores: DraftStore[] = [];

/** Writes rows the way the OLD editor did (schema version 1, rows without `tests`) and returns the database name. */
async function seed(rows: unknown[]): Promise<string> {
  counter += 1;
  const name = `np-test-migrate-${counter}`;
  names.push(name);
  const raw = new Dexie(name);
  raw.version(1).stores({ drafts: 'id, updatedAt' });
  await raw.table('drafts').bulkPut(rows);
  raw.close();
  return name;
}

function open(name: string): DraftStore {
  const store = openDraftStore({ name, now: () => 1000 });
  stores.push(store);
  return store;
}

afterEach(async () => {
  for (const store of stores.splice(0)) store.close();
  for (const name of names.splice(0)) await Dexie.delete(name);
});

function value<T>(result: StoreResult<T>): T {
  if (!result.ok) throw new Error(`store failed: ${result.code}`);
  return result.value;
}

const oldRow = (id: string, order: number, extra: Record<string, unknown>) => ({
  id,
  draft: { course: { id, title: `Course ${order}`, order }, overview: [], content: [], images: [], ...extra },
  deleted: false,
  updatedAt: 5,
});

describe('old draft rows', () => {
  it('get() turns the one old test into a list of one', async () => {
    const store = open(await seed([oldRow('crs-aaaaaaaa', 1, { test: T1 })]));
    const row = value(await store.get('crs-aaaaaaaa'));
    expect(row?.draft.tests).toEqual([T1]);
    expect(row !== undefined && 'test' in row.draft).toBe(false);
  });

  it('an old row with no test (null) gets an empty list', async () => {
    const store = open(await seed([oldRow('crs-aaaaaaaa', 1, { test: null })]));
    expect(value(await store.get('crs-aaaaaaaa'))?.draft.tests).toEqual([]);
  });

  it('list() migrates every row and keeps the order of the courses', async () => {
    const store = open(await seed([oldRow('crs-bbbbbbbb', 2, { test: T2 }), oldRow('crs-aaaaaaaa', 1, { test: T1 })]));
    const rows = value(await store.list());
    expect(rows.map((r) => r.id)).toEqual(['crs-aaaaaaaa', 'crs-bbbbbbbb']);
    expect(rows.map((r) => r.draft.tests)).toEqual([[T1], [T2]]);
  });

  it('a row that already has tests keeps them untouched', async () => {
    const store = open(await seed([oldRow('crs-aaaaaaaa', 1, { tests: [T2, T1] })]));
    expect(value(await store.get('crs-aaaaaaaa'))?.draft.tests).toEqual([T2, T1]);
  });

  it('the next Save writes the current shape and the draft reads back whole', async () => {
    const store = open(await seed([oldRow('crs-aaaaaaaa', 1, { test: T1 })]));
    const migrated = value(await store.get('crs-aaaaaaaa'));
    if (migrated === undefined) throw new Error('row missing');
    value(await store.put({ ...migrated.draft, tests: [...migrated.draft.tests, T2] }));
    expect(value(await store.get('crs-aaaaaaaa'))?.draft.tests).toEqual([T1, T2]);
  });

  it('a new draft with several tests is stored and read back as it is', async () => {
    const store = open(await seed([]));
    const draft = { ...createCourseDraft({ title: 'New', order: 1 }), tests: [T1, T2] };
    value(await store.put(draft));
    expect(value(await store.get(draft.course.id))?.draft.tests).toEqual([T1, T2]);
  });
});
