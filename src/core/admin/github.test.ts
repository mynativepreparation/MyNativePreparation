// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readRepoFile, verifyToken, type GithubFetch, type GithubRequestInit, type GithubResponse } from './github';

const TOKEN = 'github_pat_SECRET123_abc-XYZ';
const REPO_URL = 'https://api.github.com/repos/mynativepreparation/MyNativePreparation';

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

const GOOD_REPO = {
  full_name: 'mynativepreparation/MyNativePreparation',
  default_branch: 'main',
  permissions: { admin: false, push: true, pull: true },
};

describe('verifyToken', () => {
  it('accepts a token that can push, and sends it only in the Authorization header', async () => {
    const f = fake(() => res(200, GOOD_REPO));
    const r = await verifyToken(`  ${TOKEN}  `, { fetch: f.fetch });
    expect(r).toEqual({
      ok: true,
      fullName: 'mynativepreparation/MyNativePreparation',
      defaultBranch: 'main',
      branchOk: true,
    });
    expect(f.calls.map((c) => c.url)).toEqual([REPO_URL]);
    expect(f.calls.map((c) => c.init.method)).toEqual(['GET']);
    expect(f.calls.map((c) => c.init.headers.Authorization)).toEqual([`Bearer ${TOKEN}`]);
    expect(f.calls.map((c) => c.url.includes(TOKEN))).toEqual([false]);
  });

  it('reports a different default branch', async () => {
    const f = fake(() => res(200, { ...GOOD_REPO, default_branch: 'master' }));
    const r = await verifyToken(TOKEN, { fetch: f.fetch });
    expect(r).toEqual({ ok: true, fullName: GOOD_REPO.full_name, defaultBranch: 'master', branchOk: false });
  });

  it('rejects a token without push right', async () => {
    for (const body of [
      { ...GOOD_REPO, permissions: { push: false, pull: true } },
      { ...GOOD_REPO, permissions: undefined },
      { ...GOOD_REPO, permissions: 'yes' },
    ]) {
      const f = fake(() => res(200, body));
      expect(await verifyToken(TOKEN, { fetch: f.fetch })).toEqual({ ok: false, code: 'no_push_right' });
    }
  });

  it('maps HTTP statuses to codes', async () => {
    const cases: [GithubResponse, string][] = [
      [res(401, { message: 'Bad credentials' }), 'unauthorized'],
      [res(403, {}, { 'x-ratelimit-remaining': '0' }), 'rate_limited'],
      [res(403, {}, { 'retry-after': '30' }), 'rate_limited'],
      [res(429, {}), 'rate_limited'],
      [res(403, {}, { 'x-ratelimit-remaining': '12' }), 'forbidden'],
      [res(404, {}), 'not_found'],
      [res(500, {}), 'bad_response'],
    ];
    for (const [response, code] of cases) {
      const f = fake(() => response);
      expect(await verifyToken(TOKEN, { fetch: f.fetch })).toEqual({ ok: false, code });
    }
  });

  it('reports offline when fetch rejects or throws', async () => {
    const rejecting: GithubFetch = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await verifyToken(TOKEN, { fetch: rejecting })).toEqual({ ok: false, code: 'offline' });
    const throwing: GithubFetch = () => {
      throw new Error('boom');
    };
    expect(await verifyToken(TOKEN, { fetch: throwing })).toEqual({ ok: false, code: 'offline' });
  });

  it('reports a timeout, also when fetch ignores the abort signal', async () => {
    const abortAware: GithubFetch = (_url, init) =>
      new Promise<GithubResponse>((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    expect(await verifyToken(TOKEN, { fetch: abortAware, timeoutMs: 10 })).toEqual({ ok: false, code: 'timeout' });
    const hanging: GithubFetch = () => new Promise<GithubResponse>(() => undefined);
    expect(await verifyToken(TOKEN, { fetch: hanging, timeoutMs: 10 })).toEqual({ ok: false, code: 'timeout' });
  });

  it('reports a bad response for invalid JSON or an unexpected body', async () => {
    const badJson: GithubResponse = { ok: true, status: 200, json: () => Promise.reject(new SyntaxError('x')) };
    expect(await verifyToken(TOKEN, { fetch: fake(() => badJson).fetch })).toEqual({ ok: false, code: 'bad_response' });
    for (const body of [[], 'text', null, 42, { permissions: { push: true } }, { ...GOOD_REPO, full_name: 5 }]) {
      const f = fake(() => res(200, body));
      expect(await verifyToken(TOKEN, { fetch: f.fetch })).toEqual({ ok: false, code: 'bad_response' });
    }
  });

  it('rejects an empty or malformed token without calling GitHub', async () => {
    const f = fake(() => res(200, GOOD_REPO));
    for (const token of ['', '   ', 'bad token', 'abc\nxyz', 'tök\u00e9n', 'a:b', 'x/y']) {
      expect(await verifyToken(token, { fetch: f.fetch })).toEqual({ ok: false, code: 'invalid_token' });
    }
    expect(f.calls).toHaveLength(0);
  });

  it('never returns the token in any result', async () => {
    const responders: (() => Promise<GithubResponse> | GithubResponse)[] = [
      () => res(200, GOOD_REPO),
      () => res(200, { ...GOOD_REPO, message: TOKEN }),
      () => res(401, { message: `Bad credentials ${TOKEN}` }),
      () => res(403, { message: TOKEN }, { 'x-ratelimit-remaining': '0' }),
      () => res(404, { message: TOKEN }),
      () => Promise.reject(new Error(`network down for ${TOKEN}`)),
    ];
    for (const responder of responders) {
      const f = fake(responder);
      const r = await verifyToken(TOKEN, { fetch: f.fetch });
      expect(JSON.stringify(r).includes(TOKEN)).toBe(false);
      expect(JSON.stringify(r).includes('SECRET123')).toBe(false);
    }
  });
});

describe('readRepoFile', () => {
  const TEXT = 'પ્રકરણ ૧\n{"title":"વિજ્ઞાન"}';
  const encode = (s: string): string => {
    let bin = '';
    for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/(.{60})/g, '$1\n');
  };

  it('reads and decodes a file (UTF-8, base64 with line breaks)', async () => {
    const f = fake(() => res(200, { type: 'file', encoding: 'base64', content: encode(TEXT) }));
    const r = await readRepoFile(TOKEN, 'courses/crs-abc/course.json', { fetch: f.fetch });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe(TEXT);
      expect(Array.from(r.bytes)).toEqual(Array.from(new TextEncoder().encode(TEXT)));
    }
    expect(f.calls.map((c) => c.url)).toEqual([`${REPO_URL}/contents/courses/crs-abc/course.json?ref=main`]);
    expect(f.calls.map((c) => c.init.headers.Authorization)).toEqual([`Bearer ${TOKEN}`]);
  });

  it('encodes each path segment', async () => {
    const f = fake(() => res(200, { type: 'file', encoding: 'base64', content: encode('x') }));
    await readRepoFile(TOKEN, 'a b/c#d.json', { fetch: f.fetch });
    expect(f.calls.map((c) => c.url)).toEqual([`${REPO_URL}/contents/a%20b/c%23d.json?ref=main`]);
  });

  it('rejects unsafe paths and bad tokens without calling GitHub', async () => {
    const f = fake(() => res(200, {}));
    for (const path of ['', '../x', '/x', 'a\\b', 'a:b', 'a/../b']) {
      expect(await readRepoFile(TOKEN, path, { fetch: f.fetch })).toEqual({ ok: false, code: 'bad_path' });
    }
    expect(await readRepoFile('bad token', 'a.json', { fetch: f.fetch })).toEqual({ ok: false, code: 'invalid_token' });
    expect(f.calls).toHaveLength(0);
  });

  it('maps errors and odd bodies to codes', async () => {
    const cases: [GithubResponse, string][] = [
      [res(404, { message: 'Not Found' }), 'not_found'],
      [res(401, {}), 'unauthorized'],
      [res(403, {}, { 'x-ratelimit-remaining': '0' }), 'rate_limited'],
      [res(200, [{ type: 'file' }]), 'bad_response'],
      [res(200, { type: 'dir' }), 'bad_response'],
      [res(200, { type: 'file', encoding: 'none', content: '' }), 'too_large'],
      [res(200, { type: 'file', encoding: 'base64', content: '!!!' }), 'bad_response'],
      [res(200, { type: 'file', encoding: 'base64', content: 5 }), 'bad_response'],
    ];
    for (const [response, code] of cases) {
      const f = fake(() => response);
      expect(await readRepoFile(TOKEN, 'a.json', { fetch: f.fetch })).toEqual({ ok: false, code });
    }
  });

  it('reports offline and timeout', async () => {
    const rejecting: GithubFetch = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await readRepoFile(TOKEN, 'a.json', { fetch: rejecting })).toEqual({ ok: false, code: 'offline' });
    const hanging: GithubFetch = () => new Promise<GithubResponse>(() => undefined);
    expect(await readRepoFile(TOKEN, 'a.json', { fetch: hanging, timeoutMs: 10 })).toEqual({ ok: false, code: 'timeout' });
  });

  it('never returns the token in an error result', async () => {
    const f = fake(() => res(404, { message: TOKEN }));
    const r = await readRepoFile(TOKEN, 'a.json', { fetch: f.fetch });
    expect(JSON.stringify(r).includes(TOKEN)).toBe(false);
  });
});
