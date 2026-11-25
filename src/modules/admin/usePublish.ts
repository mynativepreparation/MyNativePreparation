import { useCallback, useEffect, useRef, useState } from 'react';
import type { GithubFetch } from '../../core/admin/github';
import type { CourseDraft } from '../../core/admin/model';
import {
  runPublish,
  runUnpublish,
  type PublishDeps,
  type PublishErrorCode,
  type PublishOutcome,
  type PublishWorkStep,
} from '../../core/admin/publishRun';
import { getToken } from './session';

// The Publish / Unpublish hook (P11 T5 step a). It drives ONE run of `core/admin/publishRun.ts` and keeps the small state the screen shows:
// idle -> working (checking, then uploading) -> done | failed. The Admin screens (step b) only read `state` and call `publish` / `unpublish`.
// - A second call while a run is going is ignored (a double tap must not make two commits). `busy` is for disabling the buttons.
// - The token is read from the in-memory admin session at the moment of the call and handed to the run. It is never put into the state,
//   an error text or a log: errors from the run are shown as codes, a thrown error is dropped, and any text that still contains the token
//   is scrubbed as a last guard.
// - Nothing is thrown to the screen. No token (not logged in) is the code `not_logged_in`.

export type PublishKind = 'publish' | 'unpublish';

/** Every reason a run can fail, as the screen sees it. */
export type PublishUiErrorCode = PublishErrorCode | 'not_logged_in';

export type PublishState =
  | { phase: 'idle' }
  | { phase: 'working'; kind: PublishKind; courseId: string; step: PublishWorkStep }
  | {
      phase: 'done';
      kind: PublishKind;
      courseId: string;
      /** True when everything was live already and nothing was sent (`commitSha` is null then). */
      unchanged: boolean;
      /** The version that is live after this run (Unpublish: the version that was live). */
      version: number;
      commitSha: string | null;
    }
  | { phase: 'failed'; kind: PublishKind; courseId: string; code: PublishUiErrorCode; errors: string[] };

/** The two runs; tests replace them, the app uses the real ones. */
export interface PublishRuns {
  publish: typeof runPublish;
  unpublish: typeof runUnpublish;
}

export interface UsePublishDeps {
  /** Tests pass a fake; the app uses the browser's fetch. */
  fetchImpl?: GithubFetch | undefined;
  /** ISO time for the manifest's `generatedAt`. */
  now?: (() => string) | undefined;
  /** Where the token comes from (the in-memory admin session). */
  tokenOf?: (() => string | null) | undefined;
  runs?: PublishRuns | undefined;
}

export interface UsePublish {
  state: PublishState;
  /** True while a run is going. */
  busy: boolean;
  publish: (draft: CourseDraft) => Promise<void>;
  unpublish: (course: { courseId: string; title: string }) => Promise<void>;
  /** Back to idle (clears a result or an error). Ignored while a run is going. */
  reset: () => void;
}

const IDLE: PublishState = { phase: 'idle' };
const REAL_RUNS: PublishRuns = { publish: runPublish, unpublish: runUnpublish };
const realFetch: GithubFetch = (url, init) => fetch(url, init);
const realNow = (): string => new Date().toISOString();

const scrub = (text: string, token: string): string => text.split(token).join('***');

async function attempt(work: () => Promise<PublishOutcome>): Promise<PublishOutcome> {
  try {
    return await work();
  } catch {
    // The message of a thrown error is not looked at: it could carry anything.
    return { ok: false, code: 'bad_response', errors: [] };
  }
}

function resultOf(kind: PublishKind, courseId: string, outcome: PublishOutcome, token: string): PublishState {
  if (outcome.ok) {
    return {
      phase: 'done',
      kind,
      courseId: outcome.courseId,
      unchanged: outcome.unchanged,
      version: outcome.version,
      commitSha: outcome.commitSha,
    };
  }
  return { phase: 'failed', kind, courseId, code: outcome.code, errors: outcome.errors.map((e) => scrub(e, token)) };
}

export function usePublish({
  fetchImpl = realFetch,
  now = realNow,
  tokenOf = getToken,
  runs = REAL_RUNS,
}: UsePublishDeps = {}): UsePublish {
  const [state, setState] = useState<PublishState>(IDLE);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const start = useCallback(
    async (
      kind: PublishKind,
      courseId: string,
      work: (run: PublishRuns, deps: PublishDeps) => Promise<PublishOutcome>,
    ): Promise<void> => {
      if (busyRef.current) return;
      const token = tokenOf();
      if (token === null || token === '') {
        setState({ phase: 'failed', kind, courseId, code: 'not_logged_in', errors: [] });
        return;
      }
      busyRef.current = true;
      const show = (next: PublishState): void => {
        if (aliveRef.current) setState(next);
      };
      show({ phase: 'working', kind, courseId, step: 'checking' });
      const deps: PublishDeps = {
        token,
        options: { fetch: fetchImpl },
        now,
        onStep: (step) => show({ phase: 'working', kind, courseId, step }),
      };
      const outcome = await attempt(() => work(runs, deps));
      busyRef.current = false;
      show(resultOf(kind, courseId, outcome, token));
    },
    [fetchImpl, now, runs, tokenOf],
  );

  const publish = useCallback(
    (draft: CourseDraft): Promise<void> => start('publish', draft.course.id, (run, deps) => run.publish(deps, draft)),
    [start],
  );

  const unpublish = useCallback(
    (course: { courseId: string; title: string }): Promise<void> =>
      start('unpublish', course.courseId, (run, deps) => run.unpublish(deps, course)),
    [start],
  );

  const reset = useCallback((): void => {
    if (!busyRef.current) setState(IDLE);
  }, []);

  return { state, busy: state.phase === 'working', publish, unpublish, reset };
}
