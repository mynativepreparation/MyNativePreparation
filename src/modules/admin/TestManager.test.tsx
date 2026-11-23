import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import type { Question, Test } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { TestManager, type TestManagerProps } from './TestManager';

// P10 T11s (DECISIONS Q27 1-2): the list of the tests of ONE course. The screen only shows the draft it gets and reports clicks.

const COURSE = 'ગણિત';

const question = (n: string): Question => ({
  id: `qst-${n.repeat(8)}`,
  text: 'Question?',
  options: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
});

const testOf = (n: string, questions: Question[], title?: string): Test => ({
  id: `tst-${n.repeat(8)}`,
  questionsPerGame: 1,
  questions,
  ...(title === undefined ? {} : { title }),
});

const T1 = testOf('a', [], 'પ્રકરણ ૧ ની કસોટી');
const T2 = testOf('b', [question('a')]);
const T3 = testOf('c', [question('a'), question('b'), question('c')], 'Third');

const draftWith = (tests: Test[], title = COURSE): CourseDraft => ({ ...createCourseDraft({ title }), tests });

function setup(over: Partial<TestManagerProps> = {}) {
  const handlers = { onBack: vi.fn(), onOpenTest: vi.fn(), onDeleteTest: vi.fn() };
  render(<TestManager draft={draftWith([T1, T2, T3])} {...handlers} {...over} />);
  return handlers;
}

const button = (name: string) => screen.getByRole('button', { name });
const queryButton = (name: string) => screen.queryByRole('button', { name });
const editName = (name: string) => tf('admin.tests.editNamed', { name });
const deleteName = (name: string) => tf('admin.tests.deleteNamed', { name });
const NAME2 = tf('admin.tests.untitled', { n: 2 });

describe('TestManager: the list', () => {
  it('has the course name in the heading and Generate new test BEFORE the list', () => {
    setup();
    expect(screen.getByRole('heading', { level: 2, name: tf('admin.tests.title', { title: COURSE }) })).toBeInTheDocument();
    const generate = button(t('admin.tests.generate'));
    const list = screen.getByRole('list');
    expect(generate.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('names a course without a title in the heading', () => {
    setup({ draft: draftWith([], '  ') });
    expect(screen.getByRole('heading', { level: 2, name: tf('admin.tests.title', { title: t('admin.courses.untitled') }) })).toBeInTheDocument();
  });

  it('lists every test with its name and number of questions, in order', () => {
    setup();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByText('પ્રકરણ ૧ ની કસોટી')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText(t('admin.tests.questionsNone'))).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText(NAME2)).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText(t('admin.tests.questionsOne'))).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('Third')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText(tf('admin.tests.questionsMany', { count: 3 }))).toBeInTheDocument();
  });

  it('says so when the course has no test, and shows no list', () => {
    setup({ draft: draftWith([]) });
    expect(screen.getByText(t('admin.tests.empty'))).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    expect(button(t('admin.tests.generate'))).toBeEnabled();
  });

  it('shows a status note and a friendly error line', () => {
    setup({ note: 'A note', error: 'admin.err.storage' });
    expect(screen.getByRole('status')).toHaveTextContent('A note');
    expect(screen.getByRole('alert')).toHaveTextContent(t('admin.err.storage'));
  });
});

describe('TestManager: buttons', () => {
  it('Back, Generate new test and Edit report what was pressed', () => {
    const h = setup();
    fireEvent.click(button(t('admin.tests.back')));
    expect(h.onBack).toHaveBeenCalledTimes(1);
    fireEvent.click(button(t('admin.tests.generate')));
    expect(h.onOpenTest).toHaveBeenLastCalledWith(null);
    fireEvent.click(button(editName(NAME2)));
    expect(h.onOpenTest).toHaveBeenLastCalledWith(T2.id);
    expect(h.onDeleteTest).not.toHaveBeenCalled();
  });

  it('Delete asks first: nothing is deleted until the person says yes', () => {
    const h = setup();
    fireEvent.click(button(deleteName(NAME2)));
    const panel = screen.getByRole('group', { name: tf('admin.tests.confirmLabel', { name: NAME2 }) });
    expect(within(panel).getByText(tf('admin.tests.confirmText', { name: NAME2 }))).toBeInTheDocument();
    expect(h.onDeleteTest).not.toHaveBeenCalled();
    // only that row asks; the other rows keep their buttons
    expect(queryButton(editName(NAME2))).toBeNull();
    expect(button(editName('Third'))).toBeInTheDocument();
    // the safe answer has the focus
    expect(button(t('admin.tests.confirmNo'))).toHaveFocus();
  });

  it('"No, keep it" closes the question and deletes nothing', () => {
    const h = setup();
    fireEvent.click(button(deleteName(NAME2)));
    fireEvent.click(button(t('admin.tests.confirmNo')));
    expect(h.onDeleteTest).not.toHaveBeenCalled();
    expect(screen.queryByRole('group')).toBeNull();
    expect(button(deleteName(NAME2))).toBeInTheDocument();
  });

  it('"Yes, delete it" reports the id of that test once', () => {
    const h = setup();
    fireEvent.click(button(deleteName(NAME2)));
    fireEvent.click(button(t('admin.tests.confirmYes')));
    expect(h.onDeleteTest).toHaveBeenCalledTimes(1);
    expect(h.onDeleteTest).toHaveBeenCalledWith(T2.id);
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('disables every button while busy', () => {
    setup({ busy: true });
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });
});
