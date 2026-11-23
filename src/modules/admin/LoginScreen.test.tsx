import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GithubFetch, GithubRequestInit, GithubResponse } from '../../core/admin/github';
import { t, type TextKey } from '../../core/i18n';
import { LoginScreen } from './LoginScreen';
import { getInfo, getToken, logout } from './session';

const TOKEN = 'github_pat_SECRET123_abc-XYZ';

function res(status: number, body: unknown, headers: Record<string, string> = {}): GithubResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() in headers ? headers[name.toLowerCase()] : null) },
    json: () => Promise.resolve(body),
  };
}

const GOOD_REPO = {
  full_name: 'mynativepreparation/MyNativePreparation',
  default_branch: 'main',
  permissions: { push: true },
};

function fake(handler: () => Promise<GithubResponse>): { fetch: GithubFetch; inits: GithubRequestInit[] } {
  const inits: GithubRequestInit[] = [];
  const fetch: GithubFetch = (_url, init) => {
    inits.push(init);
    return handler();
  };
  return { fetch, inits };
}

const field = () => screen.getByLabelText(t('admin.login.token'));
const submit = () => fireEvent.click(screen.getByRole('button', { name: t('admin.login.submit') }));
const typeToken = (value: string) => fireEvent.change(field(), { target: { value } });

afterEach(() => {
  logout();
  vi.restoreAllMocks();
});

describe('LoginScreen', () => {
  it('shows a password field with a label and hint, and a Log in button', () => {
    render(<LoginScreen fetchImpl={fake(() => Promise.resolve(res(200, GOOD_REPO))).fetch} />);
    expect(screen.getByRole('heading', { level: 2, name: t('admin.login.title') })).toBeInTheDocument();
    expect(field()).toHaveAttribute('type', 'password');
    expect(field()).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByText(t('admin.login.hint'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.login.submit') })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('logs in with a good token: session holds it, the field is cleared, nothing is stored or shown', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const f = fake(() => Promise.resolve(res(200, GOOD_REPO)));
    render(<LoginScreen fetchImpl={f.fetch} />);
    typeToken(`  ${TOKEN} `);
    submit();
    await waitFor(() => expect(getToken()).toBe(TOKEN));
    expect(getInfo()).toEqual({ fullName: GOOD_REPO.full_name, defaultBranch: 'main', branchOk: true });
    expect(f.inits.map((i) => i.headers.Authorization)).toEqual([`Bearer ${TOKEN}`]);
    await waitFor(() => expect(field()).toHaveValue(''));
    expect(document.body.innerHTML.includes(TOKEN)).toBe(false);
    expect(document.body.innerHTML.includes('SECRET123')).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    expect(document.cookie).toBe('');
  });

  const failures: [string, () => Promise<GithubResponse>, TextKey][] = [
    ['401', () => Promise.resolve(res(401, {})), 'admin.err.unauthorized'],
    ['403 rate limit', () => Promise.resolve(res(403, {}, { 'x-ratelimit-remaining': '0' })), 'admin.err.rateLimited'],
    ['403 other', () => Promise.resolve(res(403, {})), 'admin.err.forbidden'],
    ['404', () => Promise.resolve(res(404, {})), 'admin.err.notFound'],
    ['no push right', () => Promise.resolve(res(200, { ...GOOD_REPO, permissions: { push: false } })), 'admin.err.noPush'],
    ['offline', () => Promise.reject(new TypeError('Failed to fetch')), 'admin.err.offline'],
    ['500', () => Promise.resolve(res(500, {})), 'admin.err.badResponse'],
  ];

  it.each(failures)('shows a friendly message and no session for: %s', async (_name, handler, key) => {
    render(<LoginScreen fetchImpl={fake(handler).fetch} />);
    typeToken(TOKEN);
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t(key));
    expect(getToken()).toBeNull();
    expect((document.body.textContent ?? '').includes('SECRET123')).toBe(false);
    expect(screen.getByRole('button', { name: t('admin.login.submit') })).toBeEnabled();
  });

  it('rejects an empty or malformed token without calling GitHub', async () => {
    const f = fake(() => Promise.resolve(res(200, GOOD_REPO)));
    render(<LoginScreen fetchImpl={f.fetch} />);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(t('admin.err.invalidToken'));
    typeToken('not a token');
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(t('admin.err.invalidToken')));
    expect(f.inits).toHaveLength(0);
    expect(getToken()).toBeNull();
  });

  it('shows a polite status and disables the button while checking', async () => {
    let finish: (r: GithubResponse) => void = () => undefined;
    const pending = new Promise<GithubResponse>((resolve) => {
      finish = resolve;
    });
    render(<LoginScreen fetchImpl={fake(() => pending).fetch} />);
    typeToken(TOKEN);
    submit();
    expect(await screen.findByRole('status')).toHaveTextContent(t('admin.login.checking'));
    expect(screen.getByRole('button', { name: t('admin.login.submit') })).toBeDisabled();
    finish(res(200, GOOD_REPO));
    await waitFor(() => expect(getToken()).toBe(TOKEN));
  });
});
