import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GithubFetch, GithubResponse } from '../../core/admin/github';
import { t, tf } from '../../core/i18n';
import AdminScreen from './AdminScreen';
import adminModule from './index';
import { getToken, logout } from './session';

const TOKEN = 'github_pat_SECRET123_abc-XYZ';

const repo = (branch: string): GithubFetch => () =>
  Promise.resolve<GithubResponse>({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        full_name: 'mynativepreparation/MyNativePreparation',
        default_branch: branch,
        permissions: { push: true },
      }),
  });

async function logIn(fetchImpl: GithubFetch) {
  render(<AdminScreen fetchImpl={fetchImpl} />);
  fireEvent.change(screen.getByLabelText(t('admin.login.token')), { target: { value: TOKEN } });
  fireEvent.click(screen.getByRole('button', { name: t('admin.login.submit') }));
  await screen.findByText(tf('admin.home.signedIn', { repo: 'mynativepreparation/MyNativePreparation' }));
}

afterEach(() => {
  logout();
});

describe('AdminScreen', () => {
  it('shows the login first, under an Admin heading', () => {
    render(<AdminScreen fetchImpl={repo('main')} />);
    expect(screen.getByRole('heading', { level: 1, name: t('admin.title') })).toBeInTheDocument();
    expect(screen.getByLabelText(t('admin.login.token'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('admin.home.logout') })).not.toBeInTheDocument();
  });

  it('after login shows the repository and a Log out button, and never the token', async () => {
    await logIn(repo('main'));
    expect(screen.queryByLabelText(t('admin.login.token'))).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: t('admin.courses.title') })).toBeInTheDocument();
    expect(screen.queryByText(tf('admin.home.branchWarn', { branch: 'main' }))).not.toBeInTheDocument();
    expect(document.body.innerHTML.includes('SECRET123')).toBe(false);
  });

  it('warns when the default branch is not the expected one', async () => {
    await logIn(repo('master'));
    expect(screen.getByRole('alert')).toHaveTextContent(tf('admin.home.branchWarn', { branch: 'master' }));
  });

  it('Log out forgets the token and shows the login again', async () => {
    await logIn(repo('main'));
    expect(getToken()).toBe(TOKEN);
    fireEvent.click(screen.getByRole('button', { name: t('admin.home.logout') }));
    await waitFor(() => expect(screen.getByLabelText(t('admin.login.token'))).toBeInTheDocument());
    expect(getToken()).toBeNull();
    expect(screen.getByLabelText(t('admin.login.token'))).toHaveValue('');
  });
});

describe('admin module', () => {
  it('registers one hidden route "admin" (no tile, no menu entry is added by this module)', () => {
    expect(adminModule.id).toBe('admin');
    expect(adminModule.routes.map((r) => r.path)).toEqual(['admin']);
    expect(adminModule.layout).toBeUndefined();
  });
});
