import { useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import type { CourseDraft } from '../../core/admin/model';
import { t, tf, type TextKey } from '../../core/i18n';
import { Button, Card } from '../../core/ui';
import { questionsText, testName } from './testName';
import './CourseManager.css';

// The tests of ONE course (P10 T11s, DECISIONS Q27), built like the course list: Generate new test at the TOP, below it the saved
// tests, each with Edit and Delete (Delete asks first). The screen only shows the draft it is given and reports what the person
// pressed; storing and the test window itself (T11t) belong to the parent. The classes come from CourseManager.css on purpose.

export interface TestManagerProps {
  /** The course whose tests are listed (as stored in the browser). */
  draft: CourseDraft;
  busy?: boolean;
  /** A status line, for example "The test was deleted". */
  note?: string | null;
  /** A friendly storage problem. */
  error?: TextKey | null;
  onBack: () => void;
  /** `null` = Generate new test; an id = Edit that test. */
  onOpenTest: (testId: string | null) => void;
  /** Called only after the person confirmed. */
  onDeleteTest: (testId: string) => void;
}

export function TestManager({ draft, busy = false, note = null, error = null, onBack, onOpenTest, onDeleteTest }: TestManagerProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const course = draft.course.title.trim() === '' ? t('admin.courses.untitled') : draft.course.title;

  return (
    <section className="np-courses np-tests">
      <Button variant="secondary" icon={<ArrowLeft size={20} aria-hidden="true" />} disabled={busy} onClick={onBack}>
        {t('admin.tests.back')}
      </Button>
      <h2 className="np-courses__title">{tf('admin.tests.title', { title: course })}</h2>
      <Button icon={<Plus size={20} aria-hidden="true" />} disabled={busy} onClick={() => onOpenTest(null)}>
        {t('admin.tests.generate')}
      </Button>
      {note !== null && (
        <p role="status" className="np-courses__text">
          {note}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="np-courses__error">
          <span aria-hidden="true">! </span>
          {t(error)}
        </p>
      )}
      {draft.tests.length === 0 ? (
        <p className="np-courses__text">{t('admin.tests.empty')}</p>
      ) : (
        <ul className="np-courses__list" data-np-check>
          {draft.tests.map((test, index) => {
            const name = testName(test, index);
            return (
              <li key={test.id}>
                <Card className="np-courses__card">
                  <div className="np-courses__info">
                    <span className="np-courses__name">{name}</span>
                    <span className="np-courses__meta">{questionsText(test.questions.length)}</span>
                  </div>
                  {confirmId === test.id ? (
                    <div className="np-courses__confirm" role="group" aria-label={tf('admin.tests.confirmLabel', { name })}>
                      <p className="np-courses__text">{tf('admin.tests.confirmText', { name })}</p>
                      <div className="np-courses__actions" data-np-check>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => {
                            setConfirmId(null);
                            onDeleteTest(test.id);
                          }}
                        >
                          {t('admin.tests.confirmYes')}
                        </Button>
                        <Button variant="secondary" autoFocus disabled={busy} onClick={() => setConfirmId(null)}>
                          {t('admin.tests.confirmNo')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="np-courses__actions" data-np-check>
                      <Button
                        variant="secondary"
                        icon={<Pencil size={20} aria-hidden="true" />}
                        aria-label={tf('admin.tests.editNamed', { name })}
                        disabled={busy}
                        onClick={() => onOpenTest(test.id)}
                      >
                        {t('admin.tests.edit')}
                      </Button>
                      <Button
                        variant="secondary"
                        icon={<Trash2 size={20} aria-hidden="true" />}
                        aria-label={tf('admin.tests.deleteNamed', { name })}
                        disabled={busy}
                        onClick={() => setConfirmId(test.id)}
                      >
                        {t('admin.tests.delete')}
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
