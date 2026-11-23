import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DraftRecord, DraftStore, StoreResult } from '../../core/admin/draftStore';
import type { GithubFetch, GithubResponse } from '../../core/admin/github';
import { createCourseDraft } from '../../core/admin/model';
import { t, tf } from '../../core/i18n';
import { runLayoutCheck } from '../../core/ui';
import AdminScreen from './AdminScreen';
import { logout } from './session';

// P10 T10: layout guard for the Admin page at 360 / 768 / 1366 px, plus the keyboard order.
// jsdom has no layout engine (every box is 0 x 0), so this proves the wiring: the rows that could collide on a narrow
// screen carry `data-np-check`, and `runLayoutCheck` (the function the gallery runs in a real browser) reports nothing in
// every state. Real pixels are judged by the owner in T11. Light / dark and "tokens only" are enforced for every
// stylesheet by core/ui/styles.test.ts; motion tokens by admin.motion.test.ts.

const TITLES = ['ગણિત', 'A very long course title that keeps going and going to test wrapping on a narrow screen', 'x'.repeat(90)];

const repo: GithubFetch = () =>
  Promise.resolve<GithubResponse>({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        full_name: 'mynativepreparation/MyNativePreparation',
        default_branch: 'main',
        permissions: { push: true },
      }),
  });

function makeStore(): DraftStore {
  const rows = new Map<string, DraftRecord>();
  TITLES.forEach((title, i) => {
    const draft = createCourseDraft({ title, order: i + 1 });
    rows.set(draft.course.id, { id: draft.course.id, draft, deleted: false, updatedAt: 1 });
  });
  const answer = <T,>(value: T): Promise<StoreResult<T>> => Promise.resolve<StoreResult<T>>({ ok: true, value });
  return {
    list: () => answer([...rows.values()].sort((a, b) => a.draft.course.order - b.draft.course.order)),
    get: (id) => answer(rows.get(id)),
    put: (draft) => {
      const record: DraftRecord = { id: draft.course.id, draft, deleted: false, updatedAt: 2 };
      rows.set(record.id, record);
      return answer(record);
    },
    markDeleted: (id, deleted = true) => {
      const row = rows.get(id);
      if (row !== undefined) rows.set(id, { ...row, deleted });
      return answer(row !== undefined);
    },
    remove: (id) => {
      rows.delete(id);
      return answer(true as const);
    },
    close: () => undefined,
  };
}

const originalWidth = window.innerWidth;

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

async function openAdmin(): Promise<void> {
  render(<AdminScreen fetchImpl={repo} draftStore={makeStore()} />);
  fireEvent.change(screen.getByLabelText(t('admin.login.token')), { target: { value: 'github_pat_LAYOUT_token-123' } });
  fireEvent.click(screen.getByRole('button', { name: t('admin.login.submit') }));
  await screen.findByText(TITLES[0] ?? '');
}

const checked = (selector: string) => document.querySelectorAll(`${selector}[data-np-check]`);

beforeEach(() => {
  logout();
});

afterEach(() => {
  logout();
  setWindowWidth(originalWidth);
});

describe.each([360, 768, 1366])('admin layout at %i px', (width) => {
  it('login screen: nothing to collide, no sideways scroll', () => {
    setWindowWidth(width);
    render(<AdminScreen fetchImpl={repo} draftStore={makeStore()} />);
    expect(screen.getByLabelText(t('admin.login.token'))).toBeInTheDocument();
    expect(runLayoutCheck()).toEqual([]);
  });

  it('course list: one checked list with one row per course (long titles included) and a checked button row per course', async () => {
    setWindowWidth(width);
    await openAdmin();
    expect(checked('.np-courses__list')).toHaveLength(1);
    expect(checked('.np-courses__list')[0]?.children).toHaveLength(TITLES.length);
    expect(checked('.np-courses__actions')).toHaveLength(TITLES.length);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('delete confirm panel: its Yes / No row is checked and nothing collides', async () => {
    setWindowWidth(width);
    await openAdmin();
    fireEvent.click(screen.getByRole('button', { name: tf('admin.courses.deleteNamed', { title: TITLES[0] ?? '' }) }));
    expect(screen.getByRole('group', { name: tf('admin.courses.confirmLabel', { title: TITLES[0] ?? '' }) })).toBeInTheDocument();
    expect(checked('.np-courses__actions')).toHaveLength(TITLES.length);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('course window: the part switch and the bottom bar are checked and nothing collides', async () => {
    setWindowWidth(width);
    await openAdmin();
    fireEvent.click(screen.getByRole('button', { name: tf('admin.courses.editNamed', { title: TITLES[0] ?? '' }) }));
    await waitFor(() => expect(checked('.np-wbar__main')).toHaveLength(1));
    expect(checked('.np-workspace__parts')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('chapter list and its delete question: the list and the button rows are checked and nothing collides', async () => {
    setWindowWidth(width);
    await openAdmin();
    fireEvent.click(screen.getByRole('button', { name: tf('admin.courses.editNamed', { title: TITLES[0] ?? '' }) }));
    await waitFor(() => expect(checked('.np-wbar__main')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: t('admin.window.edit') }));
    expect(checked('.np-chapter-list__items')).toHaveLength(1);
    expect(checked('.np-chapter-list__actions')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);

    const lead = tf('admin.chapter.leadHeading', { name: t('admin.editor.overview') });
    fireEvent.click(screen.getByRole('button', { name: tf('admin.window.deleteNamed', { chapter: lead }) }));
    expect(screen.getByRole('group', { name: tf('admin.window.confirmLabel', { chapter: lead }) })).toBeInTheDocument();
    expect(checked('.np-chapter-list__actions')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('Test part: the bottom bar is still checked and nothing collides', async () => {
    setWindowWidth(width);
    await openAdmin();
    fireEvent.click(screen.getByRole('button', { name: tf('admin.courses.editNamed', { title: TITLES[0] ?? '' }) }));
    await waitFor(() => expect(checked('.np-wbar__main')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: t('admin.window.partTest') }));
    expect(checked('.np-wbar__main')).toHaveLength(1);
    expect(checked('.np-strip')).toHaveLength(0);
    expect(runLayoutCheck()).toEqual([]);
  });
});

describe('admin keyboard order', () => {
  const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
  const positiveTabindex = () =>
    [...document.querySelectorAll(FOCUSABLE)].filter((el) => Number(el.getAttribute('tabindex') ?? '0') > 0);

  it('login: the token box comes first, then the Log in button, and no tabindex above 0', () => {
    render(<AdminScreen fetchImpl={repo} draftStore={makeStore()} />);
    const order = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled') && !el.hidden);
    expect(order[0]).toBe(screen.getByLabelText(t('admin.login.token')));
    expect(order).toContain(screen.getByRole('button', { name: t('admin.login.submit') }));
    expect(order.indexOf(screen.getByRole('button', { name: t('admin.login.submit') }))).toBeGreaterThan(0);
    expect(positiveTabindex()).toEqual([]);
  });

  it('course list and course editor: no tabindex above 0, so the page keeps its natural reading order', async () => {
    await openAdmin();
    expect(positiveTabindex()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: tf('admin.courses.editNamed', { title: TITLES[0] ?? '' }) }));
    await waitFor(() => expect(checked('.np-wbar__main')).toHaveLength(1));
    expect(positiveTabindex()).toEqual([]);
  });

  it('course window: the part switch comes first, then the text toolbar, then the bottom bar', async () => {
    await openAdmin();
    fireEvent.click(screen.getByRole('button', { name: tf('admin.courses.editNamed', { title: TITLES[0] ?? '' }) }));
    await waitFor(() => expect(checked('.np-wbar__main')).toHaveLength(1));
    const order = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled') && !el.hidden);
    const at = (el: HTMLElement) => order.indexOf(el);
    const overviewPart = screen.getByRole('button', { name: t('admin.editor.overview') });
    const styleButton = screen.getByRole('button', { name: t('admin.toolbar.style') });
    const saveButton = screen.getByRole('button', { name: t('admin.course.save') });
    expect(at(overviewPart)).toBeGreaterThanOrEqual(0);
    expect(at(overviewPart)).toBeLessThan(at(styleButton));
    expect(at(styleButton)).toBeLessThan(at(saveButton));
  });
});
