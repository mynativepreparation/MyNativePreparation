import { useEffect, useState } from 'react';
import { waitUntilLive, type LiveGoal } from '../../core/admin/liveCheck';
import type { PublishState } from './usePublish';

// The "Live now" hook of the Publish screens (P11 T9 step b). After a run that really sent something (`done`, not `unchanged`),
// it asks the live site until the change is there (`core/admin/liveCheck.ts`) and tells the screen: checking | live | waiting.
// - Every other state (idle, working, failed, nothing was sent) = `idle`: there is nothing to wait for.
// - The wait is aborted when the screen goes away and whenever the state changes (a new publish, Close). A late answer of an
//   old wait is never shown.
// - A cancelled wait sets nothing. Nothing here throws.

export type LiveStatus = 'idle' | 'checking' | 'live' | 'waiting';

export interface UseLiveCheckDeps {
  /** Tests hand in a fake; the app uses the real `waitUntilLive`. */
  wait?: typeof waitUntilLive | undefined;
}

function goalOf(state: PublishState): LiveGoal | null {
  if (state.phase !== 'done' || state.unchanged) return null;
  return state.kind === 'publish'
    ? { kind: 'published', courseId: state.courseId, version: state.version }
    : { kind: 'removed', courseId: state.courseId };
}

/** The same goal gives the same key, so a new state object on every render does not restart the wait. */
function keyOf(goal: LiveGoal | null): string | null {
  if (goal === null) return null;
  return goal.kind === 'published' ? `published:${goal.courseId}:${goal.version}` : `removed:${goal.courseId}`;
}

export function useLiveCheck(state: PublishState, { wait = waitUntilLive }: UseLiveCheckDeps = {}): LiveStatus {
  const goal = goalOf(state);
  const key = keyOf(goal);
  const [answer, setAnswer] = useState<{ key: string; value: 'live' | 'waiting' } | null>(null);

  useEffect(() => {
    if (goal === null || key === null) return undefined;
    const controller = new AbortController();
    void wait({ goal, signal: controller.signal }).then((result) => {
      if (result === 'cancelled' || controller.signal.aborted) return;
      setAnswer({ key, value: result });
    });
    return () => {
      controller.abort();
      setAnswer(null);
    };
    // `goal` is rebuilt on every render; `key` says when it really changed.
  }, [key, wait]);

  if (key === null) return 'idle';
  return answer !== null && answer.key === key ? answer.value : 'checking';
}
