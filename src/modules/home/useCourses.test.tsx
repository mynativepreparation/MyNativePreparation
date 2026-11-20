import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../../core/content/loader';
import { useCourses } from './useCourses';

// The loader is mocked: this file tests the HOOK. The real loading is covered in core/content/loader.test.ts.
const { manifestMock, courseMock } = vi.hoisted(() => ({ manifestMock: vi.fn(), courseMock: vi.fn() }));

vi.mock('../../core/content/loader', () => ({
  loadManifest: manifestMock,
  loadCourse: courseMock,
}));

const ID_A = 'crs_aaaaaaaa';
const ID_B = 'crs_bbbbbbbb';
const ID_C = 'crs_cccccccc';

function manifestWith(ids: string[]) {
  return {
    ok: true,
    manifest: {
      schemaVersion: 1,
      generatedAt: '2026-11-20T00:00:00Z',
      courses: ids.map((id) => ({ id, title: `Manifest ${id}`, version: 1, files: {} })),
    },
  };
}

function loaded(card: LoadedCourse['card']): LoadedCourse {
  return { card, overview: { state: 'empty' }, content: { state: 'empty' }, test: { state: 'empty' } };
}

const readyCard = (id: string, order: number): LoadedCourse =>
  loaded({ state: 'ready', value: { id, title: `Card ${id}`, order } });

beforeEach(() => {
  manifestMock.mockReset();
  courseMock.mockReset();
});

describe('useCourses', () => {
  it('starts in loading and then lists the courses sorted by order', async () => {
    manifestMock.mockResolvedValue(manifestWith([ID_A, ID_B]));
    courseMock.mockImplementation(async (id: string) => readyCard(id, id === ID_A ? 2 : 1));
    const { result } = renderHook(() => useCourses());
    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    const state = result.current.state;
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.courses.map((c) => c.id)).toEqual([ID_B, ID_A]);
    expect(state.courses[0]?.title).toBe(`Card ${ID_B}`);
  });

  it('keeps a course with a missing or broken card as a disabled entry (card null) after the good ones', async () => {
    manifestMock.mockResolvedValue(manifestWith([ID_A, ID_B, ID_C]));
    courseMock.mockImplementation(async (id: string) => {
      if (id === ID_A) return loaded({ state: 'empty' });
      if (id === ID_B) return loaded({ state: 'invalid', errors: ['bad'] });
      return readyCard(id, 5);
    });
    const { result } = renderHook(() => useCourses());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    const state = result.current.state;
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.courses.map((c) => c.id)).toEqual([ID_C, ID_A, ID_B]);
    expect(state.courses[1]).toEqual({ id: ID_A, title: `Manifest ${ID_A}`, card: null });
    expect(state.courses[2]?.card).toBeNull();
  });

  it('a course whose loading rejects is a disabled entry, never a crash', async () => {
    manifestMock.mockResolvedValue(manifestWith([ID_A]));
    courseMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCourses());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    const state = result.current.state;
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.courses).toEqual([{ id: ID_A, title: `Manifest ${ID_A}`, card: null }]);
  });

  it('reports the manifest problem (unavailable or invalid)', async () => {
    manifestMock.mockResolvedValue({ ok: false, reason: 'unavailable', errors: ['x'] });
    const first = renderHook(() => useCourses());
    await waitFor(() => expect(first.result.current.state).toEqual({ status: 'error', reason: 'unavailable' }));

    manifestMock.mockResolvedValue({ ok: false, reason: 'invalid', errors: ['x'] });
    const second = renderHook(() => useCourses());
    await waitFor(() => expect(second.result.current.state).toEqual({ status: 'error', reason: 'invalid' }));
  });

  it('a manifest with no courses is "empty"', async () => {
    manifestMock.mockResolvedValue(manifestWith([]));
    const { result } = renderHook(() => useCourses());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'empty' }));
    expect(courseMock).not.toHaveBeenCalled();
  });

  it('an exception from the manifest loader is an "unavailable" error, never thrown', async () => {
    manifestMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCourses());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', reason: 'unavailable' }));
  });

  it('retry goes back to loading and loads again', async () => {
    manifestMock.mockResolvedValueOnce({ ok: false, reason: 'unavailable', errors: ['x'] });
    const { result } = renderHook(() => useCourses());
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    manifestMock.mockResolvedValue(manifestWith([ID_A]));
    courseMock.mockResolvedValue(readyCard(ID_A, 1));
    act(() => result.current.retry());
    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(manifestMock).toHaveBeenCalledTimes(2);
  });
});
