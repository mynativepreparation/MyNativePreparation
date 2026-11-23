import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DraftRecord, DraftStore, StoreCode, StoreResult } from '../../core/admin/draftStore';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import { t, tf } from '../../core/i18n';
import { CourseManager } from './CourseManager';

// P10 T9(c): Delete (with a confirm panel) and Restore. Delete only marks the draft; the real delete is P11.
// Same small in-memory store as CourseManager.test.tsx, so these tests are about the screen, not about IndexedDB.
interface Fake {
  store: DraftStore;
  rows: Map<string, DraftRecord>;
  failWith: (code: StoreCode | null) => void;
}

function makeFake(drafts: CourseDraft[]): Fake {
  const rows = new Map<string, DraftRecord>();
  for (const d of drafts) rows.set(d.course.id, { id: d.course.id, draft: d, deleted: false, updatedAt: 1 });
  let failure: StoreCode | null = null;

  function answer<T>(value: T): Promise<StoreResult<T>> {
    return Promise.resolve<StoreResult<T>>(failure === null ? { ok: true, value } : { ok: false, code: failure });
  }

  const store: DraftStore = {
    list: () => answer([...rows.values()].sort((a, b) => a.draft.course.order - b.draft.course.order)),
    get: (id) => answer(rows.get(id)),
    put: (draft) => {
      const record: DraftRecord = { id: draft.course.id, draft, deleted: false, updatedAt: 2 };
      if (failure === null) rows.set(record.id, record);
      return answer(record);
    },
    markDeleted: (id, deleted = true) => {
      const row = rows.get(id);
      if (row !== undefined && failure === null) rows.set(id, { ...row, deleted });
      return answer(row !== undefined);
    },
    remove: (id) => {
      if (failure === null) rows.delete(id);
      return answer(true as const);
    },
    close: () => undefined,
  };

  return {
    store,
    rows,
    failWith: (code) => {
      failure = code;
    },
  };
}

const TITLE = 'ગણિત';
const button = (name: string) => screen.getByRole('button', { name });
const queryButton = (name: string) => screen.queryByRole('button', { name });

function setup(deleted = false) {
  const draft = createCourseDraft({ title: TITLE, order: 1 });
  const fake = makeFake([draft]);
  if (deleted) fake.rows.set(draft.course.id, { id: draft.course.id, draft, deleted: true, updatedAt: 1 });
  render(<CourseManager store={fake.store} />);
  return { fake, id: draft.course.id };
}

describe('CourseManager delete and restore', () => {
  it('Delete opens a confirm panel for that course and marks nothing yet', async () => {
    const { fake, id } = setup();
    fireEvent.click(await screen.findByRole('button', { name: tf('admin.courses.deleteNamed', { title: TITLE }) }));
    expect(screen.getByRole('group', { name: tf('admin.courses.confirmLabel', { title: TITLE }) })).toBeInTheDocument();
    expect(screen.getByText(tf('admin.courses.confirmText', { title: TITLE }))).toBeInTheDocument();
    expect(queryButton(tf('admin.courses.editNamed', { title: TITLE }))).not.toBeInTheDocument();
    expect(fake.rows.get(id)).toMatchObject({ deleted: false });
  });

  it('"No, keep it" closes the panel and the course stays as it was', async () => {
    const { fake, id } = setup();
    fireEvent.click(await screen.findByRole('button', { name: tf('admin.courses.deleteNamed', { title: TITLE }) }));
    fireEvent.click(button(t('admin.courses.confirmNo')));
    expect(screen.queryByRole('group', { name: tf('admin.courses.confirmLabel', { title: TITLE }) })).not.toBeInTheDocument();
    expect(button(tf('admin.courses.editNamed', { title: TITLE }))).toBeEnabled();
    expect(fake.rows.get(id)).toMatchObject({ deleted: false });
  });

  it('"Yes, delete" marks the draft, tells the owner, and offers Restore instead of Edit', async () => {
    const { fake, id } = setup();
    fireEvent.click(await screen.findByRole('button', { name: tf('admin.courses.deleteNamed', { title: TITLE }) }));
    fireEvent.click(button(t('admin.courses.confirmYes')));
    expect(await screen.findByText(tf('admin.courses.deletedDone', { title: TITLE }))).toBeInTheDocument();
    expect(fake.rows.get(id)).toMatchObject({ deleted: true });
    expect(await screen.findByText(t('admin.courses.deletedMark'))).toBeInTheDocument(); // after the list reloads
    expect(await screen.findByRole('button', { name: tf('admin.courses.restoreNamed', { title: TITLE }) })).toBeEnabled();
    expect(queryButton(tf('admin.courses.editNamed', { title: TITLE }))).not.toBeInTheDocument();
    expect(queryButton(tf('admin.courses.deleteNamed', { title: TITLE }))).not.toBeInTheDocument();
  });

  it('a course that was already marked shows the mark and Restore, and Restore brings it back', async () => {
    const { fake, id } = setup(true);
    expect(await screen.findByText(t('admin.courses.deletedMark'))).toBeInTheDocument();
    fireEvent.click(button(tf('admin.courses.restoreNamed', { title: TITLE })));
    expect(await screen.findByText(tf('admin.courses.restoredDone', { title: TITLE }))).toBeInTheDocument();
    expect(fake.rows.get(id)).toMatchObject({ deleted: false });
    await waitFor(() => expect(screen.queryByText(t('admin.courses.deletedMark'))).not.toBeInTheDocument()); // after the list reloads
    expect(await screen.findByRole('button', { name: tf('admin.courses.editNamed', { title: TITLE }) })).toBeEnabled();
    expect(button(tf('admin.courses.deleteNamed', { title: TITLE }))).toBeEnabled();
  });

  it('a storage problem shows a friendly text and the course is not marked', async () => {
    const { fake, id } = setup();
    fireEvent.click(await screen.findByRole('button', { name: tf('admin.courses.deleteNamed', { title: TITLE }) }));
    fake.failWith('storage_unavailable');
    fireEvent.click(button(t('admin.courses.confirmYes')));
    expect(await screen.findByText(t('admin.err.storage'))).toBeInTheDocument();
    await waitFor(() => expect(fake.rows.get(id)).toMatchObject({ deleted: false }));
    expect(screen.queryByText(tf('admin.courses.deletedDone', { title: TITLE }))).not.toBeInTheDocument();
  });
});
