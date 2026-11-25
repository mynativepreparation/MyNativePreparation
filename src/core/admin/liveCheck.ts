import { contentUrl } from '../content/loader';
import type { Manifest } from '../content/types';
import { validateManifest } from '../content/validate';

// The "Live now" check of the Publish flow (P11 T9, DECISIONS Q29). After a publish the commit is on GitHub, but the site
// (GitHub Pages) needs 1-3 minutes to show it. These functions ask the LIVE manifest until it shows the change.
// Framework-free: no React, no storage. Nothing here throws; every problem simply means "still waiting".

/** How often and for how long the live site is asked after a publish. */
export const LIVE_POLL = { intervalMs: 15_000, maxMs: 300_000 } as const;

/** What the live manifest must show: a course published at this version (or newer), or a course that is gone. */
export type LiveGoal =
  | { kind: 'published'; courseId: string; version: number }
  | { kind: 'removed'; courseId: string };

export type LiveAnswer = 'live' | 'waiting';
export type LiveResult = LiveAnswer | 'cancelled';

export interface LiveFetchInit {
  cache?: RequestCache;
  signal?: AbortSignal;
}
/** The part of `fetch` this file needs, so a test can hand in a fake. */
export type LiveFetch = (url: string, init?: LiveFetchInit) => Promise<Response>;

/** True when this manifest already shows the change. A NEWER version counts too: somebody may have published again. */
export function isGoalLive(manifest: Manifest, goal: LiveGoal): boolean {
  const course = manifest.courses.find((c) => c.id === goal.courseId);
  if (goal.kind === 'removed') return course === undefined;
  return course !== undefined && course.version >= goal.version;
}

/** URL of the live manifest with a cache-buster, so neither the browser nor the service worker answers from an old copy. */
export function liveManifestUrl(now: number): string {
  return `${contentUrl('manifest.json')}?t=${now}`;
}

export interface CheckLiveInput {
  goal: LiveGoal;
  /** The time in ms, only used for the cache-buster. */
  now: number;
  fetchImpl?: LiveFetch;
  signal?: AbortSignal;
}

/** Asks the live manifest ONCE. A network error, an error status, a web page instead of JSON, bad JSON, an invalid manifest or a goal not reached all mean `waiting`. */
export async function checkLiveOnce(input: CheckLiveInput): Promise<LiveAnswer> {
  try {
    const doFetch: LiveFetch = input.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
    const init: LiveFetchInit = { cache: 'no-store', ...(input.signal !== undefined ? { signal: input.signal } : {}) };
    const response = await doFetch(liveManifestUrl(input.now), init);
    if (!response.ok) return 'waiting';
    // A host may answer a missing file with index.html and status 200.
    if ((response.headers.get('content-type') ?? '').includes('text/html')) return 'waiting';
    const parsed = validateManifest((await response.json()) as unknown);
    return parsed.ok && isGoalLive(parsed.value, input.goal) ? 'live' : 'waiting';
  } catch {
    return 'waiting';
  }
}

export interface WaitInput {
  goal: LiveGoal;
  fetchImpl?: LiveFetch;
  /** Waits `ms`; must end early when `signal` is aborted. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  maxMs?: number;
  signal?: AbortSignal;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/**
 * Checks at once, then every `intervalMs`, until the goal is live (`live`), the time `maxMs` is used up (`waiting`),
 * or `signal` is aborted (`cancelled`, also while it sleeps or while a check is running).
 * The time is counted with the sleeps themselves, so a test with a fake `sleep` never really waits.
 * With the defaults that is one check at once plus 20 more, 15 s apart.
 */
export async function waitUntilLive(input: WaitInput): Promise<LiveResult> {
  const sleep = input.sleep ?? defaultSleep;
  const now = input.now ?? Date.now;
  const step = input.intervalMs !== undefined && input.intervalMs > 0 ? input.intervalMs : LIVE_POLL.intervalMs;
  const maxMs = input.maxMs ?? LIVE_POLL.maxMs;
  const { signal } = input;

  let waited = 0;
  for (;;) {
    if (signal?.aborted) return 'cancelled';
    const answer = await checkLiveOnce({
      goal: input.goal,
      now: now(),
      ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
      ...(signal !== undefined ? { signal } : {}),
    });
    if (signal?.aborted) return 'cancelled';
    if (answer === 'live') return 'live';
    if (waited + step > maxMs) return 'waiting';
    await sleep(step, signal);
    waited += step;
  }
}
