// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GithubFetch, GithubRequestInit, GithubResponse } from './github';
import { commitFiles, MAX_COMMIT_BYTES, type CommitRequest } from './githubWrite';

const TOKEN = 'github_pat_SECRET123_abc-XYZ';
const R = 'https://api.github.com/repos/mynativepreparation/MyNativePreparation';
const HEAD = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const NEW_TREE = 'd'.repeat(40);
const NEW_COMMIT = 'e'.repeat(40);
const HI_BLOB = '1'.repeat(40);
const YO_BLOB = '2'.repeat(40);
const OTHER_BLOB = '3'.repeat(40);

const enc = new TextEncoder();

function res(status: number, body: unknown, headers: Record<string, string> = {}): GithubResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() in headers ? headers[name.toLowerCase()] : null) },
    json: () => Promise.resolve(body),
  };
}

interface Call {
  url: string;
  init: GithubRequestInit;
}

function fake(handler: (call: Call) => Promise<GithubResponse> | GithubResponse): { fetch: GithubFetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: GithubFetch = (url, init) => {
    const call = { url, init };
    calls.push(call);
    return Promise.resolve(handler(call));
  };
  return { fetch, calls };
}

const bodyOf = (call: Call): unknown => JSON.parse(call.init.body ?? 'null');
const label = (call: Call): string => `${call.init.method} ${call.url.replace(R, '')}`;

/** The answers of a GitHub where everything works. */
function happy(call: Call): GithubResponse {
  const l = label(call);
  if (l === 'GET /git/ref/heads/main') return res(200, { object: { sha: HEAD } });
  if (l === `GET /git/commits/${HEAD}`) return res(200, { tree: { sha: TREE } });
  if (l === 'POST /git/blobs') {
    const b = bodyOf(call) as { content: string };
    return res(201, { sha: b.content === 'SGk=' ? HI_BLOB : b.content === 'WW8=' ? YO_BLOB : OTHER_BLOB });
  }
  if (l === 'POST /git/trees') return res(201, { sha: NEW_TREE });
  if (l === 'POST /git/commits') return res(201, { sha: NEW_COMMIT });
  if (l === 'PATCH /git/refs/heads/main') return res(200, { object: { sha: NEW_COMMIT } });
  return res(404, {});
}

function request(over: Partial<CommitRequest> = {}): CommitRequest {
  return {
    branch: 'main',
    message: 'Publish course',
    upserts: [
      { path: 'public/content/manifest.json', bytes: enc.encode('Hi') },
      { path: 'public/content/courses/crs-a/course.json', bytes: enc.encode('Yo') },
    ],
    deletes: ['public/content/courses/old/chapter.json'],
    ...over,
  };
}

describe('commitFiles', () => {
  it('makes one commit with the Git Data API calls in order, and moves the branch WITHOUT force', async () => {
    const f = fake(happy);
    const r = await commitFiles(`  ${TOKEN}  `, request(), { fetch: f.fetch });
    expect(r).toEqual({ ok: true, commitSha: NEW_COMMIT });
    expect(f.calls.map(label)).toEqual([
      'GET /git/ref/heads/main',
      `GET /git/commits/${HEAD}`,
      'POST /git/blobs',
      'POST /git/blobs',
      'POST /git/trees',
      'POST /git/commits',
      'PATCH /git/refs/heads/main',
    ]);
    const posts = f.calls.filter((c) => c.init.method !== 'GET').map(bodyOf);
    expect(posts).toEqual([
      { content: 'SGk=', encoding: 'base64' },
      { content: 'WW8=', encoding: 'base64' },
      {
        base_tree: TREE,
        tree: [
          { path: 'public/content/manifest.json', mode: '100644', type: 'blob', sha: HI_BLOB },
          { path: 'public/content/courses/crs-a/course.json', mode: '100644', type: 'blob', sha: YO_BLOB },
          { path: 'public/content/courses/old/chapter.json', mode: '100644', type: 'blob', sha: null },
        ],
      },
      { message: 'Publish course', tree: NEW_TREE, parents: [HEAD] },
      { sha: NEW_COMMIT, force: false },
    ]);
  });

  it('puts the token ONLY in the Authorization header, never in a URL, a body or the result', async () => {
    const f = fake(happy);
    const r = await commitFiles(TOKEN, request(), { fetch: f.fetch });
    expect(f.calls.map((c) => c.init.headers.Authorization)).toEqual(f.calls.map(() => `Bearer ${TOKEN}`));
    expect(f.calls.map((c) => c.url.includes(TOKEN))).toEqual(f.calls.map(() => false));
    expect(f.calls.map((c) => (c.init.body ?? '').includes(TOKEN))).toEqual(f.calls.map(() => false));
    expect(JSON.stringify(r).includes(TOKEN)).toBe(false);
  });

  it('a delete-only commit creates no blob', async () => {
    const f = fake(happy);
    const r = await commitFiles(TOKEN, request({ upserts: [] }), { fetch: f.fetch });
    expect(r).toEqual({ ok: true, commitSha: NEW_COMMIT });
    expect(f.calls.map(label)).toEqual([
      'GET /git/ref/heads/main',
      `GET /git/commits/${HEAD}`,
      'POST /git/trees',
      'POST /git/commits',
      'PATCH /git/refs/heads/main',
    ]);
  });

  it('creates at most 4 blobs at a time and keeps the file order in the tree', async () => {
    const state = { inflight: 0, max: 0 };
    const f = fake(async (call) => {
      if (label(call) !== 'POST /git/blobs') return happy(call);
      state.inflight += 1;
      state.max = Math.max(state.max, state.inflight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      state.inflight -= 1;
      return happy(call);
    });
    const upserts = Array.from({ length: 9 }, (_, i) => ({ path: `public/content/courses/c/f${i}.json`, bytes: enc.encode('Hi') }));
    const r = await commitFiles(TOKEN, request({ upserts, deletes: [] }), { fetch: f.fetch });
    expect(r).toEqual({ ok: true, commitSha: NEW_COMMIT });
    expect(state.max).toBeGreaterThan(1);
    expect(state.max).toBeLessThanOrEqual(4);
    const treeBody = f.calls.filter((c) => label(c) === 'POST /git/trees').map(bodyOf) as { tree: { path: string }[] }[];
    expect(treeBody.map((b) => b.tree.map((e) => e.path))).toEqual([upserts.map((u) => u.path)]);
  });

  it('answers `conflict` when the branch moved (422 on the ref update) and never retries with force', async () => {
    const f = fake((call) => (label(call) === 'PATCH /git/refs/heads/main' ? res(422, { message: 'Update is not a fast forward' }) : happy(call)));
    const r = await commitFiles(TOKEN, request(), { fetch: f.fetch });
    expect(r).toEqual({ ok: false, code: 'conflict' });
    expect(f.calls.filter((c) => c.init.method === 'PATCH').length).toBe(1);
    expect(f.calls.map((c) => c.init.body ?? '').filter((b) => b.includes('"force":true'))).toEqual([]);
  });

  it('maps the error statuses to codes', async () => {
    const cases: { status: number; headers?: Record<string, string>; code: string }[] = [
      { status: 401, code: 'unauthorized' },
      { status: 403, code: 'forbidden' },
      { status: 403, headers: { 'retry-after': '30' }, code: 'rate_limited' },
      { status: 429, code: 'rate_limited' },
      { status: 404, code: 'not_found' },
      { status: 500, code: 'bad_response' },
      { status: 409, code: 'conflict' },
    ];
    const results = await Promise.all(
      cases.map((c) => {
        const f = fake(() => res(c.status, {}, c.headers ?? {}));
        return commitFiles(TOKEN, request(), { fetch: f.fetch });
      }),
    );
    expect(results).toEqual(cases.map((c) => ({ ok: false, code: c.code })));
  });

  it('stops at the first failing blob', async () => {
    const f = fake((call) => (label(call) === 'POST /git/blobs' ? res(403, {}, { 'x-ratelimit-remaining': '0' }) : happy(call)));
    const r = await commitFiles(TOKEN, request(), { fetch: f.fetch });
    expect(r).toEqual({ ok: false, code: 'rate_limited' });
    expect(f.calls.map(label).includes('POST /git/trees')).toBe(false);
    expect(f.calls.map(label).includes('PATCH /git/refs/heads/main')).toBe(false);
  });

  it('answers `offline` when fetch fails and `timeout` when it never answers', async () => {
    const offline = await commitFiles(TOKEN, request(), { fetch: () => Promise.reject(new Error('network down')) });
    expect(offline).toEqual({ ok: false, code: 'offline' });
    const f = fake(() => new Promise<GithubResponse>(() => undefined));
    const slow = await commitFiles(TOKEN, request(), { fetch: f.fetch, timeoutMs: 20 });
    expect(slow).toEqual({ ok: false, code: 'timeout' });
  });

  it('answers `bad_response` for a broken answer', async () => {
    const noSha = fake((call) => (label(call) === 'GET /git/ref/heads/main' ? res(200, { object: {} }) : happy(call)));
    expect(await commitFiles(TOKEN, request(), { fetch: noSha.fetch })).toEqual({ ok: false, code: 'bad_response' });
    const notJson = fake(() => ({ ok: true, status: 200, json: () => Promise.reject(new Error('not json')) }));
    expect(await commitFiles(TOKEN, request(), { fetch: notJson.fetch })).toEqual({ ok: false, code: 'bad_response' });
    const badBlob = fake((call) => (label(call) === 'POST /git/blobs' ? res(201, { sha: 'nope' }) : happy(call)));
    expect(await commitFiles(TOKEN, request(), { fetch: badBlob.fetch })).toEqual({ ok: false, code: 'bad_response' });
  });

  it('answers `invalid_token` for a token that could break the header, without any request', async () => {
    const f = fake(happy);
    const r = await commitFiles('bad token\n', request(), { fetch: f.fetch });
    expect(r).toEqual({ ok: false, code: 'invalid_token' });
    expect(f.calls.length).toBe(0);
  });

  it('refuses bad paths, bad branches and empty commits before any request', async () => {
    const bad: Partial<CommitRequest>[] = [
      { upserts: [{ path: 'src/main.ts', bytes: enc.encode('x') }], deletes: [] },
      { upserts: [], deletes: ['package.json'] },
      { upserts: [{ path: 'public/content/../secret.txt', bytes: enc.encode('x') }], deletes: [] },
      { upserts: [{ path: 'public/content/a\\b.json', bytes: enc.encode('x') }], deletes: [] },
      { upserts: [{ path: '/public/content/a.json', bytes: enc.encode('x') }], deletes: [] },
      { upserts: [{ path: 'public/content/', bytes: enc.encode('x') }], deletes: [] },
      { upserts: [{ path: 'public/content/a.json', bytes: enc.encode('x') }], deletes: ['public/content/a.json'] },
      { upserts: [], deletes: [] },
      { branch: '../main' },
      { branch: 'main branch' },
      { branch: '' },
    ];
    const f = fake(happy);
    const results = await Promise.all(bad.map((over) => commitFiles(TOKEN, request(over), { fetch: f.fetch })));
    expect(results).toEqual(bad.map(() => ({ ok: false, code: 'bad_path' })));
    expect(f.calls.length).toBe(0);
  });

  it('refuses an empty message and a commit over 20 MB before any request', async () => {
    const f = fake(happy);
    expect(await commitFiles(TOKEN, request({ message: '   ' }), { fetch: f.fetch })).toEqual({ ok: false, code: 'bad_response' });
    const big = [{ path: 'public/content/big.bin', bytes: new Uint8Array(MAX_COMMIT_BYTES + 1) }];
    expect(await commitFiles(TOKEN, request({ upserts: big, deletes: [] }), { fetch: f.fetch })).toEqual({ ok: false, code: 'too_large' });
    expect(f.calls.length).toBe(0);
  });

  it('the token never appears in any result, whatever fails', async () => {
    const outcomes = await Promise.all(
      [401, 403, 404, 422, 500].map((status) => {
        const f = fake(() => res(status, { message: `leak ${TOKEN}` }));
        return commitFiles(TOKEN, request(), { fetch: f.fetch });
      }),
    );
    expect(outcomes.map((o) => JSON.stringify(o).includes(TOKEN))).toEqual([false, false, false, false, false]);
  });
});
