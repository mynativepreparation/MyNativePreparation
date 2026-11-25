import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GithubFetch } from '../../core/admin/github';
import { createCourseDraft } from '../../core/admin/model';
import type { PublishDeps, PublishErrorCode, PublishOutcome } from '../../core/admin/publishRun';
import { usePublish, type PublishRuns, type PublishState } from './usePublish';

// The hook is tested with fake runs (the real run is tested in core/admin/publishRun.test.ts), so these tests are about what the screen
// sees: the steps, the result, the error codes, the busy guard and the token never showing up in the state.

const TOKEN = 'github_pat_SECRET_0123456789abcdef';
const NOW = '2026-11-23T10:00:00.000Z';
const SHA = 'a'.repeat(40);
const now = (): string => NOW;
const fetchImpl: GithubFetch = () => Promise.reject(new Error('the fake fetch is never called'));
const draft = createCourseDraft({ title: 'Gujarati basics', order: 1 });
const COURSE_ID = draft.course.id;

const published: PublishOutcome = { ok: true, unchanged: false, courseId: COURSE_ID, version: 2, commitSha: SHA };

interface Recorded {
  kind: 'publish' | 'unpublish';
  deps: PublishDeps;
  arg: unknown;
}

/** Fake runs: both call `impl` and write down what they were given. */
function fakeRuns(impl: (deps: PublishDeps) => Promise<PublishOutcome>) {
  const calls: Recorded[] = [];
  const runs: PublishRuns = {
    publish: (deps, given) => {
      calls.push({ kind: 'publish', deps, arg: given });
      return impl(deps);
    },
    unpublish: (deps, given) => {
      calls.push({ kind: 'unpublish', deps, arg: given });
      return impl(deps);
    },
  };
  return { calls, runs };
}

const answer = (outcome: PublishOutcome) => fakeRuns(() => Promise.resolve(outcome));

function setup(runs: PublishRuns, tokenOf: () => string | null = () => TOKEN) {
  return renderHook(() => usePublish({ fetchImpl, now, tokenOf, runs }));
}

type Hook = ReturnType<typeof setup>;

const stateOf = (hook: Hook): PublishState => hook.result.current.state;

/** A promise the test opens by hand, so a run can be held in the middle. */
function gate() {
  const box: { open: () => void } = { open: () => undefined };
  const wait = new Promise<void>((resolve) => {
    box.open = resolve;
  });
  return { wait, open: () => box.open() };
}

const flush = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function publishAndWait(hook: Hook): Promise<void> {
  await act(async () => {
    await hook.result.current.publish(draft);
  });
}

describe('usePublish: the steps and the result', () => {
  it('publish shows checking, then uploading, then the result', async () => {
    const first = gate();
    const second = gate();
    const { calls, runs } = fakeRuns(async (deps) => {
      deps.onStep?.('checking');
      await first.wait;
      deps.onStep?.('uploading');
      await second.wait;
      return published;
    });
    const hook = setup(runs);
    expect(stateOf(hook)).toEqual({ phase: 'idle' });
    expect(hook.result.current.busy).toBe(false);

    const started: Promise<void>[] = [];
    act(() => {
      started.push(hook.result.current.publish(draft));
    });
    expect(stateOf(hook)).toEqual({ phase: 'working', kind: 'publish', courseId: COURSE_ID, step: 'checking' });
    expect(hook.result.current.busy).toBe(true);
    expect(JSON.stringify(stateOf(hook))).not.toContain(TOKEN);

    await act(async () => {
      first.open();
      await flush();
    });
    expect(stateOf(hook)).toEqual({ phase: 'working', kind: 'publish', courseId: COURSE_ID, step: 'uploading' });
    expect(JSON.stringify(stateOf(hook))).not.toContain(TOKEN);

    await act(async () => {
      second.open();
      await Promise.all(started);
    });
    expect(stateOf(hook)).toEqual({
      phase: 'done',
      kind: 'publish',
      courseId: COURSE_ID,
      unchanged: false,
      version: 2,
      commitSha: SHA,
    });
    expect(hook.result.current.busy).toBe(false);
    expect(JSON.stringify(stateOf(hook))).not.toContain(TOKEN);

    // What the run was given: the draft, the token of the session, the clock and the injected fetch.
    expect(calls.map((c) => c.kind)).toEqual(['publish']);
    expect(calls.map((c) => c.arg)).toEqual([draft]);
    expect(calls.map((c) => c.deps.token)).toEqual([TOKEN]);
    expect(calls.map((c) => c.deps.now())).toEqual([NOW]);
    expect(calls.map((c) => c.deps.options.fetch === fetchImpl)).toEqual([true]);
  });

  it('unpublish gives the course id and title to the run and ends with the version that was live', async () => {
    const { calls, runs } = answer({ ok: true, unchanged: false, courseId: 'crs-old', version: 4, commitSha: SHA });
    const hook = setup(runs);
    await act(async () => {
      await hook.result.current.unpublish({ courseId: 'crs-old', title: 'Old course' });
    });
    expect(calls.map((c) => c.kind)).toEqual(['unpublish']);
    expect(calls.map((c) => c.arg)).toEqual([{ courseId: 'crs-old', title: 'Old course' }]);
    expect(stateOf(hook)).toEqual({
      phase: 'done',
      kind: 'unpublish',
      courseId: 'crs-old',
      unchanged: false,
      version: 4,
      commitSha: SHA,
    });
  });

  it('an unchanged course ends as done with no commit id', async () => {
    const { runs } = answer({ ok: true, unchanged: true, courseId: COURSE_ID, version: 3, commitSha: null });
    const hook = setup(runs);
    await publishAndWait(hook);
    expect(stateOf(hook)).toEqual({
      phase: 'done',
      kind: 'publish',
      courseId: COURSE_ID,
      unchanged: true,
      version: 3,
      commitSha: null,
    });
  });
});

describe('usePublish: errors', () => {
  const CODES: PublishErrorCode[] = [
    'invalid',
    'too_large',
    'bad_manifest',
    'not_published',
    'conflict',
    'invalid_token',
    'unauthorized',
    'forbidden',
    'no_push_right',
    'rate_limited',
    'not_found',
    'offline',
    'timeout',
    'bad_response',
    'bad_path',
  ];

  it.each(CODES)('a failed run with the code %s ends as failed with the same code and the problems', async (code) => {
    const { runs } = answer({ ok: false, code, errors: ['Problem one', 'Problem two'] });
    const hook = setup(runs);
    await publishAndWait(hook);
    expect(stateOf(hook)).toEqual({
      phase: 'failed',
      kind: 'publish',
      courseId: COURSE_ID,
      code,
      errors: ['Problem one', 'Problem two'],
    });
    expect(hook.result.current.busy).toBe(false);
  });

  const NO_TOKEN: Array<string | null> = [null, ''];

  it.each(NO_TOKEN)('does not start without a token (%j): not_logged_in and the run is never called', async (value) => {
    const { calls, runs } = answer(published);
    const hook = setup(runs, () => value);
    await publishAndWait(hook);
    expect(calls).toEqual([]);
    expect(stateOf(hook)).toEqual({ phase: 'failed', kind: 'publish', courseId: COURSE_ID, code: 'not_logged_in', errors: [] });
    expect(hook.result.current.busy).toBe(false);
  });

  it('a run that throws ends as bad_response and its message is dropped (it could carry the token)', async () => {
    const { runs } = fakeRuns(() => Promise.reject(new Error(`boom ${TOKEN}`)));
    const hook = setup(runs);
    await publishAndWait(hook);
    expect(stateOf(hook)).toEqual({ phase: 'failed', kind: 'publish', courseId: COURSE_ID, code: 'bad_response', errors: [] });
    expect(JSON.stringify(stateOf(hook))).not.toContain(TOKEN);
    expect(hook.result.current.busy).toBe(false);
  });

  it('scrubs the token from an error text, as a last guard', async () => {
    const { runs } = answer({ ok: false, code: 'invalid', errors: [`Bad ${TOKEN} here`, 'Fine'] });
    const hook = setup(runs);
    await publishAndWait(hook);
    expect(stateOf(hook)).toEqual({
      phase: 'failed',
      kind: 'publish',
      courseId: COURSE_ID,
      code: 'invalid',
      errors: ['Bad *** here', 'Fine'],
    });
    expect(JSON.stringify(stateOf(hook))).not.toContain(TOKEN);
  });

  it('a new run after a failure starts clean and can succeed', async () => {
    let fail = true;
    const { runs } = fakeRuns(() =>
      Promise.resolve<PublishOutcome>(fail ? { ok: false, code: 'conflict', errors: [] } : published),
    );
    const hook = setup(runs);
    await publishAndWait(hook);
    expect(stateOf(hook)).toEqual({ phase: 'failed', kind: 'publish', courseId: COURSE_ID, code: 'conflict', errors: [] });
    fail = false;
    await publishAndWait(hook);
    expect(stateOf(hook).phase).toBe('done');
  });
});

describe('usePublish: busy guard, reset and unmount', () => {
  it('ignores more calls while a run is going, and takes calls again afterwards', async () => {
    const hold = gate();
    const { calls, runs } = fakeRuns(async () => {
      await hold.wait;
      return published;
    });
    const hook = setup(runs);
    const started: Promise<void>[] = [];
    act(() => {
      started.push(hook.result.current.publish(draft));
      started.push(hook.result.current.publish(draft));
      started.push(hook.result.current.unpublish({ courseId: COURSE_ID, title: 'Gujarati basics' }));
    });
    expect(calls.map((c) => c.kind)).toEqual(['publish']);

    await act(async () => {
      hold.open();
      await Promise.all(started);
    });
    expect(hook.result.current.busy).toBe(false);

    await publishAndWait(hook);
    expect(calls.map((c) => c.kind)).toEqual(['publish', 'publish']);
  });

  it('reset goes back to idle after a result, but not while a run is going', async () => {
    const hold = gate();
    const { runs } = fakeRuns(async () => {
      await hold.wait;
      return published;
    });
    const hook = setup(runs);
    const started: Promise<void>[] = [];
    act(() => {
      started.push(hook.result.current.publish(draft));
    });
    act(() => {
      hook.result.current.reset();
    });
    expect(stateOf(hook).phase).toBe('working');

    await act(async () => {
      hold.open();
      await Promise.all(started);
    });
    expect(stateOf(hook).phase).toBe('done');

    act(() => {
      hook.result.current.reset();
    });
    expect(stateOf(hook)).toEqual({ phase: 'idle' });
  });

  it('a run that ends after the screen is gone does not fail', async () => {
    const hold = gate();
    const { runs } = fakeRuns(async () => {
      await hold.wait;
      return published;
    });
    const hook = setup(runs);
    const started: Promise<void>[] = [];
    act(() => {
      started.push(hook.result.current.publish(draft));
    });
    hook.unmount();
    hold.open();
    await expect(Promise.all(started)).resolves.toEqual([undefined]);
  });
});
