import { isId } from './ids';
import type { ManifestResult } from './loader';

// "What is new on the server?" (P11 T8 step b). Framework-free and it never throws.
// The app remembers, for every course, the `version` it saw last (a version goes up whenever a file or the title of a course
// changes, so the version is enough: no hashes). `checkContent` compares that memory with the live manifest and says which courses
// were added, changed or removed. The caller stores the new memory with `writeSeen(current)` only AFTER it reloaded the course list,
// so a failed reload is announced again next time. The first open (nothing stored yet) is silent: the caller stores the versions it
// finds, so the first open never announces every course as new. What is stored: course ids and numbers only, no personal data.

/** Course id -> the `version` of that course the last time the app looked. */
export type SeenMap = Record<string, number>;

/** The localStorage key of the `SeenMap`. */
export const SEEN_KEY = 'np.content.seen';

export type ContentCheckStatus = 'unavailable' | 'unchanged' | 'changed';

export interface ContentCheck {
  /** `unavailable` = the manifest could not be read (offline, broken): say nothing and change nothing. */
  status: ContentCheckStatus;
  /** Ids that are in the manifest but not in the memory, in manifest order. */
  added: string[];
  /** Ids in both with a different version, in manifest order. */
  changed: string[];
  /** Ids that are in the memory but not in the manifest any more, in memory order. */
  removed: string[];
  /** What the memory should become after the list was reloaded (`seen ?? {}` while the status is `unavailable`). */
  current: SeenMap;
}

export interface CheckContentDeps {
  /** The app passes `loadManifest`. */
  fetchManifest: () => Promise<ManifestResult>;
  /** The stored memory, or `null` on the first open (or when it could not be read). */
  seen: SeenMap | null;
}

function has(map: SeenMap, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, id);
}

/**
 * Reads the memory. `null` = nothing usable (no storage, a storage that throws, nothing stored, bad JSON, not a plain object).
 * Entries with an id that is not a course id, or with a version that is not a positive whole number, are dropped.
 */
export function readSeen(storage: Pick<Storage, 'getItem'> | null): SeenMap | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const map: SeenMap = {};
  for (const [id, version] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isId('crs', id)) continue;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) continue;
    map[id] = version;
  }
  return map;
}

/** Stores the memory. `false` when there is no storage or it refused (full, private mode, blocked). */
export function writeSeen(storage: Pick<Storage, 'setItem'> | null, map: SeenMap): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(SEEN_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/** Compares the live manifest with the memory. Never writes anything and never throws. */
export async function checkContent({ fetchManifest, seen }: CheckContentDeps): Promise<ContentCheck> {
  let result: ManifestResult;
  try {
    result = await fetchManifest();
  } catch {
    return { status: 'unavailable', added: [], changed: [], removed: [], current: { ...(seen ?? {}) } };
  }
  if (!result.ok) {
    return { status: 'unavailable', added: [], changed: [], removed: [], current: { ...(seen ?? {}) } };
  }

  // The live versions, in manifest order (a repeated id counts once).
  const order: string[] = [];
  const current: SeenMap = {};
  for (const { id, version } of result.manifest.courses) {
    if (has(current, id)) continue;
    order.push(id);
    current[id] = version;
  }

  if (seen === null) return { status: 'unchanged', added: [], changed: [], removed: [], current };

  const added = order.filter((id) => !has(seen, id));
  const changed = order.filter((id) => has(seen, id) && seen[id] !== current[id]);
  const removed = Object.keys(seen).filter((id) => !has(current, id));
  const status: ContentCheckStatus = added.length > 0 || changed.length > 0 || removed.length > 0 ? 'changed' : 'unchanged';
  return { status, added, changed, removed, current };
}
