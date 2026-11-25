import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftRecord, DraftStore, StoreResult } from '../../core/admin/draftStore';
import { createCourseDraft } from '../../core/admin/model';
import type { PublishOutcome } from '../../core/admin/publishRun';
import { t, tf } from '../../core/i18n';
import { runLayoutCheck } from '../../core/ui';
import { CourseManager } from './CourseManager';
import { login, logout } from './session';
import type { PublishRuns, UsePublishDeps } from './usePublish';

// P11 T5 step b: layout guard for the Publish / Unpublish screens at 360 px. jsdom has no layout engine, so (like AdminScreen.layout.test)
// this proves the wiring: every row that could collide on a narrow screen (the question's two buttons, the Close button of the result)
// carries `data-np-check`, long titles and long error lines are wrapped by the stylesheet, and `runLayoutCheck` (the function the gallery
// runs in a real browser) reports nothing in every state. Real pixels are judged by the owner in T11.

const LONG = 'A very long course title that keeps going and going to test wrapping on a narrow screen ' + 'x'.repeat(60);
const course = createCourseDraft({ title: LONG, order: 1 });

function storeWith(): DraftStore {
  const rows: DraftRecord[] = [{ id: course.course.id, draft: course, deleted: false, updatedAt: 1 }];
  const answer = <T,>(value: T): Promise<StoreResult<T>> => Promise.resolve<StoreResult<T>>({ ok: true, value });
  return {
    list: () => answer(rows),
    get: (id) => answer(rows.find((r) => r.id === id)),
    put: (draft) => answer({ id: draft.course.id, draft, deleted: false, updatedAt: 9 }),
    markDeleted: () => answer(true),
    remove: () => answer(true as const),
    close: () => undefined,
  };
}

function setup(outcome: PublishOutcome) {
  const publish = vi.fn<PublishRuns['publish']>(() => Promise.resolve(outcome));
  const unpublish = vi.fn<PublishRuns['unpublish']>(() => Promise.resolve(outcome));
  const deps: UsePublishDeps = { runs: { publish, unpublish }, tokenOf: () => 'ghp_test' };
  render(<CourseManager store={storeWith()} publishDeps={deps} />);
}

const checked = (selector: string) => document.querySelectorAll(`${selector} [data-np-check], ${selector}[data-np-check]`);

let width = 0;

beforeEach(() => {
  width = window.innerWidth;
  window.innerWidth = 360;
  act(() => {
    login('ghp_test', { fullName: 'mynativepreparation/MyNativePreparation', defaultBranch: 'main', branchOk: true });
  });
});

afterEach(() => {
  window.innerWidth = width;
  act(() => {
    logout();
  });
});

describe('Publish screens at 360 px', () => {
  it('the question: its two buttons are checked for collisions and nothing overflows', async () => {
    setup({ ok: true, unchanged: false, courseId: course.course.id, version: 1, commitSha: 'abcdef1234567' });
    await screen.findByText(LONG);
    fireEvent.click(screen.getByRole('button', { name: tf('admin.courses.publishNamed', { title: LONG }) }));
    expect(checked('.np-courses__confirm')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('the result: the Close button is checked and nothing overflows', async () => {
    setup({ ok: true, unchanged: false, courseId: course.course.id, version: 1, commitSha: 'abcdef1234567' });
    await screen.findByText(LONG);
    fireEvent.click(screen.getByRole('button', { name: tf('admin.courses.publishNamed', { title: LONG }) }));
    const group = screen.getByRole('group', { name: tf('admin.publish.confirmPublishLabel', { title: LONG }) });
    fireEvent.click(within(group).getByRole('button', { name: t('admin.publish.confirmPublishYes') }));
    await screen.findByText(t('admin.publish.done'));
    expect(checked('.np-courses__result')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('an error with three long problems: the list is wrapped, the Close button is checked, nothing overflows', async () => {
    const longProblem = 'The title is far too long to fit on one line of a narrow phone screen ' + 'y'.repeat(80);
    setup({ ok: false, code: 'invalid', errors: [longProblem, longProblem, longProblem, longProblem] });
    await screen.findByText(LONG);
    fireEvent.click(screen.getByRole('button', { name: tf('admin.courses.publishNamed', { title: LONG }) }));
    const group = screen.getByRole('group', { name: tf('admin.publish.confirmPublishLabel', { title: LONG }) });
    fireEvent.click(within(group).getByRole('button', { name: t('admin.publish.confirmPublishYes') }));
    await screen.findByText(t('admin.publish.err.invalid'));
    expect(document.querySelectorAll('.np-courses__problems li')).toHaveLength(3);
    expect(checked('.np-courses__result')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);
  });
});
