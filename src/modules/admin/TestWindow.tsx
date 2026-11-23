import { useId, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ListOrdered, Plus, Save, Trash2, Upload } from 'lucide-react';
import { createTest, type CourseDraft } from '../../core/admin/model';
import type { Problem } from '../../core/admin/problems';
import {
  blankQuestion,
  isBlankQuestion,
  moveQuestion,
  removeQuestion,
  replaceQuestion,
  testProblems,
  withCorrect,
  withExplanation,
  withOption,
  withText,
  withoutBlankQuestions,
  type OptionIndex,
} from '../../core/admin/testWindow';
import type { Question, Test } from '../../core/content/types';
import { t, tf, type TextKey } from '../../core/i18n';
import { Button, Card, TextField } from '../../core/ui';
import { ProblemSummary } from './ProblemSummary';
import { TestImport } from './TestImport';
import { testName } from './testName';
import './TestWindow.css';

// The test window (P10 T11t, DECISIONS Q27): ONE question at a time, a single-line question box, exactly four option lines each
// with a small "correct" radio, an optional explanation. Bottom bar: Save, Edit (the question list: open, move, remove),
// Add more question, and Publish LAST, which stays off with a note until the next phase (it writes to GitHub).
//  - Pasted / loaded questions (`TestImport`, `**` or Word bold marks the right option) are added after the existing ones.
//  - Save drops untouched placeholder questions, checks the test with the same friendly list the course window uses, and then
//    hands the whole course draft to the parent. Storing is the parent's job; this window stays open so more can be added.
// The window keeps its own copy of the test while it is open; the parent only gives it the course and the id.

export interface TestWindowProps {
  /** The course the test belongs to (as stored in the browser). */
  draft: CourseDraft;
  /** The test to edit; `null` = a new test (its id is made once, so a second Save replaces it instead of adding another). */
  testId: string | null;
  busy?: boolean;
  /** A status line from the parent, for example "The test is saved". */
  note?: string | null;
  /** A friendly storage problem. */
  error?: TextKey | null;
  /** Called with the whole course draft (this test added or replaced) and the saved test. */
  onSave: (draft: CourseDraft, saved: Test) => void;
  onBack: () => void;
}

const OPTION_INDEXES: readonly OptionIndex[] = [0, 1, 2, 3];
const PUBLISH_NOTE_ID = 'np-test-window-publish-note';

export function TestWindow({ draft, testId, busy = false, note = null, error = null, onSave, onBack }: TestWindowProps) {
  const baseId = useId();
  const [start] = useState<Test>(() => draft.tests.find((test) => test.id === testId) ?? createTest());
  const [title, setTitle] = useState(start.title ?? '');
  const [perGame, setPerGame] = useState(String(start.questionsPerGame));
  const [questions, setQuestions] = useState<Question[]>(() => (start.questions.length > 0 ? start.questions : [blankQuestion()]));
  const [at, setAt] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [local, setLocal] = useState<string | null>(null);

  const index = Math.min(at, questions.length - 1);
  const current = questions[index];
  const n = index + 1;
  const perGameBad = !/^\d+$/.test(perGame.trim()) || Number(perGame) < 1;
  const known = draft.tests.findIndex((test) => test.id === start.id);
  const name = testName({ title }, known >= 0 ? known : draft.tests.length);

  function change(next: Question) {
    setLocal(null);
    setQuestions((list) => replaceQuestion(list, next));
  }

  function addMore() {
    setLocal(null);
    setListOpen(false);
    const last = questions[questions.length - 1];
    if (last !== undefined && isBlankQuestion(last)) {
      setAt(questions.length - 1);
      return;
    }
    setQuestions([...questions, blankQuestion()]);
    setAt(questions.length);
  }

  function openQuestion(i: number) {
    setLocal(null);
    setAt(i);
    setListOpen(false);
  }

  function move(i: number, delta: -1 | 1) {
    setLocal(null);
    setQuestions(moveQuestion(questions, i, delta));
    // The question the person is looking at stays in view, wherever it moved to.
    if (i === index) setAt(i + delta);
    else if (i + delta === index) setAt(i);
  }

  function remove(i: number) {
    const gone = questions[i];
    if (gone === undefined) return;
    const rest = removeQuestion(questions, gone.id);
    const next = rest.length === 0 ? [blankQuestion()] : rest;
    setQuestions(next);
    setAt(Math.min(i < index ? index - 1 : index, next.length - 1));
    setProblems([]);
    setLocal(tf('admin.testWindow.removed', { n: i + 1 }));
  }

  function onPasted(added: Question[]) {
    if (added.length === 0) return;
    const keep = questions.every(isBlankQuestion) ? [] : questions;
    setQuestions([...keep, ...added]);
    setAt(keep.length);
    setListOpen(false);
    setProblems([]);
    setLocal(tf('admin.testWindow.added', { count: added.length }));
  }

  function save() {
    setLocal(null);
    if (perGameBad) {
      setProblems([]); // the red line under the box already says what to fix
      return;
    }
    const cleaned = withoutBlankQuestions(questions);
    if (cleaned.length === 0) {
      setProblems([]);
      setLocal(t('admin.testWindow.noQuestions'));
      return;
    }
    const next: Test = { id: start.id, questionsPerGame: Number(perGame), questions: cleaned };
    if (title.trim() !== '') next.title = title.trim();
    if (start.image !== undefined) next.image = start.image;
    const found = testProblems(next, draft.images, draft.course.id);
    setProblems(found);
    if (found.length > 0) return;
    setQuestions(cleaned);
    const exists = draft.tests.some((test) => test.id === start.id);
    const tests = exists ? draft.tests.map((test) => (test.id === start.id ? next : test)) : [...draft.tests, next];
    onSave({ ...draft, tests }, next);
  }

  return (
    <section className="np-test-window" aria-labelledby={`${baseId}-heading`}>
      <Button variant="secondary" icon={<ArrowLeft size={20} aria-hidden="true" />} disabled={busy} onClick={onBack}>
        {t('admin.testWindow.back')}
      </Button>
      <h3 id={`${baseId}-heading`} className="np-test-window__title">
        {tf('admin.testWindow.heading', { name })}
      </h3>
      <TestImport onAdd={onPasted} disabled={busy} />
      <TextField
        label={t('admin.testEditor.titleLabel')}
        value={title}
        onChange={(e) => {
          setLocal(null);
          setTitle(e.target.value);
        }}
        autoComplete="off"
        disabled={busy}
      />
      <TextField
        label={t('admin.testEditor.perGame')}
        hint={t('admin.testEditor.perGameHint')}
        value={perGame}
        onChange={(e) => {
          setLocal(null);
          setPerGame(e.target.value);
        }}
        error={perGameBad ? t('admin.testEditor.perGameErr') : ''}
        inputMode="numeric"
        autoComplete="off"
        disabled={busy}
      />
      <p className="np-test-window__position" aria-live="polite">
        {tf('admin.testWindow.position', { n, total: questions.length })}
      </p>
      {current !== undefined && (
        <Card className="np-test-window__card">
          <TextField
            label={tf('admin.testEditor.questionText', { n })}
            value={current.text}
            onChange={(e) => change(withText(current, e.target.value))}
            autoComplete="off"
            disabled={busy}
          />
          {OPTION_INDEXES.map((k) => (
            <div key={`${current.id}-${k}`} className="np-test-window__option">
              <input
                type="radio"
                className="np-test-window__radio"
                name={`${baseId}-${current.id}-correct`}
                checked={current.correctIndex === k}
                aria-label={tf('admin.testEditor.correctNamed', { n, k: k + 1 })}
                onChange={() => change(withCorrect(current, k))}
                disabled={busy}
              />
              <div className="np-test-window__field">
                <TextField
                  label={tf('admin.testEditor.optionNamed', { n, k: k + 1 })}
                  value={current.options[k]}
                  onChange={(e) => change(withOption(current, k, e.target.value))}
                  autoComplete="off"
                  disabled={busy}
                />
              </div>
            </div>
          ))}
          <TextField
            label={tf('admin.testEditor.explanationNamed', { n })}
            value={current.explanation ?? ''}
            onChange={(e) => change(withExplanation(current, e.target.value))}
            autoComplete="off"
            disabled={busy}
          />
        </Card>
      )}
      {listOpen && (
        <ol className="np-test-window__list" aria-label={t('admin.testWindow.listLabel')}>
          {questions.map((item, i) => (
            <li key={item.id}>
              <Card className="np-test-window__row">
                <Button
                  variant="secondary"
                  aria-label={tf('admin.testWindow.openNamed', { n: i + 1 })}
                  {...(i === index ? { 'aria-current': 'true' as const } : {})}
                  disabled={busy}
                  onClick={() => openQuestion(i)}
                >
                  {item.text.trim() === ''
                    ? tf('admin.testWindow.rowEmpty', { n: i + 1 })
                    : tf('admin.testWindow.rowText', { n: i + 1, text: item.text })}
                </Button>
                <div className="np-test-window__tools" data-np-check>
                  <Button
                    variant="secondary"
                    icon={<ArrowUp size={20} aria-hidden="true" />}
                    aria-label={tf('admin.testEditor.upNamed', { n: i + 1 })}
                    disabled={busy || i === 0}
                    onClick={() => move(i, -1)}
                  >
                    {t('admin.blocks.up')}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<ArrowDown size={20} aria-hidden="true" />}
                    aria-label={tf('admin.testEditor.downNamed', { n: i + 1 })}
                    disabled={busy || i === questions.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    {t('admin.blocks.down')}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<Trash2 size={20} aria-hidden="true" />}
                    aria-label={tf('admin.testEditor.removeNamed', { n: i + 1 })}
                    disabled={busy}
                    onClick={() => remove(i)}
                  >
                    {t('admin.blocks.remove')}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
      {local !== null && (
        <p role="status" className="np-test-window__text">
          {local}
        </p>
      )}
      {note !== null && (
        <p role="status" className="np-test-window__text">
          {note}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="np-test-window__error">
          <span aria-hidden="true">! </span>
          {t(error)}
        </p>
      )}
      <ProblemSummary problems={problems} />
      <div className="np-test-window__bar" data-np-check>
        <Button icon={<Save size={20} aria-hidden="true" />} disabled={busy} onClick={save}>
          {t('admin.testWindow.save')}
        </Button>
        <Button
          variant="secondary"
          icon={<ListOrdered size={20} aria-hidden="true" />}
          aria-expanded={listOpen}
          disabled={busy}
          onClick={() => setListOpen((open) => !open)}
        >
          {t(listOpen ? 'admin.testWindow.editClose' : 'admin.testWindow.edit')}
        </Button>
        <Button variant="secondary" icon={<Plus size={20} aria-hidden="true" />} disabled={busy} onClick={addMore}>
          {t('admin.testWindow.addMore')}
        </Button>
        <Button variant="secondary" icon={<Upload size={20} aria-hidden="true" />} aria-describedby={PUBLISH_NOTE_ID} disabled>
          {t('admin.testWindow.publish')}
        </Button>
      </div>
      <p id={PUBLISH_NOTE_ID} className="np-test-window__text">
        {t('admin.testWindow.publishNote')}
      </p>
    </section>
  );
}
