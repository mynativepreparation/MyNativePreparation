import { isSafeRelativePath } from '../content/validate';
import { CONTENT_REPO } from './config';

// Thin, READ-ONLY GitHub client for the Admin editor (P10 T4, DECISIONS Q24). Writing to GitHub is P11.
// - `fetch` is injected: this file never touches a global, so tests use a fake and the app passes the real one.
// - Nothing here throws: every function returns `{ ok: true, ... }` or `{ ok: false, code }`.
// - The token is used ONLY in the Authorization header. It is never put into a result, a code, or a log.

export type GithubErrorCode =
  | 'invalid_token'
  | 'unauthorized'
  | 'forbidden'
  | 'no_push_right'
  | 'rate_limited'
  | 'not_found'
  | 'offline'
  | 'timeout'
  | 'bad_response'
  | 'bad_path'
  | 'too_large'
  | 'conflict';

export interface GithubError {
  ok: false;
  code: GithubErrorCode;
}

/** The small part of a fetch Response this client needs (a real `Response` fits). */
export interface GithubResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export interface GithubRequestInit {
  method: 'GET' | 'POST' | 'PATCH';
  headers: Record<string, string>;
  signal: AbortSignal;
  /** JSON text for POST / PATCH (P11 T2). */
  body?: string;
}

export type GithubFetch = (url: string, init: GithubRequestInit) => Promise<GithubResponse>;

export interface GithubOptions {
  fetch: GithubFetch;
  /** Default 10000 ms. */
  timeoutMs?: number;
}

export type VerifyResult =
  | { ok: true; fullName: string; defaultBranch: string; branchOk: boolean }
  | GithubError;

export type ReadFileResult = { ok: true; bytes: Uint8Array; text: string } | GithubError;

const API = 'https://api.github.com';
const DEFAULT_TIMEOUT_MS = 10_000;
// GitHub tokens are letters, digits, "_" and "-" (github_pat_..., ghp_...). Anything else could break the header.
export const TOKEN_CHARS = /^[A-Za-z0-9_-]+$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function statusToCode(res: GithubResponse): GithubErrorCode {
  if (res.status === 401) return 'unauthorized';
  if (res.status === 429) return 'rate_limited';
  if (res.status === 403) {
    const remaining = res.headers?.get('x-ratelimit-remaining') ?? null;
    const retryAfter = res.headers?.get('retry-after') ?? null;
    return remaining === '0' || retryAfter !== null ? 'rate_limited' : 'forbidden';
  }
  if (res.status === 404) return 'not_found';
  return 'bad_response';
}

async function getJson(url: string, token: string, opts: GithubOptions): Promise<{ ok: true; data: unknown } | GithubError> {
  const controller = new AbortController();
  const state: { timedOut: boolean; timer: ReturnType<typeof setTimeout> | undefined } = { timedOut: false, timer: undefined };
  const timeout = new Promise<'timeout'>((resolve) => {
    state.timer = setTimeout(() => {
      state.timedOut = true;
      resolve('timeout');
      controller.abort();
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });

  let res: GithubResponse | 'timeout';
  try {
    res = await Promise.race([
      opts.fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      }),
      timeout,
    ]);
  } catch {
    return { ok: false, code: state.timedOut ? 'timeout' : 'offline' };
  } finally {
    clearTimeout(state.timer);
  }

  if (res === 'timeout') return { ok: false, code: 'timeout' };
  if (!res.ok) return { ok: false, code: statusToCode(res) };
  try {
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, code: 'bad_response' };
  }
}

export function repoUrl(): string {
  return `${API}/repos/${encodeURIComponent(CONTENT_REPO.owner)}/${encodeURIComponent(CONTENT_REPO.name)}`;
}

/** Admin login check: the token must be valid AND allowed to push to the content repo. */
export async function verifyToken(token: string, opts: GithubOptions): Promise<VerifyResult> {
  const t = token.trim();
  if (!TOKEN_CHARS.test(t)) return { ok: false, code: 'invalid_token' };
  const r = await getJson(repoUrl(), t, opts);
  if (!r.ok) return r;
  const data = r.data;
  if (!isRecord(data)) return { ok: false, code: 'bad_response' };
  const permissions = data.permissions;
  if (!isRecord(permissions) || permissions.push !== true) return { ok: false, code: 'no_push_right' };
  const fullName = typeof data.full_name === 'string' ? data.full_name : '';
  const defaultBranch = typeof data.default_branch === 'string' ? data.default_branch : '';
  if (fullName === '' || defaultBranch === '') return { ok: false, code: 'bad_response' };
  return { ok: true, fullName, defaultBranch, branchOk: defaultBranch === CONTENT_REPO.branch };
}

function decodeBase64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Reads one file of the content repo (path relative to the repo root, e.g. `manifest.json`). Files over 1 MB are `too_large`. */
export async function readRepoFile(token: string, path: string, opts: GithubOptions): Promise<ReadFileResult> {
  const t = token.trim();
  if (!TOKEN_CHARS.test(t)) return { ok: false, code: 'invalid_token' };
  if (!isSafeRelativePath(path)) return { ok: false, code: 'bad_path' };
  const encoded = path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const url = `${repoUrl()}/contents/${encoded}?ref=${encodeURIComponent(CONTENT_REPO.branch)}`;
  const r = await getJson(url, t, opts);
  if (!r.ok) return r;
  const data = r.data;
  if (!isRecord(data) || data.type !== 'file') return { ok: false, code: 'bad_response' };
  if (data.encoding === 'none') return { ok: false, code: 'too_large' };
  if (data.encoding !== 'base64' || typeof data.content !== 'string') return { ok: false, code: 'bad_response' };
  const bytes = decodeBase64(data.content);
  if (bytes === null) return { ok: false, code: 'bad_response' };
  return { ok: true, bytes, text: new TextDecoder('utf-8').decode(bytes) };
}
