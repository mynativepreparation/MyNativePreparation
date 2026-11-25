// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ManifestResult } from './loader';
import { checkContent, readSeen, SEEN_KEY, writeSeen, type SeenMap } from './sync';

// "What is new on the server?" (P11 T8 step b): the pure comparison of the live manifest with what the app saw last, and the two storage
// helpers. No network and no real storage: a fake `fetchManifest` and fake storages.

const A = 'crs-aaaaaaaa';
const B = 'crs-bbbbbbbb';
const C = 'crs-cccccccc';
const D = 'crs-dddddddd';
const E = 'crs-eeeeeeee';
const F = 'crs-ffffffff';

function manifestOf(versions: Array<[string, number]>): ManifestResult {
  return {
    ok: true,
    manifest: {
      schemaVersion: 1,
      generatedAt: '2026-11-23T00:00:00.000Z',
      courses: versions.map(([id, version]) => ({ id, title: `Course ${id}`, version, files: {} })),
    },
  };
}

const fetching = (result: ManifestResult) => vi.fn<() => Promise<ManifestResult>>(() => Promise.resolve(result));

describe('checkContent', () => {
  it('the first open (nothing stored) is silent and hands back the live versions to store', async () => {
    const fetchManifest = fetching(manifestOf([[A, 1], [B, 2]]));
    const check = await checkContent({ fetchManifest, seen: null });
    expect(check).toEqual({ status: 'unchanged', added: [], changed: [], removed: [], current: { [A]: 1, [B]: 2 } });
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });

  it('the same versions are unchanged', async () => {
    const check = await checkContent({ fetchManifest: fetching(manifestOf([[A, 1], [B, 2]])), seen: { [A]: 1, [B]: 2 } });
    expect(check).toEqual({ status: 'unchanged', added: [], changed: [], removed: [], current: { [A]: 1, [B]: 2 } });
  });

  it('a new course is added', async () => {
    const check = await checkContent({ fetchManifest: fetching(manifestOf([[A, 1], [B, 1]])), seen: { [A]: 1 } });
    expect(check).toEqual({ status: 'changed', added: [B], changed: [], removed: [], current: { [A]: 1, [B]: 1 } });
  });

  it('a course with a higher version is changed', async () => {
    const check = await checkContent({ fetchManifest: fetching(manifestOf([[A, 2], [B, 1]])), seen: { [A]: 1, [B]: 1 } });
    expect(check).toEqual({ status: 'changed', added: [], changed: [A], removed: [], current: { [A]: 2, [B]: 1 } });
  });

  it('a different version in either direction counts as changed', async () => {
    const check = await checkContent({ fetchManifest: fetching(manifestOf([[A, 2]])), seen: { [A]: 3 } });
    expect(check.status).toBe('changed');
    expect(check.changed).toEqual([A]);
  });

  it('a course that left the manifest is removed', async () => {
    const check = await checkContent({ fetchManifest: fetching(manifestOf([[A, 1]])), seen: { [A]: 1, [B]: 1 } });
    expect(check).toEqual({ status: 'changed', added: [], changed: [], removed: [B], current: { [A]: 1 } });
  });

  it('a mix: added and changed in manifest order, removed in memory order', async () => {
    const check = await checkContent({
      fetchManifest: fetching(manifestOf([[E, 1], [B, 2], [A, 1], [F, 1]])),
      seen: { [C]: 1, [A]: 1, [B]: 1, [D]: 1 },
    });
    expect(check.status).toBe('changed');
    expect(check.added).toEqual([E, F]);
    expect(check.changed).toEqual([B]);
    expect(check.removed).toEqual([C, D]);
    expect(check.current).toEqual({ [E]: 1, [B]: 2, [A]: 1, [F]: 1 });
  });

  it('an empty manifest after courses were seen removes all of them', async () => {
    const check = await checkContent({ fetchManifest: fetching(manifestOf([])), seen: { [A]: 1, [B]: 1 } });
    expect(check).toEqual({ status: 'changed', added: [], changed: [], removed: [A, B], current: {} });
  });

  it('a manifest that is unavailable says nothing and keeps the memory', async () => {
    const seen: SeenMap = { [A]: 1 };
    const check = await checkContent({
      fetchManifest: fetching({ ok: false, reason: 'unavailable', errors: ['manifest.json: network error'] }),
      seen,
    });
    expect(check).toEqual({ status: 'unavailable', added: [], changed: [], removed: [], current: { [A]: 1 } });
    expect(check.current).not.toBe(seen);
  });

  it('a manifest that is invalid says nothing and keeps the memory', async () => {
    const check = await checkContent({
      fetchManifest: fetching({ ok: false, reason: 'invalid', errors: ['bad'] }),
      seen: { [A]: 1, [B]: 2 },
    });
    expect(check).toEqual({ status: 'unavailable', added: [], changed: [], removed: [], current: { [A]: 1, [B]: 2 } });
  });

  it('an unavailable manifest on the first open leaves an empty memory', async () => {
    const check = await checkContent({
      fetchManifest: fetching({ ok: false, reason: 'unavailable', errors: [] }),
      seen: null,
    });
    expect(check).toEqual({ status: 'unavailable', added: [], changed: [], removed: [], current: {} });
  });

  it('a fetch that rejects is unavailable, never a throw', async () => {
    const fetchManifest = vi.fn<() => Promise<ManifestResult>>(() => Promise.reject(new Error('offline')));
    const check = await checkContent({ fetchManifest, seen: { [A]: 1 } });
    expect(check).toEqual({ status: 'unavailable', added: [], changed: [], removed: [], current: { [A]: 1 } });
  });

  it('a fetch that throws at once is unavailable, never a throw', async () => {
    const fetchManifest = vi.fn<() => Promise<ManifestResult>>(() => {
      throw new Error('boom');
    });
    const check = await checkContent({ fetchManifest, seen: null });
    expect(check).toEqual({ status: 'unavailable', added: [], changed: [], removed: [], current: {} });
  });

  it('a course id repeated in the manifest counts once', async () => {
    const check = await checkContent({ fetchManifest: fetching(manifestOf([[A, 1], [A, 1], [B, 1]])), seen: { [A]: 1 } });
    expect(check.added).toEqual([B]);
    expect(check.current).toEqual({ [A]: 1, [B]: 1 });
  });

  it('does not change the memory it was given', async () => {
    const seen: SeenMap = { [A]: 1, [C]: 1 };
    await checkContent({ fetchManifest: fetching(manifestOf([[A, 2], [B, 1]])), seen });
    expect(seen).toEqual({ [A]: 1, [C]: 1 });
  });
});

describe('readSeen', () => {
  const storing = (value: string | null) => ({ getItem: vi.fn<(key: string) => string | null>(() => value) });

  it('reads what was stored, under the key np.content.seen', () => {
    const storage = storing(JSON.stringify({ [A]: 1, [B]: 3 }));
    expect(readSeen(storage)).toEqual({ [A]: 1, [B]: 3 });
    expect(storage.getItem).toHaveBeenCalledWith('np.content.seen');
  });

  it('nothing stored is null (the first open)', () => {
    expect(readSeen(storing(null))).toBeNull();
  });

  it('no storage at all is null', () => {
    expect(readSeen(null)).toBeNull();
  });

  it('a storage that throws is null', () => {
    const storage = {
      getItem: (): string | null => {
        throw new Error('denied');
      },
    };
    expect(readSeen(storage)).toBeNull();
  });

  it('garbage is null: bad JSON, an array, a number, a string, null', () => {
    for (const raw of ['{not json', '[1,2]', '5', '"text"', 'null', '']) {
      expect(readSeen(storing(raw))).toBeNull();
    }
  });

  it('an empty object is a valid memory of nothing', () => {
    expect(readSeen(storing('{}'))).toEqual({});
  });

  it('drops entries whose id is not a course id', () => {
    const raw = JSON.stringify({ nope: 1, 'crs-BAD': 2, 'blk-aaaaaaaa': 3, 'crs-short': 4, [A]: 5 });
    expect(readSeen(storing(raw))).toEqual({ [A]: 5 });
  });

  it('drops entries whose version is not a positive whole number', () => {
    const raw = JSON.stringify({ [A]: 0, [B]: -1, [C]: 1.5, [D]: '2', [E]: null, [F]: true, 'crs-gggggggg': 7 });
    expect(readSeen(storing(raw))).toEqual({ 'crs-gggggggg': 7 });
  });

  it('an id like __proto__ never changes the result', () => {
    const raw = '{"__proto__": 1, "crs-aaaaaaaa": 2}';
    const map = readSeen(storing(raw));
    expect(map).toEqual({ [A]: 2 });
    expect(Object.keys(map ?? {})).toEqual([A]);
  });
});

describe('writeSeen', () => {
  it('stores exactly the ids and versions as JSON under np.content.seen', () => {
    const setItem = vi.fn<(key: string, value: string) => void>();
    expect(writeSeen({ setItem }, { [A]: 1, [B]: 2 })).toBe(true);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith('np.content.seen', '{"crs-aaaaaaaa":1,"crs-bbbbbbbb":2}');
  });

  it('an empty memory is stored as {}', () => {
    const setItem = vi.fn<(key: string, value: string) => void>();
    expect(writeSeen({ setItem }, {})).toBe(true);
    expect(setItem).toHaveBeenCalledWith('np.content.seen', '{}');
  });

  it('a storage that refuses gives false, never a throw', () => {
    const storage = {
      setItem: (): void => {
        throw new Error('quota');
      },
    };
    expect(writeSeen(storage, { [A]: 1 })).toBe(false);
  });

  it('no storage at all gives false', () => {
    expect(writeSeen(null, { [A]: 1 })).toBe(false);
  });

  it('what was written can be read back', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string): string | null => data.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        data.set(key, value);
      },
    };
    expect(writeSeen(storage, { [A]: 4, [B]: 1 })).toBe(true);
    expect(readSeen(storage)).toEqual({ [A]: 4, [B]: 1 });
  });
});

describe('SEEN_KEY', () => {
  it('is np.content.seen', () => {
    expect(SEEN_KEY).toBe('np.content.seen');
  });
});
