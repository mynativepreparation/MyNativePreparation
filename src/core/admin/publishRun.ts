import { CONTENT_REPO } from './config';
import { readRepoFile, type GithubErrorCode, type GithubOptions } from './github';
import { commitFiles, CONTENT_PREFIX } from './githubWrite';
import { validateDraft, type CourseDraft } from './model';
import { planPublish, planUnpublish, type PublishPlan, type PublishPlanErrorCode } from './publishPlan';

// ONE publish run (P11 T5 step a): read the LIVE manifest from the repo -> plan -> commit. Framework-free and never throws.
// The React hook (`modules/admin/usePublish.ts`) only drives this and shows the steps. After a `conflict` the whole run is done once more (T6).
// - The live manifest is read through the GitHub API at the head of the content branch (not from the Pages site, which may lag behind).
//   A missing file (404) is a FIRST publish (`null`); every other problem stops the run BEFORE any plan, because planning without the
//   live manifest would drop the other courses from it.
// - The token is used only as an argument of the two GitHub calls. It is never put into a result, a message or a log.
// - `commitFiles` sends the files and then makes the commit in one call, so the run has two visible steps: checking and uploading.

export type PublishWorkStep = 'checking' | 'uploading';

/** Every reason a run can fail: a GitHub problem or a problem with the plan. The screen turns the code into a friendly text. */
export type PublishErrorCode = GithubErrorCode | PublishPlanErrorCode;

export type PublishOutcome =
  | {
      ok: true;
      /** True when everything was live already: nothing was sent and `commitSha` is null. */
      unchanged: boolean;
      courseId: string;
      /** The version of the course that is live now (Unpublish: the version that was live). */
      version: number;
      commitSha: string | null;
    }
  | { ok: false; code: PublishErrorCode; errors: string[] };

export interface PublishDeps {
  token: string;
  options: GithubOptions;
  /** ISO time for the manifest's `generatedAt`. */
  now: () => string;
  onStep?: (step: PublishWorkStep) => void;
  /** Tests replace these two; the app uses the real GitHub calls. */
  readFile?: typeof readRepoFile;
  commit?: typeof commitFiles;
}

type LiveResult = { ok: true; manifest: unknown } | { ok: false; code: PublishErrorCode };

const failed = (code: PublishErrorCode, errors: string[] = []): PublishOutcome => ({ ok: false, code, errors });

/** A one-line, short name for the commit message. */
const nameOf = (title: string, id: string): string => {
  const line = title.replace(/\s+/g, ' ').trim();
  return (line === '' ? id : line).slice(0, 80);
};

async function readLiveManifest(deps: PublishDeps): Promise<LiveResult> {
  const read = deps.readFile ?? readRepoFile;
  const file = await read(deps.token, `${CONTENT_PREFIX}manifest.json`, deps.options);
  if (file.ok) {
    try {
      return { ok: true, manifest: JSON.parse(file.text) as unknown };
    } catch {
      return { ok: false, code: 'bad_manifest' };
    }
  }
  if (file.code === 'not_found') return { ok: true, manifest: null };
  return { ok: false, code: file.code };
}

/** What one try gives back: an outcome, or `MOVED` = the commit found the branch moved (only THIS may be retried). */
const MOVED = Symbol('moved');
type Attempt = PublishOutcome | typeof MOVED;

async function commitPlan(deps: PublishDeps, plan: PublishPlan, message: string): Promise<Attempt> {
  deps.onStep?.('uploading');
  const commit = deps.commit ?? commitFiles;
  const result = await commit(
    deps.token,
    { branch: CONTENT_REPO.branch, message, upserts: plan.upserts, deletes: plan.deletes },
    deps.options,
  );
  if (!result.ok) return result.code === 'conflict' ? MOVED : failed(result.code);
  return { ok: true, unchanged: false, courseId: plan.courseId, version: plan.version, commitSha: result.commitSha };
}

/** How many times a run may go through read -> plan -> commit: the first try and ONE retry after a `conflict` (T6). */
const MAX_ATTEMPTS = 2;

/**
 * `MOVED` = the COMMIT found that the branch moved between planning and committing (the owner published on another device). Nothing was
 * changed, so the whole attempt is done again from the top: the live manifest is read again and the plan is made again from it. Never a
 * force push. Any other failure (a `conflict` from a read included) is returned at once; a second `MOVED` becomes the code `conflict`.
 */
async function withRetry(attempt: () => Promise<Attempt>): Promise<PublishOutcome> {
  for (let tried = 1; tried <= MAX_ATTEMPTS; tried += 1) {
    const outcome = await attempt();
    if (outcome !== MOVED) return outcome;
  }
  return failed('conflict');
}

/** Publishes (or updates) one course: the same check as Save, the live manifest, the plan, one commit (once more after a conflict). */
export async function runPublish(deps: PublishDeps, draft: CourseDraft): Promise<PublishOutcome> {
  try {
    const valid = validateDraft(draft);
    if (!valid.ok) return failed('invalid', valid.errors);

    return await withRetry(async () => {
      deps.onStep?.('checking');
      const live = await readLiveManifest(deps);
      if (!live.ok) return failed(live.code);

      const planned = await planPublish({ draft, remoteManifest: live.manifest, now: deps.now() });
      if (!planned.ok) return failed(planned.code, planned.errors);
      const plan = planned.plan;
      if (plan.unchanged) return { ok: true, unchanged: true, courseId: plan.courseId, version: plan.version, commitSha: null };

      return await commitPlan(deps, plan, `Publish ${nameOf(draft.course.title, draft.course.id)} (v${plan.version})`);
    });
  } catch {
    return failed('bad_response');
  }
}

/** Unpublishes one course: its files are deleted and its entry leaves the live manifest, in one commit (once more after a conflict). */
export async function runUnpublish(deps: PublishDeps, course: { courseId: string; title: string }): Promise<PublishOutcome> {
  try {
    return await withRetry(async () => {
      deps.onStep?.('checking');
      const live = await readLiveManifest(deps);
      if (!live.ok) return failed(live.code);

      const planned = planUnpublish({ courseId: course.courseId, remoteManifest: live.manifest, now: deps.now() });
      if (!planned.ok) return failed(planned.code, planned.errors);

      return await commitPlan(deps, planned.plan, `Unpublish ${nameOf(course.title, course.courseId)}`);
    });
  } catch {
    return failed('bad_response');
  }
}
