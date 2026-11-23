import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DraftRecord, DraftStore, StoreCode, StoreResult } from '../../core/admin/draftStore';
import { createCourseDraft, newTextBlock, type CourseDraft } from '../../core/admin/model';
import { t, tf } from '../../core/i18n';
import { CourseManager } from './CourseManager';

// A small in-memory store with the same shape as the real one, so these tests are about the screens, not about IndexedDB.
interface Fake {
  store: DraftStore;
  rows: Map<string, DraftRecord>;
  failWith: (code: StoreCode | null) => void;
}

function makeFake(drafts: CourseDraft[] = []): Fake {
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

const draftOf = (title: string, order: number): CourseDraft => createCourseDraft({ title, order });
const courses = (fake: Fake) => [...fake.rows.values()].map((r) => r.draft.course);

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const clickButton = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
// The course details (title, description, order, cover) sit in the Settings panel of the window's toolbar (P10 T11n C3).
const openSettings = () => clickButton(t('admin.toolbar.settings'));

describe('CourseManager list', () => {
  it('starts with an empty state and an "Add a course" button', async () => {
    const fake = makeFake();
    render(<CourseManager store={fake.store} />);
    expect(await screen.findByText(t('admin.courses.empty'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: t('admin.courses.title') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.courses.add') })).toBeEnabled();
  });

  it('lists the saved courses with their order, and offers "Add another course"', async () => {
    const fake = makeFake([draftOf('ગણિત', 1), draftOf('English', 2)]);
    render(<CourseManager store={fake.store} />);
    expect(await screen.findByText('ગણિત')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText(tf('admin.courses.order', { order: '2' }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: tf('admin.courses.editNamed', { title: 'ગણિત' }) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.courses.addAnother') })).toBeInTheDocument();
    expect(screen.queryByText(t('admin.courses.empty'))).not.toBeInTheDocument();
  });

  it('shows a name for a course that has no title yet', async () => {
    const fake = makeFake([draftOf('', 1)]);
    render(<CourseManager store={fake.store} />);
    expect(await screen.findByText(t('admin.courses.untitled'))).toBeInTheDocument();
  });

  it('shows a friendly message, not a raw error, when the drafts cannot be loaded', async () => {
    const fake = makeFake();
    fake.failWith('storage_unavailable');
    render(<CourseManager store={fake.store} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(t('admin.err.storage'));
    expect(screen.queryByText(t('admin.courses.empty'))).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.courses.add') })).toBeEnabled();
  });
});

describe('CourseManager add and edit', () => {
  it('"Add another course" opens a new form with the next order, and Cancel stores nothing', async () => {
    const fake = makeFake([draftOf('A', 1), draftOf('B', 4)]);
    render(<CourseManager store={fake.store} />);
    await screen.findByText('A');
    clickButton(t('admin.courses.addAnother'));
    expect(screen.getByRole('heading', { level: 2, name: t('admin.course.newTitle') })).toBeInTheDocument();
    openSettings();
    expect(screen.getByLabelText(t('admin.course.fieldTitle'))).toHaveValue('');
    expect(screen.getByLabelText(t('admin.course.fieldOrder'))).toHaveValue('5');
    clickButton(t('admin.course.cancel'));
    expect(await screen.findByRole('heading', { level: 2, name: t('admin.courses.title') })).toBeInTheDocument();
    expect(fake.rows.size).toBe(2);
  });

  it('saves a new course with title, description and order, then shows it in the list', async () => {
    const fake = makeFake();
    render(<CourseManager store={fake.store} />);
    await screen.findByText(t('admin.courses.empty'));
    clickButton(t('admin.courses.add'));
    openSettings();
    expect(screen.getByLabelText(t('admin.course.fieldOrder'))).toHaveValue('1');
    fill(t('admin.course.fieldTitle'), '  Maths  ');
    fill(t('admin.course.fieldDescription'), 'Short text');
    fill(t('admin.course.fieldOrder'), '5');
    clickButton(t('admin.course.save'));
    expect(await screen.findByText('Maths')).toBeInTheDocument();
    expect(screen.getByText(t('admin.course.saved'))).toBeInTheDocument();
    expect(courses(fake)).toEqual([{ id: expect.any(String) as string, title: 'Maths', description: 'Short text', order: 5 }]);
  });

  it('does not store an empty description', async () => {
    const fake = makeFake();
    render(<CourseManager store={fake.store} />);
    await screen.findByText(t('admin.courses.empty'));
    clickButton(t('admin.courses.add'));
    openSettings();
    fill(t('admin.course.fieldTitle'), 'Maths');
    fill(t('admin.course.fieldDescription'), '   ');
    clickButton(t('admin.course.save'));
    await screen.findByText(t('admin.course.saved'));
    expect(courses(fake).map((c) => 'description' in c)).toEqual([false]);
  });

  it('edits a saved course and keeps its id, cover and blocks', async () => {
    const old = draftOf('Old', 2);
    old.course.description = 'Old text';
    old.course.cover = 'images/c.webp';
    old.images.push({ path: 'images/c.webp', mime: 'image/webp', bytes: new Uint8Array([1, 2, 3]) }); // the cover picture must be in the draft (Save checks it)
    old.content.push(newTextBlock('text', 'Body'));
    const fake = makeFake([old]);
    render(<CourseManager store={fake.store} />);
    await screen.findByText('Old');
    clickButton(tf('admin.courses.editNamed', { title: 'Old' }));
    expect(screen.getByRole('heading', { level: 2, name: t('admin.course.editTitle') })).toBeInTheDocument();
    openSettings();
    expect(screen.getByLabelText(t('admin.course.fieldTitle'))).toHaveValue('Old');
    expect(screen.getByLabelText(t('admin.course.fieldDescription'))).toHaveValue('Old text');
    expect(screen.getByLabelText(t('admin.course.fieldOrder'))).toHaveValue('2');
    fill(t('admin.course.fieldTitle'), 'New');
    clickButton(t('admin.course.save'));
    expect(await screen.findByText('New')).toBeInTheDocument();
    const row = fake.rows.get(old.course.id);
    expect(row?.draft.course).toEqual({
      id: old.course.id,
      title: 'New',
      description: 'Old text',
      cover: 'images/c.webp',
      order: 2,
    });
    expect(row?.draft.content).toEqual(old.content);
    expect(fake.rows.size).toBe(1);
  });
});

describe('CourseManager checks and errors', () => {
  it('asks for a title and a whole-number order, and stores nothing until both are fine', async () => {
    const fake = makeFake();
    render(<CourseManager store={fake.store} />);
    await screen.findByText(t('admin.courses.empty'));
    clickButton(t('admin.courses.add'));
    openSettings();
    fill(t('admin.course.fieldOrder'), 'abc');
    clickButton(t('admin.course.save'));
    expect(screen.getAllByText(t('admin.course.err.title')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(t('admin.course.err.order')).length).toBeGreaterThan(0);
    // The friendly list under the window says what to fix, even when the Settings panel is closed.
    expect(screen.getByText(t('admin.problem.title'))).toBeInTheDocument();
    expect(fake.rows.size).toBe(0);

    fill(t('admin.course.fieldTitle'), 'Maths');
    fill(t('admin.course.fieldOrder'), '1.5');
    clickButton(t('admin.course.save'));
    expect(screen.queryByText(t('admin.course.err.title'))).not.toBeInTheDocument();
    expect(screen.getByText(t('admin.course.err.order'))).toBeInTheDocument();
    expect(fake.rows.size).toBe(0);

    fill(t('admin.course.fieldOrder'), '-2');
    clickButton(t('admin.course.save'));
    await screen.findByText(t('admin.course.saved'));
    expect(courses(fake).map((c) => c.order)).toEqual([-2]);
  });

  it('keeps what was typed and shows a friendly message when the save fails', async () => {
    const fake = makeFake();
    render(<CourseManager store={fake.store} />);
    await screen.findByText(t('admin.courses.empty'));
    clickButton(t('admin.courses.add'));
    openSettings();
    fill(t('admin.course.fieldTitle'), 'Maths');
    fake.failWith('quota_exceeded');
    clickButton(t('admin.course.save'));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('admin.err.quota'));
    expect(screen.getByLabelText(t('admin.course.fieldTitle'))).toHaveValue('Maths');
    expect(fake.rows.size).toBe(0);

    fake.failWith(null);
    await waitFor(() => expect(screen.getByRole('button', { name: t('admin.course.save') })).toBeEnabled());
    clickButton(t('admin.course.save'));
    expect(await screen.findByText(t('admin.course.saved'))).toBeInTheDocument();
    expect(fake.rows.size).toBe(1);
  });
});
