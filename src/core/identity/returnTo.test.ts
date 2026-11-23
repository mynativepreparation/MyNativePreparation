import { describe, expect, it } from 'vitest';
import { afterUnlockPath, returnPathFrom, returnStateFor } from './returnTo';

describe('returnPathFrom', () => {
  it('accepts an in-app address carried in the state', () => {
    expect(returnPathFrom({ from: '/admin' })).toBe('/admin');
    expect(returnPathFrom({ from: '/course/abc/content' })).toBe('/course/abc/content');
    expect(returnPathFrom({ from: '/settings' })).toBe('/settings');
  });

  it('gives null for no state, a wrong shape or a wrong type', () => {
    for (const state of [undefined, null, 'admin', 42, true, [], {}, { from: 5 }, { from: null }, { from: '' }, { from: 'admin' }]) {
      expect(returnPathFrom(state)).toBeNull();
    }
  });

  it('never accepts the lock screens, Welcome, Home or other onboarding screens (no loops)', () => {
    for (const from of ['/', '/login', '/pin', '/welcome', '/register', '/fingerprint', '/pin-setup', '/info', '/privacy', '/login/', '/pin//']) {
      expect(returnPathFrom({ from }), from).toBeNull();
    }
  });

  it('never accepts a foreign-looking or absurdly long address', () => {
    expect(returnPathFrom({ from: '//evil.example/steal' })).toBeNull();
    expect(returnPathFrom({ from: 'https://evil.example/' })).toBeNull();
    expect(returnPathFrom({ from: `/${'a'.repeat(300)}` })).toBeNull();
  });
});

describe('returnStateFor', () => {
  it('carries the address that was asked for', () => {
    expect(returnStateFor(null, '/admin')).toEqual({ from: '/admin' });
  });

  it('keeps the address that is already carried (the lock screens pass it on)', () => {
    expect(returnStateFor({ from: '/admin' }, '/pin')).toEqual({ from: '/admin' });
    expect(returnStateFor({ from: '/admin' }, '/login')).toEqual({ from: '/admin' });
  });

  it('carries nothing when there is nothing worth going back to', () => {
    expect(returnStateFor(null, '/')).toBeUndefined();
    expect(returnStateFor(undefined, '/pin')).toBeUndefined();
    expect(returnStateFor({ from: '/login' }, '/login')).toBeUndefined();
    expect(returnStateFor('junk', '//evil')).toBeUndefined();
  });
});

describe('afterUnlockPath', () => {
  it('goes to the carried address, otherwise Home', () => {
    expect(afterUnlockPath({ from: '/admin' })).toBe('/admin');
    expect(afterUnlockPath(null)).toBe('/');
    expect(afterUnlockPath(undefined)).toBe('/');
    expect(afterUnlockPath({ from: '/login' })).toBe('/');
    expect(afterUnlockPath({ from: '//evil.example' })).toBe('/');
  });
});
