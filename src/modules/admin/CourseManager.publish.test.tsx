import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DraftRecord, DraftStore, StoreResult } from '../../core/admin/draftStore';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import { t, tf } from '../../core/i18n';
import { CourseManager } from './CourseManager';

// Owner layout (DECISIONS Q26): Add at the very top, the courses below it, each with Edit, Delete, Publish and Unpublish.
// Publish / Unpublish need GitHub (P11), so they are shown but OFF, with one note.

function storeWith(drafts: CourseDraft[], deleted: string[] = []): DraftStore {
  const rows: DraftRecord[] = drafts.map((d, i) => ({ id: d.course.id, draft: d, deleted: deleted.includes(d.course.title), updatedAt: i }));
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

const draftOf = (title: string, order: number): CourseDraft => createCourseDraft({ title, order });

describe('CourseManager: Add on top, Publish and Unpublish per course', () => {
  it('puts the Add button BEFORE the list of courses', async () => {
    render(<CourseManager store={storeWith([draftOf('ગણિત', 1), draftOf('English', 2)])} />);
    const list = await screen.findByRole('list');
    const add = screen.getByRole('button', { name: t('admin.courses.addAnother') });
    // DOCUMENT_POSITION_FOLLOWING (4): the list comes after the button.
    expect(add.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the Add button first even when there is no course yet', async () => {
    render(<CourseManager store={storeWith([])} />);
    const empty = await screen.findByText(t('admin.courses.empty'));
    const add = screen.getByRole('button', { name: t('admin.courses.add') });
    expect(add.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows Edit, Delete, Publish and Unpublish for every course, the last two OFF', async () => {
    render(<CourseManager store={storeWith([draftOf('ગણિત', 1), draftOf('English', 2)])} />);
    await screen.findByText('ગણિત');
    for (const title of ['ગણિત', 'English']) {
      expect(screen.getByRole('button', { name: tf('admin.courses.editNamed', { title }) })).toBeEnabled();
      expect(screen.getByRole('button', { name: tf('admin.courses.deleteNamed', { title }) })).toBeEnabled();
      expect(screen.getByRole('button', { name: tf('admin.courses.publishNamed', { title }) })).toBeDisabled();
      expect(screen.getByRole('button', { name: tf('admin.courses.unpublishNamed', { title }) })).toBeDisabled();
    }
  });

  it('explains once why Publish and Unpublish are off, and links the note to the buttons', async () => {
    render(<CourseManager store={storeWith([draftOf('A', 1), draftOf('B', 2)])} />);
    await screen.findByText('A');
    expect(screen.getAllByText(t('admin.courses.publishNote'))).toHaveLength(1);
    const publish = screen.getByRole('button', { name: tf('admin.courses.publishNamed', { title: 'A' }) });
    expect(publish).toHaveAccessibleDescription(t('admin.courses.publishNote'));
  });

  it('shows neither the buttons nor the note while there is no course', async () => {
    render(<CourseManager store={storeWith([])} />);
    await screen.findByText(t('admin.courses.empty'));
    expect(screen.queryByText(t('admin.courses.publishNote'))).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Publish / })).not.toBeInTheDocument();
  });

  it('a course marked as deleted shows only Restore', async () => {
    render(<CourseManager store={storeWith([draftOf('Gone', 1)], ['Gone'])} />);
    const row = (await screen.findByText('Gone')).closest('li') as HTMLElement;
    expect(within(row).getByRole('button', { name: tf('admin.courses.restoreNamed', { title: 'Gone' }) })).toBeEnabled();
    expect(within(row).queryByRole('button', { name: tf('admin.courses.publishNamed', { title: 'Gone' }) })).not.toBeInTheDocument();
  });
});
