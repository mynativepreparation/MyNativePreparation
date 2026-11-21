import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateRegistration } from './checkForUpdate';
import { getUpdateState, resetUpdateState, setUpdateState, subscribeUpdate } from './updateStore';
import { useUpdateState } from './useUpdateState';

// P09 T1: the update store and its hook.

const registration: UpdateRegistration = { installing: null, waiting: null, update: () => Promise.resolve() };

afterEach(() => {
  resetUpdateState();
});

describe('update store', () => {
  it('starts with no registration, nothing waiting and no apply function', () => {
    expect(getUpdateState()).toEqual({ registration: undefined, needRefresh: false, apply: undefined });
  });

  it('setUpdateState merges the given fields and keeps the others', () => {
    setUpdateState({ registration });
    setUpdateState({ needRefresh: true });
    expect(getUpdateState().registration).toBe(registration);
    expect(getUpdateState().needRefresh).toBe(true);
    expect(getUpdateState().apply).toBeUndefined();
  });

  it('listeners are told about every change and can stop listening', () => {
    const listener = vi.fn();
    const stop = subscribeUpdate(listener);
    setUpdateState({ needRefresh: true });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    setUpdateState({ needRefresh: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('every change makes a new state object (so React sees it), an unchanged read returns the same one', () => {
    const before = getUpdateState();
    expect(getUpdateState()).toBe(before);
    setUpdateState({ needRefresh: true });
    expect(getUpdateState()).not.toBe(before);
  });

  it('resetUpdateState goes back to the start state', () => {
    setUpdateState({ registration, needRefresh: true, apply: () => Promise.resolve() });
    resetUpdateState();
    expect(getUpdateState()).toEqual({ registration: undefined, needRefresh: false, apply: undefined });
  });
});

describe('useUpdateState', () => {
  it('returns the current state and re-renders when it changes', () => {
    const { result } = renderHook(() => useUpdateState());
    expect(result.current.needRefresh).toBe(false);
    act(() => {
      setUpdateState({ needRefresh: true, registration });
    });
    expect(result.current.needRefresh).toBe(true);
    expect(result.current.registration).toBe(registration);
  });

  it('stops listening when the component goes away', () => {
    const { unmount } = renderHook(() => useUpdateState());
    unmount();
    // No error and no warning when the state changes after unmount.
    expect(() => setUpdateState({ needRefresh: true })).not.toThrow();
  });
});
