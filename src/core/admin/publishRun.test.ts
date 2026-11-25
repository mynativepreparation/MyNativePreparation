// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CONTENT_REPO } from './config';
import type { GithubErrorCode, GithubOptions, ReadFileResult } from './github';
import { CONTENT_PREFIX, type CommitRequest, type CommitResult } from './githubWrite';
import { createCourseDraft, newTextBlock, type CourseDraft } from './model';
import { planPublish } from './publishPlan';
import { runPublish, runUnpublish, type PublishDeps, type PublishWorkStep } from './publishRun';

// `runPublish` / `runUnpublish` are tested with a fake "read one repo file" and a fake "commit": no network. The point is the ORDER and the
// guards: the live manifest is read first, a missing file is a first publish, any other read problem stops before a commit, and the token
// is only an argument of the two calls.

const TOKEN = 'github_pat_SECRET_0123456789abcdef';
const T0 = '2026-11-23T09:00:00.000Z';
const NOW = '2026-11-23T10:00:00.000Z';
const SHA = 'b'.repeat(40);
const MANIFEST_PATH = `${CONTENT_PREFIX}manifest.json`;
const encoder = new TextEncoder();
const options: GithubOptions = { fetch: () => Promise.reject(new Error('the fake fetch is never called')) };

function makeDraft(title = 'Gujarati basics'): CourseDraft {
  const draft = createCourseDraft({ title, order: 1 });
  return {
    ...draft,
    overview: [newTextBlock('text', 'Overview text')],
    content: [newTextBlock('title', 'Chapter 1'), newTextBlock('text', 'Hello')],
  };
}

const editedText = (draft: CourseDraft, text: string): CourseDraft => ({
  ...draft,
  content: draft.content.map((b) => (b.type === 'text' ? { ...b, text } : b)),
});

/** The manifest.json text that is live after `draft` was published into an empty site. */
async function liveTextOf(draft: CourseDraft): Promise<string> {
  const planned = await planPublish({ draft, remoteManifest: null, now: T0 });
  if (!planned.ok) throw new Error(`fixture failed: ${planned.code}`);
  return planned.plan.manifestText;
}

const fileOf = (text: string): ReadFileResult => ({ ok: true, bytes: encoder.encode(text), text });
const noFile = (code: GithubErrorCode): ReadFileResult => ({ ok: false, code });

interface Log {
  reads: Array<{ token: string; path: string }>;
  commits: Array<{ token: string; request: CommitRequest }>;
  steps: PublishWorkStep[];
}

function setup(read: ReadFileResult, commitResult: CommitResult = { ok: true, commitSha: SHA }) {
  const log: Log = { reads: [], commits: [], steps: [] };
  const deps: PublishDeps = {
    token: TOKEN,
    options,
    now: () => NOW,
    onStep: (step) => {
      log.steps.push(step);
    },
    readFile: (token, path) => {
      log.reads.push({ token, path });
      return Promise.resolve(read);
    },
    commit: (token, request) => {
      log.commits.push({ token, request });
      return Promise.resolve(commitResult);
    },
  };
  return { deps, log };
}

const messagesOf = (log: Log): string[] => log.commits.map((c) => c.request.message);
const uploadPathsOf = (log: Log): string[][] => log.commits.map((c) => c.request.upserts.map((u) => u.path));

const READ_FAILURES: GithubErrorCode[] = [
  'invalid_token',
  'unauthorized',
  'forbidden',
  'no_push_right',
  'rate_limited',
  'offline',
  'timeout',
  'bad_response',
  'bad_path',
  'too_large',
  'conflict',
];

// `conflict` is not in this list: a commit that finds the branch moved is retried once (publishRun.retry.test.ts, P11 T6).
const COMMIT_FAILURES: GithubErrorCode[] = ['unauthorized', 'forbidden', 'no_push_right', 'rate_limited', 'offline', 'timeout', 'bad_response'];

describe('runPublish', () => {
  it('a missing manifest.json (404) is a first publish: one commit with the course files and manifest.json last', async () => {
    const draft = makeDraft();
    const { deps, log } = setup(noFile('not_found'));
    const out = await runPublish(deps, draft);

    expect(out).toEqual({ ok: true, unchanged: false, courseId: draft.course.id, version: 1, commitSha: SHA });
    expect(log.reads).toEqual([{ token: TOKEN, path: MANIFEST_PATH }]);
    expect(log.commits.map((c) => c.token)).toEqual([TOKEN]);
    expect(log.commits.map((c) => c.request.branch)).toEqual([CONTENT_REPO.branch]);
    expect(messagesOf(log)).toEqual(['Publish Gujarati basics (v1)']);
    expect(log.commits.map((c) => c.request.deletes)).toEqual([[]]);
    expect(uploadPathsOf(log).map((paths) => paths.slice(-1))).toEqual([[MANIFEST_PATH]]);
    expect(uploadPathsOf(log).map((paths) => paths.includes(`${CONTENT_PREFIX}courses/${draft.course.id}/course.json`))).toEqual([true]);
    expect(log.steps).toEqual(['checking', 'uploading']);
  });

  it('a changed course that is live already goes up as the next version', async () => {
    const draft = makeDraft();
    const { deps, log } = setup(fileOf(await liveTextOf(draft)));
    const out = await runPublish(deps, editedText(draft, 'Hello again'));

    expect(out).toEqual({ ok: true, unchanged: false, courseId: draft.course.id, version: 2, commitSha: SHA });
    expect(messagesOf(log)).toEqual(['Publish Gujarati basics (v2)']);
    expect(uploadPathsOf(log).map((paths) => paths.slice(-1))).toEqual([[MANIFEST_PATH]]);
  });

  it('a course that is live exactly as it is sends nothing: unchanged, no commit id, no upload step', async () => {
    const draft = makeDraft();
    const { deps, log } = setup(fileOf(await liveTextOf(draft)));
    const out = await runPublish(deps, draft);

    expect(out).toEqual({ ok: true, unchanged: true, courseId: draft.course.id, version: 1, commitSha: null });
    expect(log.commits).toEqual([]);
    expect(log.steps).toEqual(['checking']);
  });

  it('the commit message uses one short line of the title', async () => {
    const { deps, log } = setup(noFile('not_found'));
    await runPublish(deps, makeDraft('  Spaced   title  '));
    expect(messagesOf(log)).toEqual(['Publish Spaced title (v1)']);
  });

  it.each(READ_FAILURES)('a manifest download that fails with %s stops the run before any plan or commit', async (code) => {
    const { deps, log } = setup(noFile(code));
    const out = await runPublish(deps, makeDraft());

    expect(out).toEqual({ ok: false, code, errors: [] });
    expect(log.commits).toEqual([]);
    expect(log.steps).toEqual(['checking']);
  });

  it('a manifest.json that is not JSON stops the run with bad_manifest', async () => {
    const { deps, log } = setup(fileOf('this is not json'));
    const out = await runPublish(deps, makeDraft());

    expect(out).toEqual({ ok: false, code: 'bad_manifest', errors: [] });
    expect(log.commits).toEqual([]);
  });

  it('a draft that does not pass the Save check stops the run before anything is read', async () => {
    const { deps, log } = setup(noFile('not_found'));
    const out = await runPublish(deps, createCourseDraft());

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('invalid');
      expect(out.errors.join('\n')).toContain('title');
    }
    expect(log.reads).toEqual([]);
    expect(log.commits).toEqual([]);
    expect(log.steps).toEqual([]);
  });

  it.each(COMMIT_FAILURES)('a commit that fails with %s ends the run with the same code', async (code) => {
    const { deps, log } = setup(noFile('not_found'), { ok: false, code });
    const out = await runPublish(deps, makeDraft());

    expect(out).toEqual({ ok: false, code, errors: [] });
    expect(log.steps).toEqual(['checking', 'uploading']);
  });

  it('a call that throws ends as bad_response instead of throwing', async () => {
    const { deps } = setup(noFile('not_found'));
    const out = await runPublish(
      {
        ...deps,
        readFile: () => {
          throw new Error(`boom ${TOKEN}`);
        },
      },
      makeDraft(),
    );
    expect(out).toEqual({ ok: false, code: 'bad_response', errors: [] });
  });

  it('the token is only an argument of the two calls: it is in no result and in no request', async () => {
    const draft = makeDraft();
    const outcomes = [
      await runPublish(setup(noFile('not_found')).deps, draft),
      await runPublish(setup(noFile('unauthorized')).deps, draft),
      await runPublish(setup(fileOf('not json')).deps, draft),
      await runPublish(setup(noFile('not_found'), { ok: false, code: 'conflict' }).deps, draft),
    ];
    expect(JSON.stringify(outcomes)).not.toContain(TOKEN);

    const { deps, log } = setup(noFile('not_found'));
    await runPublish(deps, draft);
    expect(JSON.stringify(log.commits.map((c) => c.request))).not.toContain(TOKEN);
    expect(log.steps.join(',')).not.toContain(TOKEN);
  });
});

describe('runUnpublish', () => {
  it('deletes the files of the course and takes it out of manifest.json, in one commit', async () => {
    const draft = makeDraft();
    const { deps, log } = setup(fileOf(await liveTextOf(draft)));
    const out = await runUnpublish(deps, { courseId: draft.course.id, title: draft.course.title });

    expect(out).toEqual({ ok: true, unchanged: false, courseId: draft.course.id, version: 1, commitSha: SHA });
    expect(log.reads).toEqual([{ token: TOKEN, path: MANIFEST_PATH }]);
    expect(messagesOf(log)).toEqual(['Unpublish Gujarati basics']);
    expect(uploadPathsOf(log)).toEqual([[MANIFEST_PATH]]);
    const deletes = log.commits.flatMap((c) => c.request.deletes);
    expect(deletes.length).toBeGreaterThan(0);
    expect(deletes.every((p) => p.startsWith(`${CONTENT_PREFIX}courses/${draft.course.id}/`))).toBe(true);
    expect(log.steps).toEqual(['checking', 'uploading']);
  });

  it('a course that is not live is not_published, and nothing is committed', async () => {
    const other = makeDraft('Other course');
    const { deps, log } = setup(fileOf(await liveTextOf(other)));
    const out = await runUnpublish(deps, { courseId: 'crs-notthere', title: 'Not there' });

    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('not_published');
    expect(log.commits).toEqual([]);
  });

  it('a site with no manifest.json (404) has nothing to unpublish: not_published', async () => {
    const { deps, log } = setup(noFile('not_found'));
    const out = await runUnpublish(deps, { courseId: 'crs-notthere', title: 'Not there' });

    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('not_published');
    expect(log.commits).toEqual([]);
  });

  it.each(READ_FAILURES.filter((code) => code !== 'not_found'))('a manifest download that fails with %s stops before any commit', async (code) => {
    const { deps, log } = setup(noFile(code));
    const out = await runUnpublish(deps, { courseId: 'crs-abc', title: 'A course' });

    expect(out).toEqual({ ok: false, code, errors: [] });
    expect(log.commits).toEqual([]);
  });

  it('a commit that fails ends the run with the same code and keeps the token out of the result', async () => {
    const draft = makeDraft();
    const { deps } = setup(fileOf(await liveTextOf(draft)), { ok: false, code: 'conflict' });
    const out = await runUnpublish(deps, { courseId: draft.course.id, title: draft.course.title });

    expect(out).toEqual({ ok: false, code: 'conflict', errors: [] });
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });
});
