// @vitest-environment node
// Schema tests. They use private database names so the shared "np-local" database is never touched.
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { DB_NAME, LocalDb } from './db';

describe('LocalDb', () => {
  it('uses the database name from the plan', () => {
    expect(DB_NAME).toBe('np-local');
    expect(new LocalDb().name).toBe('np-local');
  });

  it('has the four tables with the planned keys and indexes', async () => {
    const d = new LocalDb('np-test-schema');
    try {
      await d.open();
      expect(d.tables.map((t) => t.name).sort()).toEqual(['attempts', 'kv', 'profile', 'readProgress']);
      expect(d.table('profile').schema.primKey.keyPath).toBe('id');
      expect(d.table('kv').schema.primKey.keyPath).toBe('key');
      expect(d.table('readProgress').schema.primKey.keyPath).toEqual(['courseId', 'blockId']);
      expect(d.table('readProgress').schema.indexes.map((i) => i.name)).toContain('courseId');
      expect(d.table('attempts').schema.primKey.auto).toBe(true);
      const attemptIndexes = d.table('attempts').schema.indexes.map((i) => i.name);
      expect(attemptIndexes).toEqual(expect.arrayContaining(['courseId', 'testId', 'at']));
    } finally {
      await d.delete();
    }
  });

  it('upgrades from the readable v1 schema: old personal rows are deleted, settings are kept', async () => {
    const name = 'np-test-upgrade';
    const old = new Dexie(name);
    old.version(1).stores({
      profile: 'id',
      readProgress: '[courseId+blockId], courseId',
      attempts: '++id, courseId, testId, at',
      kv: 'key',
    });
    await old.open();
    await old.table('profile').put({ id: 'me', name: 'Old Readable Name' });
    await old.table('readProgress').put({ courseId: 'c', blockId: 'b', readAt: 1 });
    await old.table('attempts').add({ courseId: 'c', testId: 't', asked: 1, correct: 1, percent: 100, stars: 5, at: 1 });
    await old.table('kv').put({ key: 'np.theme', value: 'dark' });
    old.close();

    const upgraded = new LocalDb(name);
    try {
      await upgraded.open();
      expect(await upgraded.profile.count()).toBe(0);
      expect(await upgraded.readProgress.count()).toBe(0);
      expect(await upgraded.attempts.count()).toBe(0);
      expect((await upgraded.kv.get('np.theme'))?.value).toBe('dark');
    } finally {
      await upgraded.delete();
    }
  });

  it('opens twice (two instances, same database) without error', async () => {
    const a = new LocalDb('np-test-open');
    const b = new LocalDb('np-test-open');
    try {
      await a.open();
      await b.open();
      expect(a.isOpen()).toBe(true);
      expect(b.isOpen()).toBe(true);
      await a.open(); // opening an already open instance is also fine
    } finally {
      a.close();
      await b.delete();
    }
  });
});
