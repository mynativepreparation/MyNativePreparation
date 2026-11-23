import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DraftRecord, DraftStore, StoreCode, StoreResult } from '../../core/admin/draftStore';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import type { Test } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { CourseManager } from './CourseManager';

// P10 T11s (DECISIONS Q27 1-2): the Generate test button on every course row opens the test list of that course.
// Same small in-memory store as CourseManager.delete.test.tsx, so these tests are about the screens, not about IndexedDB.
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
const T1: Test = { id: 'tst-aaaaaaaa', title: 'પ્રકરણ ૧', questionsPerGame: 1, questions: [] };
const T2: Test = { id: 'tst-bbbbbbbb', questionsPerGame: 1, questions: [] };

const button = (name: string) => screen.getByRole('button', { name });
const queryButton = (name: string) => screen.queryByRole('button', { name });
const generateName = (title = TITLE) => tf('admin.courses.generateNamed', { title });

function setup(options: { tests?: Test[]; deleted?: boolean } = {}) {
  const draft: CourseDraft = { ...createCourseDraft({ title: TITLE, order: 1 }), tests: options.tests ?? [T1, T2] };
  const fake = makeFake([draft]);
  if (options.deleted === true) fake.rows.set(draft.course.id, { id: draft.course.id, draft, deleted: true, updatedAt: 1 });
  render(<CourseManager store={fake.store} />);
  return { fake, id: draft.course.id };
}

async function openTests() {
  fireEvent.click(await screen.findByRole('button', { name: generateName() }));
  return screen.findByRole('heading', { level: 2, name: tf('admin.tests.title', { title: TITLE }) });
}

describe('CourseManager: Generate test', () => {
  it('every course row has a Generate test button next to Edit and Delete', async () => {
    setup();
    expect(await screen.findByRole('button', { name: generateName() })).toBeEnabled();
    expect(button(tf('admin.courses.editNamed', { title: TITLE }))).toBeInTheDocument();
    expect(button(tf('admin.courses.deleteNamed', { title: TITLE }))).toBeInTheDocument();
  });

  it('opens the tests of THAT course, with Generate new test on top and the saved tests below', async () => {
    setup();
    await openTests();
    expect(button(t('admin.tests.generate'))).toBeInTheDocument();
    expect(screen.getByText('પ્રકરણ ૧')).toBeInTheDocument();
    expect(screen.getByText(tf('admin.tests.untitled', { n: 2 }))).toBeInTheDocument();
    // the course list is not shown at the same time
    expect(queryButton(tf('admin.courses.editNamed', { title: TITLE }))).toBeNull();
  });

  it('Back returns to the course list', async () => {
    setup();
    await openTests();
    fireEvent.click(button(t('admin.tests.back')));
    expect(await screen.findByRole('button', { name: generateName() })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: tf('admin.tests.title', { title: TITLE }) })).toBeNull();
  });

  it('a course with no test shows the empty text', async () => {
    setup({ tests: [] });
    await openTests();
    expect(screen.getByText(t('admin.tests.empty'))).toBeInTheDocument();
  });

  it('a course marked as deleted has Restore only, no Generate test', async () => {
    setup({ deleted: true });
    await screen.findByRole('button', { name: tf('admin.courses.restoreNamed', { title: TITLE }) });
    expect(queryButton(generateName())).toBeNull();
  });

  it('Generate new test and Edit open the test window; Back returns to the list and changes nothing', async () => {
    const { fake, id } = setup();
    await openTests();
    fireEvent.click(button(t('admin.tests.generate')));
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 1 }))).toHaveValue('');
    fireEvent.click(button(t('admin.testWindow.back')));
    expect(button(t('admin.tests.generate'))).toBeInTheDocument();
    fireEvent.click(button(tf('admin.tests.editNamed', { name: 'પ્રકરણ ૧' })));
    expect(screen.getByText(tf('admin.testWindow.heading', { name: 'પ્રકરણ ૧' }))).toBeInTheDocument();
    fireEvent.click(button(t('admin.testWindow.back')));
    expect(button(t('admin.tests.generate'))).toBeInTheDocument();
    expect(fake.rows.get(id)?.draft.tests.map((x) => x.id)).toEqual([T1.id, T2.id]);
  });
});

describe('CourseManager: delete a test', () => {
  it('asks first, then removes only that test from the saved draft and says so', async () => {
    const { fake, id } = setup();
    await openTests();
    const name2 = tf('admin.tests.untitled', { n: 2 });
    fireEvent.click(button(tf('admin.tests.deleteNamed', { name: name2 })));
    expect(fake.rows.get(id)?.draft.tests).toHaveLength(2); // nothing yet
    fireEvent.click(button(t('admin.tests.confirmYes')));
    expect(await screen.findByText(tf('admin.tests.deletedDone', { name: name2 }))).toBeInTheDocument();
    expect(fake.rows.get(id)?.draft.tests.map((x) => x.id)).toEqual([T1.id]);
    expect(screen.queryByText(name2)).toBeNull();
    expect(screen.getByText('પ્રકરણ ૧')).toBeInTheDocument();
  });

  it('deleting the last test leaves the empty text', async () => {
    const { fake, id } = setup({ tests: [T1] });
    await openTests();
    fireEvent.click(button(tf('admin.tests.deleteNamed', { name: 'પ્રકરણ ૧' })));
    fireEvent.click(button(t('admin.tests.confirmYes')));
    expect(await screen.findByText(t('admin.tests.empty'))).toBeInTheDocument();
    expect(fake.rows.get(id)?.draft.tests).toEqual([]);
  });

  it('keeps the test and shows a friendly message when the storage fails', async () => {
    const { fake, id } = setup();
    await openTests();
    fake.failWith('storage_unavailable');
    fireEvent.click(button(tf('admin.tests.deleteNamed', { name: 'પ્રકરણ ૧' })));
    fireEvent.click(button(t('admin.tests.confirmYes')));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('admin.err.storage'));
    expect(screen.getByText('પ્રકરણ ૧')).toBeInTheDocument();
    fake.failWith(null);
    expect(fake.rows.get(id)?.draft.tests).toHaveLength(2);
  });

  it('after a delete, Back shows the course list again', async () => {
    setup();
    await openTests();
    fireEvent.click(button(tf('admin.tests.deleteNamed', { name: 'પ્રકરણ ૧' })));
    fireEvent.click(button(t('admin.tests.confirmYes')));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    fireEvent.click(button(t('admin.tests.back')));
    expect(await screen.findByRole('button', { name: generateName() })).toBeInTheDocument();
  });
});
