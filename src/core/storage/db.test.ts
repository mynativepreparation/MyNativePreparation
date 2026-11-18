// @vitest-environment node
// Schema tests. They use private database names so the shared "np-local" database is never touched.
import { describe, expect, it } from 'vitest';
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
