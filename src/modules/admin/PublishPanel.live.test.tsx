import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { waitUntilLive } from '../../core/admin/liveCheck';
import { t } from '../../core/i18n';
import { runLayoutCheck } from '../../core/ui';
import { PublishResult } from './PublishPanel';
import type { PublishState } from './usePublish';

// P11 T9 step b: the "Live now" line under the result line, at 360 / 768 / 1366 px. jsdom has no layout engine, so (like
// PublishPanel.layout.test) this proves the wiring: the line is a plain `np-courses__text` paragraph (no new colour, no alert) that sits
// right under the result line, and `runLayoutCheck` (the function the gallery runs in a real browser) reports nothing in every state.
// The live check is faked; the real network is never touched.

type Wait = typeof waitUntilLive;
type Answer = Awaited<ReturnType<Wait>>;

const A = 'crs-aaaaaaaa';
const PUBLISHED: PublishState = { phase: 'done', kind: 'publish', courseId: A, unchanged: false, version: 2, commitSha: 'abcdef1234567' };
const UNPUBLISHED: PublishState = { phase: 'done', kind: 'unpublish', courseId: A, unchanged: false, version: 2, commitSha: '1234567abcdef' };
const NOTHING_SENT: PublishState = { phase: 'done', kind: 'publish', courseId: A, unchanged: true, version: 2, commitSha: null };
const FAILED: PublishState = { phase: 'failed', kind: 'publish', courseId: A, code: 'conflict', errors: [] };

const CHECKING = t('admin.publish.live.checking');
const LIVE = t('admin.publish.live.live');
const WAITING = t('admin.publish.live.waiting');

/** Shows the result with a fake check that answers at once (`Answer`) or never (`'never'`). */
function show(state: PublishState, answer: Answer | 'never') {
  const wait = vi.fn<Wait>(() => (answer === 'never' ? new Promise<Answer>(() => undefined) : Promise.resolve(answer)));
  render(<PublishResult state={state} onClose={() => undefined} liveDeps={{ wait }} />);
  return wait;
}

let width = 0;

beforeEach(() => {
  width = window.innerWidth;
});

afterEach(() => {
  window.innerWidth = width;
});

describe.each([360, 768, 1366])('the live line at %i px', (px) => {
  beforeEach(() => {
    window.innerWidth = px;
  });

  it('checking: a calm line right under the result line, nothing overflows', async () => {
    show(PUBLISHED, 'never');
    const line = await screen.findByText(CHECKING);
    expect(line.tagName).toBe('P');
    expect(line.className).toBe('np-courses__text');
    expect(screen.getByText(t('admin.publish.done')).nextElementSibling).toBe(line);
    expect(line.closest('.np-courses__result')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(runLayoutCheck()).toEqual([]);
  });

  it('live: the line says "Live now" and replaces the checking line', async () => {
    show(PUBLISHED, 'live');
    const line = await screen.findByText(LIVE);
    expect(line.className).toBe('np-courses__text');
    expect(screen.queryByText(CHECKING)).toBeNull();
    expect(screen.queryByText(WAITING)).toBeNull();
    expect(runLayoutCheck()).toEqual([]);
  });

  it('waiting: the long line wraps and nothing overflows', async () => {
    show(PUBLISHED, 'waiting');
    const line = await screen.findByText(WAITING);
    expect(line.className).toBe('np-courses__text');
    expect(screen.queryByText(CHECKING)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(runLayoutCheck()).toEqual([]);
  });
});

describe('the live line, other states', () => {
  it('an unpublish gets the line too and waits for the removed goal', async () => {
    const wait = show(UNPUBLISHED, 'live');
    await screen.findByText(LIVE);
    expect(screen.getByText(t('admin.publish.unpublished')).nextElementSibling).toBe(screen.getByText(LIVE));
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait.mock.calls.map(([options]) => options.goal)).toEqual([{ kind: 'removed', courseId: A }]);
  });

  it('nothing was sent: no live line and no wait', () => {
    const wait = show(NOTHING_SENT, 'live');
    expect(screen.getByText(t('admin.publish.unchanged'))).not.toBeNull();
    for (const text of [CHECKING, LIVE, WAITING]) expect(screen.queryByText(text)).toBeNull();
    expect(wait).not.toHaveBeenCalled();
  });

  it('an error: the alert stays an alert, no live line and no wait', () => {
    const wait = show(FAILED, 'live');
    expect(screen.getByRole('alert')).not.toBeNull();
    for (const text of [CHECKING, LIVE, WAITING]) expect(screen.queryByText(text)).toBeNull();
    expect(wait).not.toHaveBeenCalled();
  });
});
