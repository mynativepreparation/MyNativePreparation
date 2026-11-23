import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import type { Question, Test } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { testName } from './testName';
import { TestWindow } from './TestWindow';

// P10 T11t(b) (DECISIONS Q27): the test window shows ONE question at a time; Save checks and hands the whole draft to the parent.
// Labels come from the same i18n keys the component uses, so the tests do not depend on the wording.

function question(id: string, text: string, correctIndex: 0 | 1 | 2 | 3 = 0): Question {
  return { id, text, options: [`${text} a`, `${text} b`, `${text} c`, `${text} d`], correctIndex };
}

const Q1 = question('qst-aaaaaaa1', 'First?');
const Q2 = question('qst-aaaaaaa2', 'Second?', 2);
const SAVED: Test = { id: 'tst-aaaaaaaa', title: 'Old title', questionsPerGame: 2, questions: [Q1, Q2] };

const emptyDraft = (): CourseDraft => createCourseDraft({ title: 'ગણિત' });
const draftWith = (...tests: Test[]): CourseDraft => ({ ...emptyDraft(), tests });

function show(draft: CourseDraft, testId: string | null, extra: Partial<Parameters<typeof TestWindow>[0]> = {}) {
  const onSave = vi.fn();
  const onBack = vi.fn();
  render(<TestWindow draft={draft} testId={testId} onSave={onSave} onBack={onBack} {...extra} />);
  return { onSave, onBack };
}

/** Like a real parent: it keeps the draft it is given back, so a second Save sees the first one. */
function Harness({ initial, onSaved }: { initial: CourseDraft; onSaved: (draft: CourseDraft, saved: Test) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <TestWindow
      draft={draft}
      testId={null}
      onSave={(next, saved) => {
        setDraft(next);
        onSaved(next, saved);
      }}
      onBack={() => undefined}
    />
  );
}

const typeInto = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const position = (n: number, total: number) => tf('admin.testWindow.position', { n, total });

/** The arguments of the last onSave call (fails loudly when Save did not reach the parent). */
function lastSave(onSave: { mock: { calls: unknown[][] } }): [CourseDraft, Test] {
  const calls = onSave.mock.calls as Array<[CourseDraft, Test]>;
  const call = calls[calls.length - 1];
  if (call === undefined) throw new Error('onSave was not called');
  return call;
}

/** Fills question `n` completely: text, four options, which one is right. */
function fillQuestion(n: number, text: string, correct: 1 | 2 | 3 | 4 = 1) {
  typeInto(tf('admin.testEditor.questionText', { n }), text);
  (['a', 'b', 'c', 'd'] as const).forEach((letter, i) => typeInto(tf('admin.testEditor.optionNamed', { n, k: i + 1 }), `${text} ${letter}`));
  fireEvent.click(screen.getByLabelText(tf('admin.testEditor.correctNamed', { n, k: correct })));
}

function paste(data: Record<string, string>) {
  const box = screen.getByLabelText(t('admin.test.pasteLabel'));
  const event = createEvent.paste(box);
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => data[type] ?? '' } });
  fireEvent(box, event);
}

describe('TestWindow: a new test', () => {
  it('starts with one empty question, a name and the position line', () => {
    show(emptyDraft(), null);
    expect(screen.getByText(tf('admin.testWindow.heading', { name: testName({ title: '' }, 0) }))).toBeInTheDocument();
    expect(screen.getByText(position(1, 1))).toBeInTheDocument();
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 1 }))).toHaveValue('');
    [1, 2, 3, 4].forEach((k) => expect(screen.getByLabelText(tf('admin.testEditor.optionNamed', { n: 1, k }))).toHaveValue(''));
    [1, 2, 3, 4].forEach((k) => expect(screen.getByLabelText(tf('admin.testEditor.correctNamed', { n: 1, k }))).toHaveAttribute('type', 'radio'));
  });

  it('Save with nothing written says so and stores nothing', () => {
    const { onSave } = show(emptyDraft(), null);
    press(t('admin.testWindow.save'));
    expect(screen.getByText(t('admin.testWindow.noQuestions'))).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Save hands over the course draft with the new test (title trimmed, right answer, number per game)', () => {
    const { onSave } = show(emptyDraft(), null);
    typeInto(t('admin.testEditor.titleLabel'), '  પ્રકરણ ૧  ');
    typeInto(t('admin.testEditor.perGame'), '5');
    fillQuestion(1, 'Capital?', 3);
    typeInto(tf('admin.testEditor.explanationNamed', { n: 1 }), 'Because.');
    press(t('admin.testWindow.save'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [draft, saved] = lastSave(onSave);
    expect(draft.tests).toEqual([saved]);
    expect(saved.title).toBe('પ્રકરણ ૧');
    expect(saved.questionsPerGame).toBe(5);
    expect(saved.questions.map((q) => [q.text, q.options, q.correctIndex, q.explanation])).toEqual([
      ['Capital?', ['Capital? a', 'Capital? b', 'Capital? c', 'Capital? d'], 2, 'Because.'],
    ]);
  });

  it('a second Save replaces the same test instead of adding another', () => {
    const saves: Array<[CourseDraft, Test]> = [];
    render(<Harness initial={emptyDraft()} onSaved={(d, s) => saves.push([d, s])} />);
    fillQuestion(1, 'One?');
    press(t('admin.testWindow.save'));
    fillQuestion(1, 'One again?');
    press(t('admin.testWindow.save'));
    expect(saves.map(([d]) => d.tests.length)).toEqual([1, 1]);
    expect(saves.map(([, s]) => s.id)[0]).toBe(saves.map(([, s]) => s.id)[1]);
    expect(saves.map(([d]) => d.tests.map((x) => x.questions.map((q) => q.text)))).toEqual([[['One?']], [['One again?']]]);
  });

  it('keeps the other tests of the course untouched', () => {
    const other: Test = { id: 'tst-bbbbbbbb', questionsPerGame: 1, questions: [Q1] };
    const { onSave } = show(draftWith(other), null);
    fillQuestion(1, 'New?');
    press(t('admin.testWindow.save'));
    const [draft] = lastSave(onSave);
    expect(draft.tests.map((x) => x.id).slice(0, 1)).toEqual(['tst-bbbbbbbb']);
    expect(draft.tests).toHaveLength(2);
  });

  it('drops the untouched placeholder question when it saves', () => {
    const { onSave } = show(emptyDraft(), null);
    fillQuestion(1, 'Real?');
    press(t('admin.testWindow.addMore'));
    expect(screen.getByText(position(2, 2))).toBeInTheDocument();
    press(t('admin.testWindow.save'));
    const [, saved] = lastSave(onSave);
    expect(saved.questions.map((q) => q.text)).toEqual(['Real?']);
  });

  it('a question with a missing option is not saved and nothing reaches the parent', () => {
    const { onSave } = show(emptyDraft(), null);
    typeInto(tf('admin.testEditor.questionText', { n: 1 }), 'Half?');
    typeInto(tf('admin.testEditor.optionNamed', { n: 1, k: 1 }), 'only one');
    press(t('admin.testWindow.save'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each(['0', 'abc', '', '2.5', '-1'])('the number per game "%s" shows its error and blocks Save', (value) => {
    const { onSave } = show(emptyDraft(), null);
    fillQuestion(1, 'Fine?');
    typeInto(t('admin.testEditor.perGame'), value);
    expect(screen.getByText(t('admin.testEditor.perGameErr'))).toBeInTheDocument();
    press(t('admin.testWindow.save'));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('TestWindow: more questions and the list', () => {
  it('Add more question opens question 2; pressing it again on an empty one stays there', () => {
    show(emptyDraft(), null);
    fillQuestion(1, 'One?');
    press(t('admin.testWindow.addMore'));
    expect(screen.getByText(position(2, 2))).toBeInTheDocument();
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 2 }))).toHaveValue('');
    press(t('admin.testWindow.addMore'));
    expect(screen.getByText(position(2, 2))).toBeInTheDocument();
  });

  it('Edit opens the list, a row opens its question, Close hides the list', () => {
    show(draftWith(SAVED), SAVED.id);
    expect(screen.getByText(position(1, 2))).toBeInTheDocument();
    press(t('admin.testWindow.edit'));
    const list = screen.getByRole('list', { name: t('admin.testWindow.listLabel') });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(list).getByRole('button', { name: tf('admin.testWindow.openNamed', { n: 2 }) }));
    expect(screen.getByText(position(2, 2))).toBeInTheDocument();
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 2 }))).toHaveValue('Second?');
    expect(screen.queryByRole('list', { name: t('admin.testWindow.listLabel') })).not.toBeInTheDocument();

    press(t('admin.testWindow.edit'));
    press(t('admin.testWindow.editClose'));
    expect(screen.queryByRole('list', { name: t('admin.testWindow.listLabel') })).not.toBeInTheDocument();
  });

  it('shows the first words of every question in the list', () => {
    show(draftWith(SAVED), SAVED.id);
    press(t('admin.testWindow.edit'));
    expect(screen.getByText(tf('admin.testWindow.rowText', { n: 1, text: 'First?' }))).toBeInTheDocument();
    expect(screen.getByText(tf('admin.testWindow.rowText', { n: 2, text: 'Second?' }))).toBeInTheDocument();
  });

  it('moves a question down and keeps the one on screen in view', () => {
    show(draftWith(SAVED), SAVED.id);
    press(t('admin.testWindow.edit'));
    fireEvent.click(screen.getByRole('button', { name: tf('admin.testEditor.downNamed', { n: 1 }) }));
    expect(screen.getByText(tf('admin.testWindow.rowText', { n: 1, text: 'Second?' }))).toBeInTheDocument();
    expect(screen.getByText(tf('admin.testWindow.rowText', { n: 2, text: 'First?' }))).toBeInTheDocument();
    // Question 1 was on screen; it moved to place 2 and is still the one shown.
    expect(screen.getByText(position(2, 2))).toBeInTheDocument();
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 2 }))).toHaveValue('First?');
  });

  it('the first Up and the last Down are off', () => {
    show(draftWith(SAVED), SAVED.id);
    press(t('admin.testWindow.edit'));
    expect(screen.getByRole('button', { name: tf('admin.testEditor.upNamed', { n: 1 }) })).toBeDisabled();
    expect(screen.getByRole('button', { name: tf('admin.testEditor.downNamed', { n: 2 }) })).toBeDisabled();
  });

  it('removes a question and tells the person it only counts after Save', () => {
    const { onSave } = show(draftWith(SAVED), SAVED.id);
    press(t('admin.testWindow.edit'));
    fireEvent.click(screen.getByRole('button', { name: tf('admin.testEditor.removeNamed', { n: 1 }) }));
    expect(screen.getByText(tf('admin.testWindow.removed', { n: 1 }))).toBeInTheDocument();
    expect(screen.getByText(position(1, 1))).toBeInTheDocument();
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 1 }))).toHaveValue('Second?');
    expect(onSave).not.toHaveBeenCalled();
    press(t('admin.testWindow.save'));
    const [, saved] = lastSave(onSave);
    expect(saved.questions.map((q) => q.id)).toEqual([Q2.id]);
  });

  it('removing the last question leaves one empty question to write in', () => {
    const single: Test = { ...SAVED, questions: [Q1] };
    show(draftWith(single), single.id);
    press(t('admin.testWindow.edit'));
    fireEvent.click(screen.getByRole('button', { name: tf('admin.testEditor.removeNamed', { n: 1 }) }));
    expect(screen.getByText(position(1, 1))).toBeInTheDocument();
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 1 }))).toHaveValue('');
  });
});

describe('TestWindow: an existing test', () => {
  it('opens on question 1 with the saved title, number and texts', () => {
    show(draftWith(SAVED), SAVED.id);
    expect(screen.getByLabelText(t('admin.testEditor.titleLabel'))).toHaveValue('Old title');
    expect(screen.getByLabelText(t('admin.testEditor.perGame'))).toHaveValue('2');
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 1 }))).toHaveValue('First?');
    expect(screen.getByLabelText(tf('admin.testEditor.correctNamed', { n: 1, k: 1 }))).toBeChecked();
    expect(screen.getByText(tf('admin.testWindow.heading', { name: 'Old title' }))).toBeInTheDocument();
  });

  it('Save replaces that test in place and keeps its id', () => {
    const other: Test = { id: 'tst-bbbbbbbb', questionsPerGame: 1, questions: [Q1] };
    const { onSave } = show(draftWith(other, SAVED), SAVED.id);
    typeInto(tf('admin.testEditor.questionText', { n: 1 }), 'First, changed?');
    press(t('admin.testWindow.save'));
    const [draft, saved] = lastSave(onSave);
    expect(draft.tests.map((x) => x.id)).toEqual(['tst-bbbbbbbb', SAVED.id]);
    expect(saved.id).toBe(SAVED.id);
    expect(saved.questions.map((q) => q.text)).toEqual(['First, changed?', 'Second?']);
  });

  it('an unknown test id opens a new test instead of crashing', () => {
    show(draftWith(SAVED), 'tst-zzzzzzzz');
    expect(screen.getByText(position(1, 1))).toBeInTheDocument();
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 1 }))).toHaveValue('');
  });
});

describe('TestWindow: pasted questions', () => {
  const GOOD = '1. Capital of India?\nA) Mumbai\nB) **Delhi**\nC) Pune\nD) Surat';

  it('replaces the empty placeholder with the pasted question and says how many were added', () => {
    show(emptyDraft(), null);
    paste({ 'text/plain': GOOD });
    expect(screen.getByText(tf('admin.testWindow.added', { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(position(1, 1))).toBeInTheDocument();
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 1 }))).toHaveValue('Capital of India?');
    expect(screen.getByLabelText(tf('admin.testEditor.correctNamed', { n: 1, k: 2 }))).toBeChecked();
  });

  it('adds after the questions that are already there and shows the first new one', () => {
    show(draftWith(SAVED), SAVED.id);
    paste({ 'text/plain': GOOD });
    expect(screen.getByText(position(3, 3))).toBeInTheDocument();
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 3 }))).toHaveValue('Capital of India?');
  });
});

describe('TestWindow: the bottom bar', () => {
  it('Publish is last and off, with its note linked to it', () => {
    show(emptyDraft(), null);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    const publish = screen.getByRole('button', { name: t('admin.testWindow.publish') });
    expect(publish).toBeDisabled();
    expect(publish.getAttribute('aria-describedby')).not.toBeNull();
    expect(screen.getByText(t('admin.testWindow.publishNote'))).toBeInTheDocument();
    const bar = [t('admin.testWindow.save'), t('admin.testWindow.edit'), t('admin.testWindow.addMore'), t('admin.testWindow.publish')];
    expect(buttons.filter((text) => bar.includes(text))).toEqual(bar);
  });

  it('Back calls onBack', () => {
    const { onBack } = show(emptyDraft(), null);
    press(t('admin.testWindow.back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('while busy every control is off', () => {
    show(draftWith(SAVED), SAVED.id, { busy: true });
    [t('admin.testWindow.back'), t('admin.testWindow.save'), t('admin.testWindow.edit'), t('admin.testWindow.addMore')].forEach((name) =>
      expect(screen.getByRole('button', { name })).toBeDisabled(),
    );
    expect(screen.getByLabelText(tf('admin.testEditor.questionText', { n: 1 }))).toBeDisabled();
  });

  it('shows the parent note and a friendly storage error', () => {
    show(emptyDraft(), null, { note: 'Saved it.', error: 'admin.err.storage' });
    expect(screen.getByText('Saved it.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(t('admin.err.storage'));
  });
});
