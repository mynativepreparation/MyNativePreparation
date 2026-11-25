import { isSafeRelativePath } from '../content/validate';
import {
  repoUrl,
  statusToCode,
  TOKEN_CHARS,
  type GithubError,
  type GithubOptions,
  type GithubRequestInit,
  type GithubResponse,
} from './github';

// WRITE client for the Admin Publish button (P11 T2, DECISIONS Q29): ONE commit made with the Git Data API.
// get ref -> get commit -> create blobs (base64, at most 4 at a time) -> create tree (base_tree) -> create commit
// -> update ref WITHOUT force. Same rules as `github.ts`:
// - `fetch` is injected (tests use a fake); nothing here throws: the result is `{ ok: true, ... }` or `{ ok: false, code }`.
// - The token is used ONLY in the Authorization header. It is never put into a URL, a body, a result, a code or a log.
// - Only safe paths under `public/content/` can be written or deleted.

export const CONTENT_PREFIX = 'public/content/';
/** One publish may carry at most 20 MB of new / changed files (phase P11 T4 guard). */
export const MAX_COMMIT_BYTES = 20 * 1024 * 1024;
const BLOB_PARALLEL = 4;
const DEFAULT_TIMEOUT_MS = 10_000;
const SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const BRANCH_CHARS = /^[A-Za-z0-9._/-]+$/;

export interface CommitUpsert {
  /** Repo path, e.g. `public/content/manifest.json`. */
  path: string;
  bytes: Uint8Array;
}

export interface CommitRequest {
  branch: string;
  message: string;
  upserts: readonly CommitUpsert[];
  /** Repo paths to remove. */
  deletes: readonly string[];
}

export type CommitResult = { ok: true; commitSha: string } | GithubError;

type Sent = { ok: true; data: unknown } | GithubError;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (code: GithubError['code']): GithubError => ({ ok: false, code });

function isContentPath(p: unknown): p is string {
  return typeof p === 'string' && p.startsWith(CONTENT_PREFIX) && isSafeRelativePath(p);
}

function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

function readSha(v: unknown): string | null {
  return typeof v === 'string' && SHA.test(v) ? v : null;
}

async function send(
  method: GithubRequestInit['method'],
  url: string,
  token: string,
  opts: GithubOptions,
  body: unknown,
  conflictStatuses: readonly number[],
): Promise<Sent> {
  const controller = new AbortController();
  const state: { timedOut: boolean; timer: ReturnType<typeof setTimeout> | undefined } = { timedOut: false, timer: undefined };
  const timeout = new Promise<'timeout'>((resolve) => {
    state.timer = setTimeout(() => {
      state.timedOut = true;
      resolve('timeout');
      controller.abort();
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const init: GithubRequestInit =
    body === undefined
      ? { method, headers, signal: controller.signal }
      : { method, headers: { ...headers, 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(body) };

  let res: GithubResponse | 'timeout';
  try {
    res = await Promise.race([opts.fetch(url, init), timeout]);
  } catch {
    return fail(state.timedOut ? 'timeout' : 'offline');
  } finally {
    clearTimeout(state.timer);
  }
  if (res === 'timeout') return fail('timeout');
  if (!res.ok) return fail(conflictStatuses.includes(res.status) ? 'conflict' : statusToCode(res));
  try {
    return { ok: true, data: await res.json() };
  } catch {
    return fail('bad_response');
  }
}

type Blobs = { ok: true; shas: string[] } | GithubError;

/** Creates the blobs, at most BLOB_PARALLEL at a time. The result keeps the order of `upserts`. */
async function createBlobs(upserts: readonly CommitUpsert[], base: string, token: string, opts: GithubOptions): Promise<Blobs> {
  const shas: string[] = upserts.map(() => '');
  const state: { next: number; failure: GithubError | null } = { next: 0, failure: null };
  const worker = async (): Promise<void> => {
    for (;;) {
      if (state.failure !== null) return;
      const index = state.next;
      state.next += 1;
      const item = upserts[index];
      if (item === undefined) return;
      const r = await send('POST', `${base}/git/blobs`, token, opts, { content: toBase64(item.bytes), encoding: 'base64' }, [409]);
      if (!r.ok) {
        state.failure = r;
        return;
      }
      const sha = isRecord(r.data) ? readSha(r.data.sha) : null;
      if (sha === null) {
        state.failure = fail('bad_response');
        return;
      }
      shas[index] = sha;
    }
  };
  await Promise.all(Array.from({ length: Math.min(BLOB_PARALLEL, upserts.length) }, () => worker()));
  return state.failure === null ? { ok: true, shas } : state.failure;
}

async function run(token: string, req: CommitRequest, opts: GithubOptions): Promise<CommitResult> {
  if (!TOKEN_CHARS.test(token)) return fail('invalid_token');

  // Validate the whole request before the first network call.
  const branchOk = BRANCH_CHARS.test(req.branch) && isSafeRelativePath(req.branch);
  const paths = [...req.upserts.map((u) => u.path), ...req.deletes];
  const allSafe = paths.every(isContentPath);
  const unique = new Set(paths).size === paths.length;
  if (!branchOk || !allSafe || !unique || paths.length === 0) return fail('bad_path');
  if (req.message.trim() === '') return fail('bad_response');
  if (req.upserts.reduce((sum, u) => sum + u.bytes.length, 0) > MAX_COMMIT_BYTES) return fail('too_large');

  const base = repoUrl();
  const branchPath = req.branch.split('/').map(encodeURIComponent).join('/');

  // 1. The head of the branch.
  const ref = await send('GET', `${base}/git/ref/heads/${branchPath}`, token, opts, undefined, [409]);
  if (!ref.ok) return ref;
  const headSha = isRecord(ref.data) && isRecord(ref.data.object) ? readSha(ref.data.object.sha) : null;
  if (headSha === null) return fail('bad_response');

  // 2. The tree of that commit.
  const head = await send('GET', `${base}/git/commits/${headSha}`, token, opts, undefined, [409]);
  if (!head.ok) return head;
  const baseTree = isRecord(head.data) && isRecord(head.data.tree) ? readSha(head.data.tree.sha) : null;
  if (baseTree === null) return fail('bad_response');

  // 3. The new / changed files.
  const blobs = await createBlobs(req.upserts, base, token, opts);
  if (!blobs.ok) return blobs;

  // 4. The new tree: a deleted file is an entry with `sha: null`.
  const entries = [
    ...req.upserts.map((u, i) => ({ path: u.path, mode: '100644', type: 'blob', sha: blobs.shas[i] ?? null })),
    ...req.deletes.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
  ];
  const tree = await send('POST', `${base}/git/trees`, token, opts, { base_tree: baseTree, tree: entries }, [409]);
  if (!tree.ok) return tree;
  const treeSha = isRecord(tree.data) ? readSha(tree.data.sha) : null;
  if (treeSha === null) return fail('bad_response');

  // 5. The commit.
  const commit = await send('POST', `${base}/git/commits`, token, opts, { message: req.message, tree: treeSha, parents: [headSha] }, [409]);
  if (!commit.ok) return commit;
  const commitSha = isRecord(commit.data) ? readSha(commit.data.sha) : null;
  if (commitSha === null) return fail('bad_response');

  // 6. Move the branch. NEVER force: when the branch moved meanwhile GitHub answers 422 (not a fast-forward) = `conflict`.
  const moved = await send('PATCH', `${base}/git/refs/heads/${branchPath}`, token, opts, { sha: commitSha, force: false }, [409, 422]);
  if (!moved.ok) return moved;
  return { ok: true, commitSha };
}

/** Makes ONE commit on `branch` that adds / changes `upserts` and removes `deletes`. Never throws. */
export async function commitFiles(token: string, req: CommitRequest, opts: GithubOptions): Promise<CommitResult> {
  try {
    return await run(token.trim(), req, opts);
  } catch {
    return fail('bad_response');
  }
}
