// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GithubOptions, ReadFileResult } from './github';
import { CONTENT_PREFIX, type CommitRequest, type CommitResult } from './githubWrite';
import { createCourseDraft, newTextBlock, type CourseDraft } from './model';
import { planPublish } from './publishPlan';
import { runPublish, runUnpublish, type PublishDeps, type PublishWorkStep } from './publishRun';

// P11 T6: after a `conflict` (the branch moved between planning and committing) the WHOLE run is done once more: the live manifest is read
// again and the plan is made again from it. A second conflict is returned as it is; every other code is returned at once. Fakes only.

const TOKEN = 'github_pat_SECRET_0123456789abcdef';
const T0 = '2026-11-23T09:00:00.000Z';
const NOW = '2026-11-23T10:00:00.000Z';
const SHA = 'c'.repeat(40);
const encoder = new TextEncoder();
const options: GithubOptions = { fetch: () => Promise.reject(new Error('the fake fetch is never called')) };
const CONFLICT: CommitResult = { ok: false, code: 'conflict' };
const GOOD: CommitResult = { ok: true, commitSha: SHA };

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
const FIRST_PUBLISH: ReadFileResult = { ok: false, code: 'not_found' };

interface Log {
  reads: string[];
  commits: CommitRequest[];
  steps: PublishWorkStep[];
}

/** Every read / commit gives the next scripted answer; the last answer is repeated when the script runs out. */
function setup(reads: ReadFileResult[], commits: CommitResult[]) {
  const log: Log = { reads: [], commits: [], steps: [] };
  const lastOf = <T,>(list: T[], index: number): T => {
    const item = list[Math.min(index, list.length - 1)];
    if (item === undefined) throw new Error('empty script');
    return item;
  };
  const deps: PublishDeps = {
    token: TOKEN,
    options,
    now: () => NOW,
    onStep: (step) => {
      log.steps.push(step);
    },
    readFile: (_token, path) => {
      log.reads.push(path);
      return Promise.resolve(lastOf(reads, log.reads.length - 1));
    },
    commit: (_token, request) => {
      log.commits.push(request);
      return Promise.resolve(lastOf(commits, log.commits.length - 1));
    },
  };
  return { deps, log };
}

describe('runPublish: one retry after a conflict', () => {
  it('conflict, then success: the manifest is read twice, two commits, the second one wins', async () => {
    const { deps, log } = setup([FIRST_PUBLISH], [CONFLICT, GOOD]);
    const outcome = await runPublish(deps, makeDraft());
    expect(outcome).toEqual({ ok: true, unchanged: false, courseId: expect.any(String) as string, version: 1, commitSha: SHA });
    expect(log.reads).toEqual([`${CONTENT_PREFIX}manifest.json`, `${CONTENT_PREFIX}manifest.json`]);
    expect(log.commits).toHaveLength(2);
  });

  it('the second plan is made from the NEW manifest (the other device published meanwhile)', async () => {
    const draft = makeDraft();
    const moved = await liveTextOf(editedText(draft, 'Changed on the other device'));
    const { deps, log } = setup([FIRST_PUBLISH, fileOf(moved)], [CONFLICT, GOOD]);
    const outcome = await runPublish(deps, draft);
    expect(outcome.ok).toBe(true);
    expect(log.commits.map((c) => c.message)).toEqual(['Publish Gujarati basics (v1)', 'Publish Gujarati basics (v2)']);
  });

  it('the steps start again: checking, uploading, checking, uploading', async () => {
    const { deps, log } = setup([FIRST_PUBLISH], [CONFLICT, GOOD]);
    await runPublish(deps, makeDraft());
    expect(log.steps).toEqual(['checking', 'uploading', 'checking', 'uploading']);
  });

  it('conflict twice: the conflict is returned after exactly two tries, never a third', async () => {
    const { deps, log } = setup([FIRST_PUBLISH], [CONFLICT]);
    const outcome = await runPublish(deps, makeDraft());
    expect(outcome).toEqual({ ok: false, code: 'conflict', errors: [] });
    expect(log.reads).toHaveLength(2);
    expect(log.commits).toHaveLength(2);
  });

  it('every other commit code is returned at once, with ONE read and ONE commit', async () => {
    for (const code of ['rate_limited', 'forbidden', 'offline', 'too_large', 'bad_response'] as const) {
      const { deps, log } = setup([FIRST_PUBLISH], [{ ok: false, code }]);
      const outcome = await runPublish(deps, makeDraft());
      expect(outcome).toEqual({ ok: false, code, errors: [] });
      expect(log.reads).toHaveLength(1);
      expect(log.commits).toHaveLength(1);
    }
  });

  it('a problem while reading the manifest on the retry stops the run before the second commit', async () => {
    const { deps, log } = setup([FIRST_PUBLISH, { ok: false, code: 'offline' }], [CONFLICT, GOOD]);
    const outcome = await runPublish(deps, makeDraft());
    expect(outcome).toEqual({ ok: false, code: 'offline', errors: [] });
    expect(log.commits).toHaveLength(1);
  });

  it('when the other device published the very same files, the retry finds nothing to send', async () => {
    const draft = makeDraft();
    const same = await liveTextOf(draft);
    const { deps, log } = setup([FIRST_PUBLISH, fileOf(same)], [CONFLICT, GOOD]);
    const outcome = await runPublish(deps, draft);
    expect(outcome).toEqual({ ok: true, unchanged: true, courseId: draft.course.id, version: 1, commitSha: null });
    expect(log.commits).toHaveLength(1);
  });

  it('never forces: a commit request carries only branch, message, upserts and deletes, and the token is in no result', async () => {
    const { deps, log } = setup([FIRST_PUBLISH], [CONFLICT]);
    const outcome = await runPublish(deps, makeDraft());
    expect(log.commits.map((c) => Object.keys(c).sort())).toEqual([
      ['branch', 'deletes', 'message', 'upserts'],
      ['branch', 'deletes', 'message', 'upserts'],
    ]);
    expect(JSON.stringify(outcome)).not.toContain(TOKEN);
  });

  it('an invalid course is not retried and not even read', async () => {
    const { deps, log } = setup([FIRST_PUBLISH], [GOOD]);
    const outcome = await runPublish(deps, createCourseDraft({ title: '', order: 1 }));
    expect(outcome.ok).toBe(false);
    expect(log.reads).toHaveLength(0);
    expect(log.commits).toHaveLength(0);
  });
});

describe('runUnpublish: one retry after a conflict', () => {
  it('conflict, then success: two reads, two commits', async () => {
    const draft = makeDraft();
    const live = fileOf(await liveTextOf(draft));
    const { deps, log } = setup([live], [CONFLICT, GOOD]);
    const outcome = await runUnpublish(deps, { courseId: draft.course.id, title: draft.course.title });
    expect(outcome).toEqual({ ok: true, unchanged: false, courseId: draft.course.id, version: 1, commitSha: SHA });
    expect(log.reads).toHaveLength(2);
    expect(log.commits.map((c) => c.message)).toEqual(['Unpublish Gujarati basics', 'Unpublish Gujarati basics']);
  });

  it('conflict twice: the conflict is returned after exactly two commits', async () => {
    const draft = makeDraft();
    const live = fileOf(await liveTextOf(draft));
    const { deps, log } = setup([live], [CONFLICT]);
    const outcome = await runUnpublish(deps, { courseId: draft.course.id, title: draft.course.title });
    expect(outcome).toEqual({ ok: false, code: 'conflict', errors: [] });
    expect(log.commits).toHaveLength(2);
  });

  it('the other device already unpublished it: the retry says not_published and sends nothing more', async () => {
    const draft = makeDraft();
    const live = fileOf(await liveTextOf(draft));
    const gone = fileOf(await liveTextOf(makeDraft('Other course')));
    const { deps, log } = setup([live, gone], [CONFLICT, GOOD]);
    const outcome = await runUnpublish(deps, { courseId: draft.course.id, title: draft.course.title });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.code).toBe('not_published');
    expect(log.commits).toHaveLength(1);
  });
});
