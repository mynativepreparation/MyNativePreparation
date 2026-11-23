import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DraftRecord, DraftStore, StoreCode, StoreResult } from '../../core/admin/draftStore';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import type { Question, Test } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { CourseManager } from './CourseManager';

// P10 T11t(c): Generate new test / Edit in the test list open the real test window, and Save in it stores the course draft.
// Same small in-memory store as CourseManager.tests.test.tsx, so these tests are about the screens, not about IndexedDB.
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
const QUESTION: Question = { id: 'qst-aaaaaaa1', text: 'First?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 };
const T1: Test = { id: 'tst-aaaaaaaa', title: 'પ્રકરણ ૧', questionsPerGame: 1, questions: [QUESTION] };

const button = (name: string) => screen.getByRole('button', { name });
const typeInto = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const questionBox = (n = 1) => screen.getByLabelText(tf('admin.testEditor.questionText', { n }));

function setup() {
  const draft: CourseDraft = { ...createCourseDraft({ title: TITLE, order: 1 }), tests: [T1] };
  const fake = makeFake([draft]);
  render(<CourseManager store={fake.store} />);
  return { fake, id: draft.course.id };
}

async function openTests() {
  fireEvent.click(await screen.findByRole('button', { name: tf('admin.courses.generateNamed', { title: TITLE }) }));
  await screen.findByRole('heading', { level: 2, name: tf('admin.tests.title', { title: TITLE }) });
}

/** Writes one complete question into question 1 of the open window. */
function writeQuestion(text: string) {
  typeInto(tf('admin.testEditor.questionText', { n: 1 }), text);
  [1, 2, 3, 4].forEach((k) => typeInto(tf('admin.testEditor.optionNamed', { n: 1, k }), `${text} ${k}`));
}

const savedNote = (n: number) => tf('admin.testWindow.saved', { name: tf('admin.tests.untitled', { n }) });

describe('CourseManager: the test window', () => {
  it('Generate new test opens an empty window of that course', async () => {
    setup();
    await openTests();
    fireEvent.click(button(t('admin.tests.generate')));
    expect(questionBox()).toHaveValue('');
    expect(screen.getByRole('button', { name: t('admin.testWindow.publish') })).toBeDisabled();
  });

  it('Save stores the course with the new test, says so, and keeps the window open', async () => {
    const { fake, id } = setup();
    await openTests();
    fireEvent.click(button(t('admin.tests.generate')));
    writeQuestion('New?');
    fireEvent.click(button(t('admin.testWindow.save')));

    expect(await screen.findByText(savedNote(2))).toBeInTheDocument();
    const tests = fake.rows.get(id)?.draft.tests ?? [];
    expect(tests.map((x) => x.id).slice(0, 1)).toEqual([T1.id]);
    expect(tests.map((x) => x.questions.map((q) => q.text))).toEqual([['First?'], ['New?']]);
    expect(questionBox()).toHaveValue('New?');
  });

  it('a second Save of the same new test replaces it instead of adding a third test', async () => {
    const { fake, id } = setup();
    await openTests();
    fireEvent.click(button(t('admin.tests.generate')));
    writeQuestion('New?');
    fireEvent.click(button(t('admin.testWindow.save')));
    await screen.findByText(savedNote(2));

    typeInto(tf('admin.testEditor.questionText', { n: 1 }), 'New, changed?');
    fireEvent.click(button(t('admin.testWindow.save')));
    await waitFor(() => expect(fake.rows.get(id)?.draft.tests.map((x) => x.questions.map((q) => q.text))).toEqual([['First?'], ['New, changed?']]));
  });

  it('Edit opens that test; Save replaces it in place and keeps its id', async () => {
    const { fake, id } = setup();
    await openTests();
    fireEvent.click(button(tf('admin.tests.editNamed', { name: 'પ્રકરણ ૧' })));
    expect(questionBox()).toHaveValue('First?');
    typeInto(tf('admin.testEditor.questionText', { n: 1 }), 'First, changed?');
    fireEvent.click(button(t('admin.testWindow.save')));
    expect(await screen.findByText(tf('admin.testWindow.saved', { name: 'પ્રકરણ ૧' }))).toBeInTheDocument();
    expect(fake.rows.get(id)?.draft.tests.map((x) => [x.id, x.questions.map((q) => q.text)])).toEqual([[T1.id, ['First, changed?']]]);
  });

  it('Back after a Save shows the new test in the list', async () => {
    setup();
    await openTests();
    fireEvent.click(button(t('admin.tests.generate')));
    writeQuestion('New?');
    fireEvent.click(button(t('admin.testWindow.save')));
    await screen.findByText(savedNote(2));
    fireEvent.click(button(t('admin.testWindow.back')));
    expect(screen.getByText(tf('admin.tests.untitled', { n: 2 }))).toBeInTheDocument();
    expect(screen.getByText('પ્રકરણ ૧')).toBeInTheDocument();
  });

  it('a Save the window refuses (no questions) never reaches the store', async () => {
    const { fake, id } = setup();
    await openTests();
    fireEvent.click(button(t('admin.tests.generate')));
    fireEvent.click(button(t('admin.testWindow.save')));
    expect(screen.getByText(t('admin.testWindow.noQuestions'))).toBeInTheDocument();
    expect(fake.rows.get(id)?.draft.tests.map((x) => x.id)).toEqual([T1.id]);
  });

  it('a storage problem shows the friendly text and keeps what was typed; a later Save works', async () => {
    const { fake, id } = setup();
    await openTests();
    fireEvent.click(button(t('admin.tests.generate')));
    writeQuestion('New?');
    fake.failWith('storage_unavailable');
    fireEvent.click(button(t('admin.testWindow.save')));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('admin.err.storage'));
    expect(questionBox()).toHaveValue('New?');
    expect(fake.rows.get(id)?.draft.tests).toHaveLength(1);

    fake.failWith(null);
    fireEvent.click(button(t('admin.testWindow.save')));
    expect(await screen.findByText(savedNote(2))).toBeInTheDocument();
    expect(fake.rows.get(id)?.draft.tests).toHaveLength(2);
  });

  it('opening Generate new test again starts with an empty window (the old one is gone)', async () => {
    setup();
    await openTests();
    fireEvent.click(button(t('admin.tests.generate')));
    writeQuestion('New?');
    fireEvent.click(button(t('admin.testWindow.back')));
    fireEvent.click(button(t('admin.tests.generate')));
    expect(questionBox()).toHaveValue('');
  });
});
