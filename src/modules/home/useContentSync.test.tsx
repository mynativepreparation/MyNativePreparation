import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ManifestResult } from '../../core/content/loader';
import type { SeenMap } from '../../core/content/sync';
import { useContentSync, type ContentSyncDeps } from './useContentSync';

// "New or updated courses" on Home (P11 T8 step c): the hook around core/content/sync.ts. Everything is faked: the manifest, the storage, the
// reload of the list and the `online` event. The pure comparison itself is tested in core/content/sync.test.ts.

const A = 'crs-aaaaaaaa';
const B = 'crs-bbbbbbbb';
const C = 'crs-cccccccc';

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

/** A storage in memory that also writes down every `setItem` in `log`. */
function memoryStorage(initial: SeenMap | null, log: string[] = []) {
  const data = new Map<string, string>();
  if (initial !== null) data.set('np.content.seen', JSON.stringify(initial));
  return {
    getItem: (key: string): string | null => data.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      log.push('write');
      data.set(key, value);
    },
    stored: (): unknown => {
      const raw = data.get('np.content.seen');
      return raw === undefined ? null : (JSON.parse(raw) as unknown);
    },
    writes: () => log.filter((entry) => entry === 'write').length,
  };
}

/** A stand-in for `window` that keeps the `online` listeners. */
function fakeTarget() {
  const listeners = new Set<() => void>();
  return {
    addEventListener: (_type: 'online', listener: () => void): void => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'online', listener: () => void): void => {
      listeners.delete(listener);
    },
    fire: () => {
      for (const listener of [...listeners]) listener();
    },
    count: () => listeners.size,
  };
}

/** A promise that stays open until `release` is called, to hold a check in the middle. */
function gate<T>() {
  const holder: { release: (value: T) => void } = { release: () => undefined };
  const promise = new Promise<T>((resolve) => {
    holder.release = resolve;
  });
  return { promise, release: (value: T) => holder.release(value) };
}

const settle = () =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

function setup(options: { seen: SeenMap | null; manifest?: ManifestResult; refreshes?: boolean; log?: string[] }) {
  const log = options.log ?? [];
  const storage = memoryStorage(options.seen, log);
  const target = fakeTarget();
  const fetchManifest = vi.fn<() => Promise<ManifestResult>>(() => Promise.resolve(options.manifest ?? manifestOf([[A, 1]])));
  const refresh = vi.fn<() => Promise<boolean>>(() => {
    log.push('refresh');
    return Promise.resolve(options.refreshes ?? true);
  });
  const deps: ContentSyncDeps = { fetchManifest, storage, target };
  const view = renderHook(() => useContentSync(refresh, deps));
  return { ...view, storage, target, fetchManifest, refresh, log };
}

describe('useContentSync: when it speaks', () => {
  it('the first open is silent: it only stores the versions it finds', async () => {
    const { result, storage, refresh, fetchManifest } = setup({ seen: null, manifest: manifestOf([[A, 1], [B, 2]]) });
    await waitFor(() => expect(storage.stored()).toEqual({ [A]: 1, [B]: 2 }));
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.note).toBeNull();
  });

  it('nothing new: no reload, no note, and nothing is written again', async () => {
    const { result, storage, refresh, fetchManifest } = setup({ seen: { [A]: 1 }, manifest: manifestOf([[A, 1]]) });
    await waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(1));
    await settle();
    expect(refresh).not.toHaveBeenCalled();
    expect(storage.writes()).toBe(0);
    expect(result.current.note).toBeNull();
  });

  it('a new course: reloads the list, says 1, and stores the new versions AFTER the reload', async () => {
    const log: string[] = [];
    const { result, storage, refresh } = setup({ seen: { [A]: 1 }, manifest: manifestOf([[A, 1], [B, 1]]), log });
    await waitFor(() => expect(result.current.note).toEqual({ count: 1 }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(storage.stored()).toEqual({ [A]: 1, [B]: 1 });
    expect(log).toEqual(['refresh', 'write']);
  });

  it('new and updated courses are counted together', async () => {
    const { result } = setup({ seen: { [A]: 1, [B]: 1 }, manifest: manifestOf([[A, 2], [B, 1], [C, 1]]) });
    await waitFor(() => expect(result.current.note).toEqual({ count: 2 }));
  });

  it('a course that was only removed reloads the list and stores the versions, but says nothing', async () => {
    const { result, storage, refresh } = setup({ seen: { [A]: 1, [B]: 1 }, manifest: manifestOf([[A, 1]]) });
    await waitFor(() => expect(storage.stored()).toEqual({ [A]: 1 }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.note).toBeNull();
  });

  it('when the reload fails it says nothing and stores nothing, so the next check announces it again', async () => {
    const { result, storage, refresh } = setup({ seen: { [A]: 1 }, manifest: manifestOf([[A, 2]]), refreshes: false });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await settle();
    expect(result.current.note).toBeNull();
    expect(storage.writes()).toBe(0);
    expect(storage.stored()).toEqual({ [A]: 1 });
  });

  it('a manifest that cannot be read changes nothing at all', async () => {
    const { result, storage, refresh, fetchManifest } = setup({
      seen: { [A]: 1 },
      manifest: { ok: false, reason: 'unavailable', errors: ['offline'] },
    });
    await waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(1));
    await settle();
    expect(refresh).not.toHaveBeenCalled();
    expect(storage.writes()).toBe(0);
    expect(result.current.note).toBeNull();
  });

  it('a fetch that rejects is swallowed: no note, no write, no unhandled error', async () => {
    const storage = memoryStorage({ [A]: 1 });
    const target = fakeTarget();
    const fetchManifest = vi.fn<() => Promise<ManifestResult>>(() => Promise.reject(new Error('offline')));
    const refresh = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
    const deps: ContentSyncDeps = { fetchManifest, storage, target };
    const { result } = renderHook(() => useContentSync(refresh, deps));
    await waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(1));
    await settle();
    expect(result.current.note).toBeNull();
    expect(storage.writes()).toBe(0);
  });

  it('a reload that throws is swallowed too', async () => {
    const storage = memoryStorage({ [A]: 1 });
    const target = fakeTarget();
    const fetchManifest = vi.fn<() => Promise<ManifestResult>>(() => Promise.resolve(manifestOf([[A, 2]])));
    const refresh = vi.fn<() => Promise<boolean>>(() => Promise.reject(new Error('boom')));
    const deps: ContentSyncDeps = { fetchManifest, storage, target };
    const { result } = renderHook(() => useContentSync(refresh, deps));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await settle();
    expect(result.current.note).toBeNull();
    expect(storage.writes()).toBe(0);
  });

  it('works without any storage: the first open is silent and nothing breaks', async () => {
    const target = fakeTarget();
    const fetchManifest = vi.fn<() => Promise<ManifestResult>>(() => Promise.resolve(manifestOf([[A, 1]])));
    const refresh = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
    const deps: ContentSyncDeps = { fetchManifest, storage: null, target };
    const { result } = renderHook(() => useContentSync(refresh, deps));
    await waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(1));
    await settle();
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.note).toBeNull();
  });
});

describe('useContentSync: the online event, one check at a time, cleaning up', () => {
  it('a check also runs when the app comes back online', async () => {
    const storage = memoryStorage({ [A]: 1 });
    const target = fakeTarget();
    const holder: { manifest: ManifestResult } = { manifest: manifestOf([[A, 1]]) };
    const fetchManifest = vi.fn<() => Promise<ManifestResult>>(() => Promise.resolve(holder.manifest));
    const refresh = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
    const deps: ContentSyncDeps = { fetchManifest, storage, target };
    const { result } = renderHook(() => useContentSync(refresh, deps));
    await waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(1));
    await settle();
    expect(result.current.note).toBeNull();

    holder.manifest = manifestOf([[A, 2]]);
    act(() => {
      target.fire();
    });
    await waitFor(() => expect(result.current.note).toEqual({ count: 1 }));
    expect(fetchManifest).toHaveBeenCalledTimes(2);
    expect(storage.stored()).toEqual({ [A]: 2 });
  });

  it('only one check runs at a time: an online event during a check is ignored', async () => {
    const storage = memoryStorage({ [A]: 1 });
    const target = fakeTarget();
    const open = gate<ManifestResult>();
    const fetchManifest = vi.fn<() => Promise<ManifestResult>>(() => open.promise);
    const refresh = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
    const deps: ContentSyncDeps = { fetchManifest, storage, target };
    renderHook(() => useContentSync(refresh, deps));
    await waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(1));

    act(() => {
      target.fire();
      target.fire();
    });
    expect(fetchManifest).toHaveBeenCalledTimes(1);

    open.release(manifestOf([[A, 1]]));
    await settle();
    act(() => {
      target.fire();
    });
    await waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(2));
  });

  it('Dismiss takes the note away', async () => {
    const { result } = setup({ seen: { [A]: 1 }, manifest: manifestOf([[A, 2]]) });
    await waitFor(() => expect(result.current.note).toEqual({ count: 1 }));
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.note).toBeNull();
  });

  it('leaving Home removes the online listener', async () => {
    const { unmount, target, fetchManifest } = setup({ seen: { [A]: 1 }, manifest: manifestOf([[A, 1]]) });
    await waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(1));
    expect(target.count()).toBe(1);
    unmount();
    expect(target.count()).toBe(0);
  });

  it('a check that ends after Home was left reloads nothing and stores nothing', async () => {
    const storage = memoryStorage({ [A]: 1 });
    const target = fakeTarget();
    const open = gate<ManifestResult>();
    const fetchManifest = vi.fn<() => Promise<ManifestResult>>(() => open.promise);
    const refresh = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
    const deps: ContentSyncDeps = { fetchManifest, storage, target };
    const { unmount } = renderHook(() => useContentSync(refresh, deps));
    await waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(1));
    unmount();
    open.release(manifestOf([[A, 2]]));
    await settle();
    expect(refresh).not.toHaveBeenCalled();
    expect(storage.writes()).toBe(0);
  });
});
