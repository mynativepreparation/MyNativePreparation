import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LiveGoal, waitUntilLive } from '../../core/admin/liveCheck';
import { useLiveCheck } from './useLiveCheck';
import type { PublishState } from './usePublish';

// The "Live now" hook (P11 T9 step b). The live check itself (core/admin/liveCheck.ts) is faked: every call of `wait` is kept in `runs`
// and stays open until the test releases it, so each test decides when and how the check ends. The real network is never touched.

type Wait = typeof waitUntilLive;
type Answer = Awaited<ReturnType<Wait>>;

const A = 'crs-aaaaaaaa';
const B = 'crs-bbbbbbbb';

const IDLE: PublishState = { phase: 'idle' };
const WORKING: PublishState = { phase: 'working', kind: 'publish', courseId: A, step: 'uploading' };
const FAILED: PublishState = { phase: 'failed', kind: 'publish', courseId: A, code: 'conflict', errors: [] };
const NOTHING_SENT: PublishState = { phase: 'done', kind: 'publish', courseId: A, unchanged: true, version: 3, commitSha: null };

const published = (courseId: string, version: number): PublishState => ({
  phase: 'done',
  kind: 'publish',
  courseId,
  unchanged: false,
  version,
  commitSha: 'abcdef1234567',
});
const unpublished = (courseId: string): PublishState => ({
  phase: 'done',
  kind: 'unpublish',
  courseId,
  unchanged: false,
  version: 2,
  commitSha: '1234567abcdef',
});

interface Run {
  goal: LiveGoal;
  signal: AbortSignal | undefined;
  release: (answer: Answer) => void;
}

/** A fake `waitUntilLive`: each call is written down and stays open until `release` is called on it. */
function fakeWait() {
  const runs: Run[] = [];
  const wait = vi.fn<Wait>((options) => {
    const holder: { release: (answer: Answer) => void } = { release: () => undefined };
    const promise = new Promise<Answer>((resolve) => {
      holder.release = resolve;
    });
    runs.push({ goal: options.goal, signal: options.signal, release: (answer) => holder.release(answer) });
    return promise;
  });
  const run = (index: number): Run => {
    const found = runs.at(index);
    if (found === undefined) throw new Error(`no wait #${index} was started`);
    return found;
  };
  return { wait, runs, run };
}

function setup(initial: PublishState) {
  const fake = fakeWait();
  const hook = renderHook(({ state }: { state: PublishState }) => useLiveCheck(state, { wait: fake.wait }), {
    initialProps: { state: initial },
  });
  return { ...fake, ...hook };
}

const finish = (run: Run, answer: Answer) =>
  act(async () => {
    run.release(answer);
  });

describe('useLiveCheck', () => {
  it('a publish that sent something: checking, then live', async () => {
    const { result, runs, run } = setup(published(A, 3));
    expect(result.current).toBe('checking');
    expect(runs.map((r) => r.goal)).toEqual([{ kind: 'published', courseId: A, version: 3 }]);
    await finish(run(0), 'live');
    expect(result.current).toBe('live');
  });

  it('the site is still not updated after the wait: waiting', async () => {
    const { result, run } = setup(published(A, 3));
    await finish(run(0), 'waiting');
    expect(result.current).toBe('waiting');
  });

  it('a cancelled answer sets nothing', async () => {
    const { result, run } = setup(published(A, 3));
    await finish(run(0), 'cancelled');
    expect(result.current).toBe('checking');
  });

  it('an unpublish waits for the removed goal', async () => {
    const { result, runs, run } = setup(unpublished(B));
    expect(result.current).toBe('checking');
    expect(runs.map((r) => r.goal)).toEqual([{ kind: 'removed', courseId: B }]);
    await finish(run(0), 'live');
    expect(result.current).toBe('live');
  });

  const NO_WAIT_CASES: Array<[string, PublishState]> = [
    ['idle', IDLE],
    ['working', WORKING],
    ['failed', FAILED],
    ['done but nothing was sent', NOTHING_SENT],
  ];

  it.each(NO_WAIT_CASES)('%s = idle and no wait is started', (_name, state) => {
    const { result, wait } = setup(state);
    expect(result.current).toBe('idle');
    expect(wait).not.toHaveBeenCalled();
  });

  it('the wait is aborted when the screen goes away, and a late answer sets nothing', async () => {
    const { runs, run, unmount } = setup(published(A, 3));
    expect(runs.map((r) => r.signal?.aborted)).toEqual([false]);
    unmount();
    expect(runs.map((r) => r.signal?.aborted)).toEqual([true]);
    await finish(run(0), 'live');
    expect(runs).toHaveLength(1);
  });

  it('a new publish aborts the old wait and its late answer is ignored', async () => {
    const { result, rerender, runs, run } = setup(published(A, 3));
    rerender({ state: published(A, 4) });
    expect(runs.map((r) => r.goal)).toEqual([
      { kind: 'published', courseId: A, version: 3 },
      { kind: 'published', courseId: A, version: 4 },
    ]);
    expect(runs.map((r) => r.signal?.aborted)).toEqual([true, false]);
    await finish(run(0), 'live');
    expect(result.current).toBe('checking');
    await finish(run(1), 'waiting');
    expect(result.current).toBe('waiting');
  });

  it('the answer of a finished check is dropped when the next publish starts', async () => {
    const { result, rerender, run } = setup(published(A, 3));
    await finish(run(0), 'live');
    expect(result.current).toBe('live');
    rerender({ state: WORKING });
    expect(result.current).toBe('idle');
    rerender({ state: published(A, 4) });
    expect(result.current).toBe('checking');
  });

  it('Close (back to idle) aborts the wait and shows nothing', async () => {
    const { result, rerender, runs, run } = setup(published(A, 3));
    rerender({ state: IDLE });
    expect(result.current).toBe('idle');
    expect(runs.map((r) => r.signal?.aborted)).toEqual([true]);
    await finish(run(0), 'live');
    expect(result.current).toBe('idle');
  });

  it('the same goal in a new state object does not restart the wait', () => {
    const { result, rerender, wait, runs } = setup(published(A, 3));
    rerender({ state: published(A, 3) });
    expect(result.current).toBe('checking');
    expect(wait).toHaveBeenCalledTimes(1);
    expect(runs.map((r) => r.signal?.aborted)).toEqual([false]);
  });
});
