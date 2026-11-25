import { useCallback, useEffect, useRef, useState } from 'react';
import { loadManifest, type ManifestResult } from '../../core/content/loader';
import { checkContent, readSeen, writeSeen } from '../../core/content/sync';

// "New or updated courses" on Home (P11 T8 step c). When Home opens, and every time the browser says it is back online, the live
// manifest is compared with the versions the app saw last (core/content/sync.ts). If something changed, the course list is loaded
// again (`refresh`, no skeleton) and a calm note says how many courses are new or updated; the memory is stored only AFTER the list
// was reloaded, so a failed reload is announced again next time. The first open is silent (the versions are just stored).
// A check never blocks the screen, never shows an error, and only one runs at a time.

export interface ContentNote {
  /** Courses that are new or have a new version. */
  count: number;
}

export interface ContentSyncDeps {
  /** Default: `loadManifest`. */
  fetchManifest?: () => Promise<ManifestResult>;
  /** Default: `localStorage` (or `null` when the browser does not give it). */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Where the `online` event comes from. Default: `window`. */
  target?: {
    addEventListener(type: 'online', listener: () => void): void;
    removeEventListener(type: 'online', listener: () => void): void;
  };
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * `refresh` loads the course list again and answers whether the new list arrived (`useCourses().refresh`).
 * Pass stable `deps` (the app passes none): a new `fetchManifest`, `storage` or `target` starts the check again.
 */
export function useContentSync(refresh: () => Promise<boolean>, deps: ContentSyncDeps = {}): { note: ContentNote | null; dismiss: () => void } {
  const [note, setNote] = useState<ContentNote | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  const { fetchManifest, storage, target } = deps;

  useEffect(() => {
    alive.current = true;
    const store = storage === undefined ? defaultStorage() : storage;
    // Looked up when called, so a missing loader never breaks the screen.
    const source = fetchManifest ?? (() => loadManifest());
    const events = target ?? window;

    async function run() {
      if (running.current) return;
      running.current = true;
      try {
        const seen = readSeen(store);
        const check = await checkContent({ fetchManifest: source, seen });
        if (!alive.current || check.status === 'unavailable') return;
        if (check.status === 'changed') {
          const reloaded = await refresh();
          if (!alive.current || !reloaded) return;
          const count = check.added.length + check.changed.length;
          if (count > 0) setNote({ count });
          writeSeen(store, check.current);
        } else if (seen === null) {
          // The first open: remember the versions without a word.
          writeSeen(store, check.current);
        }
      } catch {
        // The check is a courtesy: whatever goes wrong, the screen stays as it is.
      } finally {
        running.current = false;
      }
    }

    const onOnline = () => {
      void run();
    };
    void run();
    events.addEventListener('online', onOnline);
    return () => {
      alive.current = false;
      events.removeEventListener('online', onOnline);
    };
  }, [fetchManifest, storage, target, refresh]);

  const dismiss = useCallback(() => {
    setNote(null);
  }, []);

  return { note, dismiss };
}
