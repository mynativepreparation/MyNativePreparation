// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInfo, getToken, login, logout, subscribe, type AdminInfo } from './session';

const INFO: AdminInfo = { fullName: 'mynativepreparation/MyNativePreparation', defaultBranch: 'main', branchOk: true };

afterEach(() => {
  logout();
});

describe('admin session', () => {
  it('starts logged out', () => {
    expect(getToken()).toBeNull();
    expect(getInfo()).toBeNull();
  });

  it('keeps the token and the repository info after login, and forgets both on logout', () => {
    login('github_pat_abc', INFO);
    expect(getToken()).toBe('github_pat_abc');
    expect(getInfo()).toEqual(INFO);
    logout();
    expect(getToken()).toBeNull();
    expect(getInfo()).toBeNull();
  });

  it('returns the same info object until something changes', () => {
    login('github_pat_abc', INFO);
    expect(getInfo()).toBe(getInfo());
  });

  it('never exposes the token through the info object', () => {
    login('github_pat_SECRET', INFO);
    expect(JSON.stringify(getInfo()).includes('SECRET')).toBe(false);
  });

  it('notifies subscribers on login and logout, and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    login('github_pat_abc', INFO);
    logout();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    login('github_pat_abc', INFO);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
