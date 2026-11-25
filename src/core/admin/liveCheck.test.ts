// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentUrl } from '../content/loader';
import type { Manifest } from '../content/types';
import {
  LIVE_POLL,
  checkLiveOnce,
  isGoalLive,
  liveManifestUrl,
  waitUntilLive,
  type LiveFetch,
  type LiveGoal,
} from './liveCheck';

const COURSE = 'crs-aaaa1111';
const OTHER = 'crs-bbbb2222';
const JSON_HEADERS = { 'content-type': 'application/json' };
const GOAL: LiveGoal = { kind: 'published', courseId: COURSE, version: 2 };

function manifestOf(courses: { id: string; version: number }[]): Manifest {
  return {
    schemaVersion: 1,
    generatedAt: '2026-11-23T10:00:00.000Z',
    courses: courses.map((c) => ({ id: c.id, title: 'A course', version: c.version, files: {} })),
  };
}

function jsonAnswer(manifest: Manifest): Response {
  return new Response(JSON.stringify(manifest), { status: 200, headers: JSON_HEADERS });
}

const LIVE = (): Response => jsonAnswer(manifestOf([{ id: COURSE, version: 2 }]));
const OLD = (): Response => jsonAnswer(manifestOf([{ id: COURSE, version: 1 }]));

/** A fake site that shows the new version from the n-th question on. */
function siteLiveFrom(n: number) {
  let calls = 0;
  return vi.fn<LiveFetch>(async () => {
    calls += 1;
    return calls >= n ? LIVE() : OLD();
  });
}

/** Like `siteLiveFrom` but with a plain object answer: it needs microtasks only, so the fake-timer tests stay exact. */
function plainSiteLiveFrom(n: number) {
  let calls = 0;
  return vi.fn<LiveFetch>(async () => {
    calls += 1;
    const manifest = manifestOf([{ id: COURSE, version: calls >= n ? 2 : 1 }]);
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => manifest } as unknown as Response;
  });
}

function fakeSleep() {
  const waits: number[] = [];
  const sleep = vi.fn<(ms: number, signal?: AbortSignal) => Promise<void>>(async (ms) => {
    waits.push(ms);
  });
  return { sleep, waits };
}

const once = (fetchImpl: LiveFetch, goal: LiveGoal = GOAL) => checkLiveOnce({ goal, now: 1, fetchImpl });

describe('isGoalLive', () => {
  it('published: the same version is live', () => {
    expect(isGoalLive(manifestOf([{ id: COURSE, version: 2 }]), GOAL)).toBe(true);
  });

  it('published: a newer version is live too (somebody published again)', () => {
    expect(isGoalLive(manifestOf([{ id: COURSE, version: 5 }]), GOAL)).toBe(true);
  });

  it('published: an older version is not live yet', () => {
    expect(isGoalLive(manifestOf([{ id: COURSE, version: 1 }]), GOAL)).toBe(false);
  });

  it('published: a missing course is not live', () => {
    expect(isGoalLive(manifestOf([]), GOAL)).toBe(false);
  });

  it('published: another course does not count', () => {
    expect(isGoalLive(manifestOf([{ id: OTHER, version: 9 }]), GOAL)).toBe(false);
  });

  it('removed: live when the course is gone, waiting while it is still listed', () => {
    const removed: LiveGoal = { kind: 'removed', courseId: COURSE };
    expect(isGoalLive(manifestOf([{ id: OTHER, version: 1 }]), removed)).toBe(true);
    expect(isGoalLive(manifestOf([{ id: COURSE, version: 1 }]), removed)).toBe(false);
  });
});

describe('liveManifestUrl', () => {
  it('is the content manifest URL plus a cache-buster', () => {
    expect(liveManifestUrl(123)).toBe(`${contentUrl('manifest.json')}?t=123`);
    expect(liveManifestUrl(123).endsWith('manifest.json?t=123')).toBe(true);
  });
});

describe('checkLiveOnce', () => {
  it('is live when the manifest shows the goal', async () => {
    expect(await once(async () => LIVE())).toBe('live');
  });

  it('is waiting while the manifest still shows the old version', async () => {
    expect(await once(async () => OLD())).toBe('waiting');
  });

  it('is waiting on a 404', async () => {
    expect(await once(async () => new Response('', { status: 404 }))).toBe('waiting');
  });

  it('is waiting on a network error', async () => {
    expect(await once(() => Promise.reject(new TypeError('network')))).toBe('waiting');
  });

  it('is waiting when the host answers with a web page', async () => {
    const page = async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    expect(await once(page)).toBe('waiting');
  });

  it('is waiting on bad JSON', async () => {
    expect(await once(async () => new Response('not json', { status: 200, headers: JSON_HEADERS }))).toBe('waiting');
  });

  it('is waiting on a manifest that fails the validator', async () => {
    const invalid = async () => new Response(JSON.stringify({ schemaVersion: 9, courses: [] }), { status: 200, headers: JSON_HEADERS });
    expect(await once(invalid)).toBe('waiting');
  });

  it('does not throw when fetch itself throws', async () => {
    expect(
      await once(() => {
        throw new Error('boom');
      }),
    ).toBe('waiting');
  });

  it('sends the cache-buster in the URL and the no-store option', async () => {
    const fetchImpl = vi.fn<LiveFetch>(async () => LIVE());
    await checkLiveOnce({ goal: GOAL, now: 12345, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls.map(([url, init]) => [url.endsWith('manifest.json?t=12345'), init?.cache])).toEqual([[true, 'no-store']]);
  });

  it('hands the abort signal to fetch', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<LiveFetch>(async () => LIVE());
    await checkLiveOnce({ goal: GOAL, now: 1, fetchImpl, signal: controller.signal });
    expect(fetchImpl.mock.calls.map(([, init]) => init?.signal === controller.signal)).toEqual([true]);
  });

  it('works for a removed goal', async () => {
    const removed: LiveGoal = { kind: 'removed', courseId: COURSE };
    expect(await once(async () => jsonAnswer(manifestOf([])), removed)).toBe('live');
    expect(await once(async () => OLD(), removed)).toBe('waiting');
  });
});

describe('waitUntilLive', () => {
  it('asks only once when the site is live at once', async () => {
    const fetchImpl = siteLiveFrom(1);
    const { sleep, waits } = fakeSleep();
    expect(await waitUntilLive({ goal: GOAL, fetchImpl, sleep })).toBe('live');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('is live on the third check: 3 questions, 2 sleeps of one interval', async () => {
    const fetchImpl = siteLiveFrom(3);
    const { sleep, waits } = fakeSleep();
    const result = await waitUntilLive({ goal: GOAL, fetchImpl, sleep, intervalMs: 1000, maxMs: 60_000 });
    expect(result).toBe('live');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 1000]);
  });

  it('answers waiting when the time is used up: with the defaults 1 + 20 checks, 15 s apart', async () => {
    const fetchImpl = siteLiveFrom(Number.POSITIVE_INFINITY);
    const { sleep, waits } = fakeSleep();
    const checks = Math.floor(LIVE_POLL.maxMs / LIVE_POLL.intervalMs) + 1;
    expect(await waitUntilLive({ goal: GOAL, fetchImpl, sleep })).toBe('waiting');
    expect(fetchImpl).toHaveBeenCalledTimes(checks);
    expect(waits).toHaveLength(checks - 1);
    expect(waits.every((ms) => ms === LIVE_POLL.intervalMs)).toBe(true);
  });

  it('counts the time with its own sleeps: maxMs 2500 and intervalMs 1000 give 3 checks', async () => {
    const fetchImpl = siteLiveFrom(Number.POSITIVE_INFINITY);
    const { sleep } = fakeSleep();
    expect(await waitUntilLive({ goal: GOAL, fetchImpl, sleep, intervalMs: 1000, maxMs: 2500 })).toBe('waiting');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('falls back to the default interval when intervalMs is not positive (no endless fast loop)', async () => {
    const fetchImpl = siteLiveFrom(Number.POSITIVE_INFINITY);
    const { sleep, waits } = fakeSleep();
    await waitUntilLive({ goal: GOAL, fetchImpl, sleep, intervalMs: 0 });
    expect(waits.every((ms) => ms === LIVE_POLL.intervalMs)).toBe(true);
  });

  it('answers cancelled at once when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = siteLiveFrom(1);
    expect(await waitUntilLive({ goal: GOAL, fetchImpl, signal: controller.signal })).toBe('cancelled');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers cancelled when it is aborted while it sleeps', async () => {
    const controller = new AbortController();
    const fetchImpl = siteLiveFrom(Number.POSITIVE_INFINITY);
    const sleep = vi.fn<(ms: number, signal?: AbortSignal) => Promise<void>>(async () => {
      controller.abort();
    });
    expect(await waitUntilLive({ goal: GOAL, fetchImpl, sleep, signal: controller.signal })).toBe('cancelled');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('answers cancelled when it is aborted during a check, even if that check was live', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<LiveFetch>(async () => {
      controller.abort();
      return LIVE();
    });
    expect(await waitUntilLive({ goal: GOAL, fetchImpl, signal: controller.signal })).toBe('cancelled');
  });

  it('uses the injected clock for the cache-buster of every check', async () => {
    const fetchImpl = siteLiveFrom(Number.POSITIVE_INFINITY);
    const { sleep } = fakeSleep();
    let clock = 1000;
    const now = () => (clock += 10);
    await waitUntilLive({ goal: GOAL, fetchImpl, sleep, now, intervalMs: 1000, maxMs: 2000 });
    expect(fetchImpl.mock.calls.map(([url]) => url.split('?t=')[1])).toEqual(['1010', '1020', '1030']);
  });
});

describe('waitUntilLive with the default sleep (fake timers)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits one interval between the checks', async () => {
    vi.useFakeTimers();
    const fetchImpl = plainSiteLiveFrom(2);
    const pending = waitUntilLive({ goal: GOAL, fetchImpl, intervalMs: 1000, maxMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe('live');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('ends its timer at once when it is aborted', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchImpl = plainSiteLiveFrom(Number.POSITIVE_INFINITY);
    const pending = waitUntilLive({ goal: GOAL, fetchImpl, intervalMs: 60_000, signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    expect(await pending).toBe('cancelled');
    expect(vi.getTimerCount()).toBe(0);
  });
});
