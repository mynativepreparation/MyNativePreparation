import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../../core/content/loader';
import { useCourses } from './useCourses';

// useCourses().refresh (P11 T8 step c): load the list again WITHOUT the loading skeleton, because the content changed on the server.
// The loader is mocked, like in useCourses.test.tsx.
const { manifestMock, courseMock } = vi.hoisted(() => ({ manifestMock: vi.fn(), courseMock: vi.fn() }));

vi.mock('../../core/content/loader', () => ({
  loadManifest: manifestMock,
  loadCourse: courseMock,
}));

const ID_A = 'crs_aaaaaaaa';
const ID_B = 'crs_bbbbbbbb';

function manifestWith(ids: string[]) {
  return {
    ok: true,
    manifest: {
      schemaVersion: 1,
      generatedAt: '2026-11-23T00:00:00Z',
      courses: ids.map((id) => ({ id, title: `Manifest ${id}`, version: 1, files: {} })),
    },
  };
}

const readyCard = (id: string, order: number): LoadedCourse => ({
  card: { state: 'ready', value: { id, title: `Card ${id}`, order } },
  overview: { state: 'empty' },
  content: { state: 'empty' },
  test: { state: 'empty' },
});

const idsOf = (state: ReturnType<typeof useCourses>['state']) => (state.status === 'ready' ? state.courses.map((c) => c.id) : []);

async function readyHook(ids: string[]) {
  manifestMock.mockResolvedValue(manifestWith(ids));
  const view = renderHook(() => useCourses());
  await waitFor(() => expect(view.result.current.state.status).toBe('ready'));
  return view;
}

beforeEach(() => {
  manifestMock.mockReset();
  courseMock.mockReset();
  courseMock.mockImplementation(async (id: string) => readyCard(id, id === ID_A ? 1 : 2));
});

describe('useCourses: refresh', () => {
  it('shows the new list without going back to loading, and answers true', async () => {
    const { result } = await readyHook([ID_A]);
    manifestMock.mockResolvedValue(manifestWith([ID_A, ID_B]));
    const holder: { pending: Promise<boolean> | null } = { pending: null };
    act(() => {
      holder.pending = result.current.refresh();
    });
    // while the new list is on its way the old one stays on screen
    expect(result.current.state.status).toBe('ready');
    expect(idsOf(result.current.state)).toEqual([ID_A]);
    await act(async () => {
      expect(await holder.pending).toBe(true);
    });
    expect(idsOf(result.current.state)).toEqual([ID_A, ID_B]);
  });

  it('an empty manifest is a real change: the list becomes empty and the answer is true', async () => {
    const { result } = await readyHook([ID_A]);
    manifestMock.mockResolvedValue(manifestWith([]));
    await act(async () => {
      expect(await result.current.refresh()).toBe(true);
    });
    expect(result.current.state).toEqual({ status: 'empty' });
  });

  it('a manifest that cannot be read keeps the list on screen and answers false', async () => {
    const { result } = await readyHook([ID_A]);
    manifestMock.mockResolvedValue({ ok: false, reason: 'unavailable', errors: ['offline'] });
    await act(async () => {
      expect(await result.current.refresh()).toBe(false);
    });
    expect(idsOf(result.current.state)).toEqual([ID_A]);
  });

  it('a broken manifest keeps the list on screen and answers false', async () => {
    const { result } = await readyHook([ID_A]);
    manifestMock.mockResolvedValue({ ok: false, reason: 'invalid', errors: ['bad'] });
    await act(async () => {
      expect(await result.current.refresh()).toBe(false);
    });
    expect(idsOf(result.current.state)).toEqual([ID_A]);
  });

  it('a loader that throws keeps the list on screen and answers false', async () => {
    const { result } = await readyHook([ID_A]);
    manifestMock.mockRejectedValue(new Error('boom'));
    await act(async () => {
      expect(await result.current.refresh()).toBe(false);
    });
    expect(idsOf(result.current.state)).toEqual([ID_A]);
  });

  it('after the screen was left it answers false and changes nothing', async () => {
    const { result, unmount } = await readyHook([ID_A]);
    const { refresh } = result.current;
    unmount();
    manifestMock.mockResolvedValue(manifestWith([ID_A, ID_B]));
    await expect(refresh()).resolves.toBe(false);
  });

  it('is the same function on every render', async () => {
    const { result, rerender } = await readyHook([ID_A]);
    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
  });
});
