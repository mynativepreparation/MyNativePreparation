import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ClipboardList, EyeOff, Pencil, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import type { DraftRecord, DraftStore, StoreCode } from '../../core/admin/draftStore';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import { pruneImages } from '../../core/admin/pruneImages';
import type { Test } from '../../core/content/types';
import { t, tf, type TextKey } from '../../core/i18n';
import { Button, Card } from '../../core/ui';
import { CourseWorkspace } from './CourseWorkspace';
import { PublishedCourses } from './PublishedCourses';
import { PublishConfirm, PublishResult } from './PublishPanel';
import { TestManager } from './TestManager';
import { TestWindow } from './TestWindow';
import { getInfo, subscribe } from './session';
import { testName } from './testName';
import { usePublish, type UsePublishDeps } from './usePublish';
import './CourseManager.css';

// Course list + course form (P10 T6, SPEC D2/D5). The list comes from the draft store (drafts kept in this browser).
// "Add another course" opens a NEW, UNSAVED draft: nothing is stored until Save, so Cancel leaves no empty course behind.
// Storage problems are shown as friendly texts (codes -> en.json), never as raw errors.
// Owner layout (DECISIONS Q26): the Add button is at the very TOP, the courses are listed below it, each with Edit, Delete, Publish and
// Unpublish. Publish / Unpublish write to GitHub (P11 T5b): they are ON when the owner is logged in and nothing is running. Each one asks
// first ("this goes live for everyone"); the run and its result line come from `usePublish`. Logged out they stay OFF, with one note.

const PUBLISH_NOTE_ID = 'np-courses-publish-note';

const STORE_ERROR_TEXT: Record<StoreCode, TextKey> = {
  storage_unavailable: 'admin.err.storage',
  quota_exceeded: 'admin.err.quota',
};

interface Editing {
  draft: CourseDraft;
  isNew: boolean;
}

/** The open "really go live?" question: Publish carries the draft to send, Unpublish only the course. */
type Pending =
  | { kind: 'publish'; draft: CourseDraft; title: string }
  | { kind: 'unpublish'; courseId: string; title: string };

const pendingId = (pending: Pending): string => (pending.kind === 'publish' ? pending.draft.course.id : pending.courseId);

const titleOf = (draft: CourseDraft): string => (draft.course.title.trim() === '' ? t('admin.courses.untitled') : draft.course.title);

function ErrorLine({ text }: { text: TextKey }) {
  return (
    <p role="alert" className="np-courses__error">
      <span aria-hidden="true">! </span>
      {t(text)}
    </p>
  );
}

export function CourseManager({ store, publishDeps }: { store: DraftStore; publishDeps?: UsePublishDeps | undefined }) {
  const [records, setRecords] = useState<DraftRecord[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The test list of ONE course (Q27, T11s): `testsOf` is that course's draft as stored. Back and a delete read the course list again.
  const [testsOf, setTestsOf] = useState<CourseDraft | null>(null);
  const [testNote, setTestNote] = useState<string | null>(null);
  // The test window (T11t): which test is open (`null` = a new one). `key` is new for every opening, so a new test starts empty.
  const [testWindow, setTestWindow] = useState<{ testId: string | null; key: number } | null>(null);
  const windowCount = useRef(0);
  // Publish / Unpublish (P11 T5b): `pending` is the question that is open; the run itself and its result come from `usePublish`.
  const info = useSyncExternalStore(subscribe, getInfo);
  const pub = usePublish(publishDeps);
  const [pending, setPending] = useState<Pending | null>(null);
  const canPublish = info !== null && !busy && !pub.busy;

  useEffect(() => {
    let cancelled = false;
    void store.list().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setRecords(result.value);
      } else {
        setRecords([]);
        setError(STORE_ERROR_TEXT[result.code]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [store, reloadKey]);

  function onAdd() {
    const next = (records ?? []).reduce((max, r) => Math.max(max, r.draft.course.order), 0) + 1;
    setSaved(false);
    setError(null);
    setEditing({ draft: createCourseDraft({ order: next }), isNew: true });
  }

  function onEdit(record: DraftRecord) {
    setPending(null);
    setSaved(false);
    setError(null);
    setEditing({ draft: record.draft, isNew: false });
  }

  function onCancel() {
    setError(null);
    setNotice(null);
    setEditing(null);
  }

  /** Delete (after the confirmation) and Restore: only a mark in the draft; the real delete is P11. */
  async function setDeleted(record: DraftRecord, deleted: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    setNotice(null);
    const title = record.draft.course.title.trim() === '' ? t('admin.courses.untitled') : record.draft.course.title;
    const result = await store.markDeleted(record.id, deleted);
    setBusy(false);
    setConfirmId(null);
    if (result.ok) {
      setNotice(tf(deleted ? 'admin.courses.deletedDone' : 'admin.courses.restoredDone', { title }));
      setReloadKey((k) => k + 1);
    } else {
      setError(STORE_ERROR_TEXT[result.code]);
    }
  }

  function onGenerate(record: DraftRecord) {
    setSaved(false);
    setError(null);
    setNotice(null);
    setTestNote(null);
    setTestsOf(record.draft);
  }

  /** Back from the test list to the course list (read again: a test may have been deleted). */
  function closeTests() {
    setTestsOf(null);
    setTestNote(null);
    setError(null);
    setReloadKey((k) => k + 1);
  }

  /** Edit (an id) and Generate new test (`null`) open the test window of the open course. */
  function openTest(testId: string | null) {
    setError(null);
    setTestNote(null);
    windowCount.current += 1;
    setTestWindow({ testId, key: windowCount.current });
  }

  /** Back from the test window to the test list (the list shows what was saved). */
  function closeTestWindow() {
    setTestWindow(null);
    setTestNote(null);
    setError(null);
  }

  /** Save from the test window: the whole course draft, minus pictures nobody uses. The window stays open for more questions. */
  async function saveTest(draft: CourseDraft, saved: Test) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await store.put({ ...draft, images: pruneImages(draft) });
    setBusy(false);
    if (result.ok) {
      setTestsOf(result.value.draft);
      const index = result.value.draft.tests.findIndex((test) => test.id === saved.id);
      setTestNote(tf('admin.testWindow.saved', { name: testName(saved, Math.max(index, 0)) }));
    } else {
      setError(STORE_ERROR_TEXT[result.code]);
    }
  }

  /** Delete one test of the open course (TestManager asked first): a normal Save of the draft, minus the pictures only that test used. */
  async function deleteTest(testId: string) {
    if (busy || testsOf === null) return;
    const index = testsOf.tests.findIndex((test) => test.id === testId);
    const gone = testsOf.tests[index];
    if (gone === undefined) return;
    const name = testName(gone, index);
    setBusy(true);
    setError(null);
    const rest: CourseDraft = { ...testsOf, tests: testsOf.tests.filter((test) => test.id !== testId) };
    const result = await store.put({ ...rest, images: pruneImages(rest) });
    setBusy(false);
    if (result.ok) {
      setTestsOf(result.value.draft);
      setTestNote(tf('admin.tests.deletedDone', { name }));
    } else {
      setError(STORE_ERROR_TEXT[result.code]);
    }
  }

  /** A published course loaded for editing: like "Add", it is not stored until Save. */
  function onLoaded(draft: CourseDraft) {
    setSaved(false);
    setError(null);
    setEditing({ draft, isNew: false });
  }

  async function onSave(draft: CourseDraft) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await store.put(draft);
    setBusy(false);
    if (result.ok) {
      setEditing(null);
      setSaved(true);
      setNotice(null);
      setReloadKey((k) => k + 1);
    } else {
      setError(STORE_ERROR_TEXT[result.code]);
    }
  }

  function askPublish(draft: CourseDraft) {
    pub.reset();
    setPending({ kind: 'publish', draft, title: titleOf(draft) });
  }

  function askUnpublish(record: DraftRecord) {
    pub.reset();
    setPending({ kind: 'unpublish', courseId: record.id, title: titleOf(record.draft) });
  }

  /** Yes on the question: the run starts and its progress shows in the result line. */
  function confirmPending() {
    if (pending === null || pub.busy) return;
    const question = pending;
    setPending(null);
    if (question.kind === 'publish') void pub.publish(question.draft);
    else void pub.unpublish({ courseId: question.courseId, title: question.title });
  }

  if (testsOf !== null && testWindow !== null) {
    return (
      <TestWindow
        key={testWindow.key}
        draft={testsOf}
        testId={testWindow.testId}
        busy={busy}
        note={testNote}
        error={error}
        onSave={(draft, saved) => void saveTest(draft, saved)}
        onBack={closeTestWindow}
      />
    );
  }

  if (testsOf !== null) {
    return (
      <TestManager
        draft={testsOf}
        busy={busy}
        note={testNote}
        error={error}
        onBack={closeTests}
        onOpenTest={openTest}
        onDeleteTest={(id) => void deleteTest(id)}
      />
    );
  }

  if (editing !== null) {
    return (
      <section className="np-courses">
        <h2 className="np-courses__title">{t(editing.isNew ? 'admin.course.newTitle' : 'admin.course.editTitle')}</h2>
        {error !== null && <ErrorLine text={error} />}
        {pending !== null && pendingId(pending) === editing.draft.course.id && (
          <PublishConfirm
            kind={pending.kind}
            title={pending.title}
            busy={pub.busy}
            onConfirm={confirmPending}
            onCancel={() => setPending(null)}
          />
        )}
        <PublishResult state={pub.state} onClose={pub.reset} />
        <CourseWorkspace
          key={editing.draft.course.id}
          draft={editing.draft}
          busy={busy || pub.busy}
          onSave={(draft) => void onSave(draft)}
          onCancel={onCancel}
          {...(info === null ? {} : { onPublish: askPublish })}
        />
      </section>
    );
  }

  const hasCourses = records !== null && records.length > 0;
  // Logged out, the two buttons are off and point to the note.
  const describedBy = info === null ? { 'aria-describedby': PUBLISH_NOTE_ID } : {};
  return (
    <section className="np-courses">
      <h2 className="np-courses__title">{t('admin.courses.title')}</h2>
      <Button icon={<Plus size={20} aria-hidden="true" />} disabled={records === null} onClick={onAdd}>
        {t(hasCourses ? 'admin.courses.addAnother' : 'admin.courses.add')}
      </Button>
      {saved && (
        <p role="status" className="np-courses__text">
          {t('admin.course.saved')}
        </p>
      )}
      {notice !== null && (
        <p role="status" className="np-courses__text">
          {notice}
        </p>
      )}
      {error !== null && <ErrorLine text={error} />}
      <PublishResult state={pub.state} onClose={pub.reset} />
      {records === null && (
        <p role="status" className="np-courses__text">
          {t('admin.courses.loading')}
        </p>
      )}
      {records !== null && records.length === 0 && error === null && (
        <p className="np-courses__text">{t('admin.courses.empty')}</p>
      )}
      {records !== null && records.length > 0 && (
        <ul className="np-courses__list" data-np-check>
          {records.map((record) => {
            const title = record.draft.course.title.trim() === '' ? t('admin.courses.untitled') : record.draft.course.title;
            return (
              <li key={record.id}>
                <Card className="np-courses__card">
                  <div className="np-courses__info">
                    <span className="np-courses__name">{title}</span>
                    <span className="np-courses__meta">
                      {tf('admin.courses.order', { order: String(record.draft.course.order) })}
                    </span>
                    {record.deleted && (
                      <span className="np-courses__meta">
                        <span aria-hidden="true">! </span>
                        {t('admin.courses.deletedMark')}
                      </span>
                    )}
                  </div>
                  {pending !== null && pendingId(pending) === record.id ? (
                    <PublishConfirm
                      kind={pending.kind}
                      title={pending.title}
                      busy={pub.busy}
                      onConfirm={confirmPending}
                      onCancel={() => setPending(null)}
                    />
                  ) : confirmId === record.id ? (
                    <div className="np-courses__confirm" role="group" aria-label={tf('admin.courses.confirmLabel', { title })}>
                      <p className="np-courses__text">{tf('admin.courses.confirmText', { title })}</p>
                      <div className="np-courses__actions" data-np-check>
                        <Button variant="secondary" disabled={busy} onClick={() => void setDeleted(record, true)}>
                          {t('admin.courses.confirmYes')}
                        </Button>
                        <Button variant="secondary" autoFocus disabled={busy} onClick={() => setConfirmId(null)}>
                          {t('admin.courses.confirmNo')}
                        </Button>
                      </div>
                    </div>
                  ) : record.deleted ? (
                    <Button
                      variant="secondary"
                      icon={<RotateCcw size={20} aria-hidden="true" />}
                      aria-label={tf('admin.courses.restoreNamed', { title })}
                      disabled={busy}
                      onClick={() => void setDeleted(record, false)}
                    >
                      {t('admin.courses.restore')}
                    </Button>
                  ) : (
                    <div className="np-courses__actions" data-np-check>
                      <Button
                        variant="secondary"
                        icon={<Pencil size={20} aria-hidden="true" />}
                        aria-label={tf('admin.courses.editNamed', { title })}
                        onClick={() => onEdit(record)}
                      >
                        {t('admin.courses.edit')}
                      </Button>
                      <Button
                        variant="secondary"
                        icon={<Trash2 size={20} aria-hidden="true" />}
                        aria-label={tf('admin.courses.deleteNamed', { title })}
                        disabled={busy}
                        onClick={() => {
                          setNotice(null);
                          setConfirmId(record.id);
                        }}
                      >
                        {t('admin.courses.delete')}
                      </Button>
                      <Button
                        variant="secondary"
                        icon={<ClipboardList size={20} aria-hidden="true" />}
                        aria-label={tf('admin.courses.generateNamed', { title })}
                        disabled={busy}
                        onClick={() => onGenerate(record)}
                      >
                        {t('admin.courses.generate')}
                      </Button>
                      <Button
                        variant="secondary"
                        icon={<Upload size={20} aria-hidden="true" />}
                        aria-label={tf('admin.courses.publishNamed', { title })}
                        {...describedBy}
                        disabled={!canPublish}
                        onClick={() => askPublish(record.draft)}
                      >
                        {t('admin.courses.publish')}
                      </Button>
                      <Button
                        variant="secondary"
                        icon={<EyeOff size={20} aria-hidden="true" />}
                        aria-label={tf('admin.courses.unpublishNamed', { title })}
                        {...describedBy}
                        disabled={!canPublish}
                        onClick={() => askUnpublish(record)}
                      >
                        {t('admin.courses.unpublish')}
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {hasCourses && info === null && (
        <p id={PUBLISH_NOTE_ID} className="np-courses__text">
          {t('admin.courses.publishNote')}
        </p>
      )}
      {records !== null && <PublishedCourses draftIds={records.map((r) => r.id)} onLoaded={onLoaded} />}
    </section>
  );
}
