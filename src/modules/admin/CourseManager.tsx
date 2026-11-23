import { useEffect, useState } from 'react';
import { EyeOff, Pencil, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import type { DraftRecord, DraftStore, StoreCode } from '../../core/admin/draftStore';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import { t, tf, type TextKey } from '../../core/i18n';
import { Button, Card } from '../../core/ui';
import { CourseWorkspace } from './CourseWorkspace';
import { PublishedCourses } from './PublishedCourses';
import './CourseManager.css';

// Course list + course form (P10 T6, SPEC D2/D5). The list comes from the draft store (drafts kept in this browser).
// "Add another course" opens a NEW, UNSAVED draft: nothing is stored until Save, so Cancel leaves no empty course behind.
// Storage problems are shown as friendly texts (codes -> en.json), never as raw errors.
// Owner layout (DECISIONS Q26): the Add button is at the very TOP, the courses are listed below it, each with Edit, Delete, Publish and
// Unpublish. Publish / Unpublish write to GitHub (P11), so until then they are shown but OFF, with one note.

const PUBLISH_NOTE_ID = 'np-courses-publish-note';

const STORE_ERROR_TEXT: Record<StoreCode, TextKey> = {
  storage_unavailable: 'admin.err.storage',
  quota_exceeded: 'admin.err.quota',
};

interface Editing {
  draft: CourseDraft;
  isNew: boolean;
}

function ErrorLine({ text }: { text: TextKey }) {
  return (
    <p role="alert" className="np-courses__error">
      <span aria-hidden="true">! </span>
      {t(text)}
    </p>
  );
}

export function CourseManager({ store }: { store: DraftStore }) {
  const [records, setRecords] = useState<DraftRecord[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  if (editing !== null) {
    return (
      <section className="np-courses">
        <h2 className="np-courses__title">{t(editing.isNew ? 'admin.course.newTitle' : 'admin.course.editTitle')}</h2>
        {error !== null && <ErrorLine text={error} />}
        <CourseWorkspace
          key={editing.draft.course.id}
          draft={editing.draft}
          busy={busy}
          onSave={(draft) => void onSave(draft)}
          onCancel={onCancel}
        />
      </section>
    );
  }

  const hasCourses = records !== null && records.length > 0;
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
                  {confirmId === record.id ? (
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
                        icon={<Upload size={20} aria-hidden="true" />}
                        aria-label={tf('admin.courses.publishNamed', { title })}
                        aria-describedby={PUBLISH_NOTE_ID}
                        disabled
                      >
                        {t('admin.courses.publish')}
                      </Button>
                      <Button
                        variant="secondary"
                        icon={<EyeOff size={20} aria-hidden="true" />}
                        aria-label={tf('admin.courses.unpublishNamed', { title })}
                        aria-describedby={PUBLISH_NOTE_ID}
                        disabled
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
      {hasCourses && (
        <p id={PUBLISH_NOTE_ID} className="np-courses__text">
          {t('admin.courses.publishNote')}
        </p>
      )}
      {records !== null && <PublishedCourses draftIds={records.map((r) => r.id)} onLoaded={onLoaded} />}
    </section>
  );
}
