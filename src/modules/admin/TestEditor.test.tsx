import { useState } from 'react';
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WebpEncoder } from '../../core/admin/image';
import { createTest, newQuestion, type DraftImage } from '../../core/admin/model';
import type { Test } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { TestEditor } from './TestEditor';

// The test editor is controlled: a small parent keeps `{test, images}` and reports every change.

const noEncoder: WebpEncoder = () => Promise.resolve(null);
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface State {
  test: Test | null;
  images: DraftImage[];
}

function pngBytes(seed: number): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set(PNG_HEAD);
  bytes[12] = seed;
  return bytes;
}

function Harness({ initial, onState }: { initial: State; onState: (s: State) => void }) {
  const [state, setState] = useState(initial);
  return (
    <TestEditor
      test={state.test}
      images={state.images}
      encodeWebp={noEncoder}
      onChange={(test, images) => {
        const next = { test, images };
        onState(next);
        setState(next);
      }}
    />
  );
}

function setup(initial: State = { test: null, images: [] }) {
  const seen = { latest: initial, calls: 0 };
  render(
    <Harness
      initial={initial}
      onState={(s) => {
        seen.latest = s;
        seen.calls += 1;
      }}
    />,
  );
  return seen;
}

const questionsOf = (seen: { latest: State }) => (seen.latest.test?.questions ?? []).map((q) => q);

function twoQuestions(): Test {
  return {
    ...createTest(3),
    questions: [
      newQuestion('First?', ['a1', 'a2', 'a3', 'a4'], 0),
      newQuestion('Second?', ['b1', 'b2', 'b3', 'b4'], 2, 'Because'),
    ],
  };
}

const field = (label: string) => screen.getByLabelText(label);
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('TestEditor', () => {
  it('starts empty with 5 questions per game', () => {
    setup();
    expect(screen.getByRole('heading', { level: 3, name: t('admin.testEditor.heading') })).toBeInTheDocument();
    expect(screen.getByText(t('admin.testEditor.empty'))).toBeInTheDocument();
    expect(field(t('admin.testEditor.perGame'))).toHaveValue('5');
  });

  it('appends questions pasted into the import box and shows them', () => {
    const seen = setup();
    const box = screen.getByLabelText(t('admin.test.pasteLabel'));
    const event = createEvent.paste(box);
    const text = '1. Capital?\nA) a\nB) **b**\nC) c\nD) d';
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => (type === 'text/plain' ? text : '') } });
    fireEvent(box, event);
    expect(seen.calls).toBe(1);
    expect(questionsOf(seen).map((q) => q.text)).toEqual(['Capital?']);
    expect(questionsOf(seen).map((q) => q.correctIndex)).toEqual([1]);
    expect(seen.latest.test?.questionsPerGame).toBe(5);
    expect(screen.getByText(tf('admin.testEditor.count', { count: 1 }))).toBeInTheDocument();
    expect(field(tf('admin.testEditor.questionText', { n: 1 }))).toHaveValue('Capital?');
  });

  it('keeps the same test id and appends after existing questions', () => {
    const initial = twoQuestions();
    const seen = setup({ test: initial, images: [] });
    const box = screen.getByLabelText(t('admin.test.pasteLabel'));
    const event = createEvent.paste(box);
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type: string) => (type === 'text/plain' ? '1. Third?\nA) c1\nB) **c2**\nC) c3\nD) c4' : '') },
    });
    fireEvent(box, event);
    expect(seen.latest.test?.id).toBe(initial.id);
    expect(questionsOf(seen).map((q) => q.text)).toEqual(['First?', 'Second?', 'Third?']);
    expect(questionsOf(seen).slice(0, 2).map((q) => q.id)).toEqual(initial.questions.map((q) => q.id));
  });

  it('takes a whole number of questions per game and refuses a bad one', () => {
    const seen = setup({ test: twoQuestions(), images: [] });
    fireEvent.change(field(t('admin.testEditor.perGame')), { target: { value: '10' } });
    expect(seen.latest.test?.questionsPerGame).toBe(10);
    const calls = seen.calls;
    fireEvent.change(field(t('admin.testEditor.perGame')), { target: { value: '0' } });
    expect(screen.getByText(t('admin.testEditor.perGameErr'))).toBeInTheDocument();
    fireEvent.change(field(t('admin.testEditor.perGame')), { target: { value: '' } });
    fireEvent.change(field(t('admin.testEditor.perGame')), { target: { value: '2.5' } });
    expect(seen.calls).toBe(calls);
    expect(seen.latest.test?.questionsPerGame).toBe(10);
    fireEvent.change(field(t('admin.testEditor.perGame')), { target: { value: '4' } });
    expect(screen.queryByText(t('admin.testEditor.perGameErr'))).toBeNull();
    expect(seen.latest.test?.questionsPerGame).toBe(4);
  });

  it('sets and clears the title', () => {
    const seen = setup({ test: twoQuestions(), images: [] });
    fireEvent.change(field(t('admin.testEditor.titleLabel')), { target: { value: 'Quiz 1' } });
    expect(seen.latest.test?.title).toBe('Quiz 1');
    fireEvent.change(field(t('admin.testEditor.titleLabel')), { target: { value: '' } });
    expect(seen.latest.test !== null && 'title' in seen.latest.test).toBe(false);
  });

  it('edits the text, an option, the correct answer and the explanation of a question', () => {
    const seen = setup({ test: twoQuestions(), images: [] });
    fireEvent.change(field(tf('admin.testEditor.questionText', { n: 1 })), { target: { value: 'First changed?' } });
    fireEvent.change(field(tf('admin.testEditor.optionNamed', { n: 1, k: 3 })), { target: { value: 'a3 changed' } });
    fireEvent.click(field(tf('admin.testEditor.correctNamed', { n: 1, k: 4 })));
    fireEvent.change(field(tf('admin.testEditor.explanationNamed', { n: 1 })), { target: { value: 'Why' } });
    const [first, second] = [questionsOf(seen).slice(0, 1), questionsOf(seen).slice(1)];
    expect(first.map((q) => q.text)).toEqual(['First changed?']);
    expect(first.map((q) => q.options)).toEqual([['a1', 'a2', 'a3 changed', 'a4']]);
    expect(first.map((q) => q.correctIndex)).toEqual([3]);
    expect(first.map((q) => q.explanation)).toEqual(['Why']);
    expect(second.map((q) => q.text)).toEqual(['Second?']);
    expect(second.map((q) => q.correctIndex)).toEqual([2]);
  });

  it('removes the explanation key when the box is emptied', () => {
    const seen = setup({ test: twoQuestions(), images: [] });
    fireEvent.change(field(tf('admin.testEditor.explanationNamed', { n: 2 })), { target: { value: '' } });
    expect(questionsOf(seen).slice(1).map((q) => 'explanation' in q)).toEqual([false]);
  });

  it('shows the current correct answer as the checked radio', () => {
    setup({ test: twoQuestions(), images: [] });
    expect(field(tf('admin.testEditor.correctNamed', { n: 1, k: 1 }))).toBeChecked();
    expect(field(tf('admin.testEditor.correctNamed', { n: 2, k: 3 }))).toBeChecked();
    expect(field(tf('admin.testEditor.correctNamed', { n: 2, k: 1 }))).not.toBeChecked();
  });

  it('moves and removes questions without changing their ids', () => {
    const initial = twoQuestions();
    const seen = setup({ test: initial, images: [] });
    click(tf('admin.testEditor.downNamed', { n: 1 }));
    expect(questionsOf(seen).map((q) => q.text)).toEqual(['Second?', 'First?']);
    expect(questionsOf(seen).map((q) => q.id)).toEqual(initial.questions.map((q) => q.id).reverse());
    click(tf('admin.testEditor.removeNamed', { n: 1 }));
    expect(questionsOf(seen).map((q) => q.text)).toEqual(['First?']);
    expect(screen.getByRole('button', { name: tf('admin.testEditor.upNamed', { n: 1 }) })).toBeDisabled();
    expect(screen.getByRole('button', { name: tf('admin.testEditor.downNamed', { n: 1 }) })).toBeDisabled();
  });

  it('takes a test picture and removes it again', async () => {
    const seen = setup({ test: twoQuestions(), images: [] });
    const bytes = pngBytes(1);
    const file = new File([bytes.slice()], 'test.png');
    Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(bytes.slice().buffer) });
    fireEvent.change(field(t('admin.testEditor.imageFile')), { target: { files: [file] } });
    await waitFor(() => expect(seen.latest.images).toHaveLength(1));
    expect([seen.latest.test?.image]).toEqual(seen.latest.images.map((i) => i.path));
    click(t('admin.testEditor.imageRemove'));
    expect(seen.latest.test !== null && 'image' in seen.latest.test).toBe(false);
    expect(seen.latest.images).toHaveLength(1);
    expect(screen.getByText(t('admin.testEditor.imageNone'))).toBeInTheDocument();
  });

  it('refuses a file that is not a picture', async () => {
    const seen = setup({ test: twoQuestions(), images: [] });
    const bytes = new TextEncoder().encode('%PDF-1.7');
    const file = new File([bytes.slice()], 'a.pdf');
    Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(bytes.slice().buffer) });
    fireEvent.change(field(t('admin.testEditor.imageFile')), { target: { files: [file] } });
    expect(await screen.findByText(t('admin.blocks.err.unsupported'))).toBeInTheDocument();
    expect(seen.calls).toBe(0);
  });

  it('says so when the test picture is not in the draft', () => {
    setup({ test: { ...twoQuestions(), image: 'images/9.png' }, images: [] });
    expect(screen.getByText(tf('admin.testEditor.imageMissing', { path: 'images/9.png' }))).toBeInTheDocument();
  });
});
