import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  defaultPublishedDeps,
  listPublished,
  loadPublishedDraft,
  type LoadCode,
  type PublishedCourse,
  type PublishedDeps,
} from '../../core/admin/loadExisting';
import type { CourseDraft } from '../../core/admin/model';
import { t, tf, type TextKey } from '../../core/i18n';
import { Button, Card } from '../../core/ui';
import './PublishedCourses.css';

// "Load a published course" (P10 T9(b), SPEC D6): shows the courses of the published manifest that are not yet drafts here and
// loads one into the editor. It only reads. A loaded course becomes a draft in this browser when the developer saves it.

const LOAD_ERROR_TEXT: Record<LoadCode, TextKey> = {
  unavailable: 'admin.published.err.unavailable',
  invalid: 'admin.published.err.invalid',
  image: 'admin.published.err.image',
};

interface PublishedCoursesProps {
  /** Ids already kept as drafts: those are edited from the list above, not loaded again. */
  draftIds: string[];
  onLoaded: (draft: CourseDraft) => void;
  /** Tests pass fakes. */
  deps?: PublishedDeps;
}

type View = { step: 'idle' } | { step: 'listing' } | { step: 'ready'; courses: PublishedCourse[] };

export function PublishedCourses({ draftIds, onLoaded, deps = defaultPublishedDeps }: PublishedCoursesProps) {
  const [view, setView] = useState<View>({ step: 'idle' });
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<TextKey | null>(null);

  async function showList() {
    setError(null);
    setView({ step: 'listing' });
    const result = await listPublished(deps);
    if (result.ok) {
      setView({ step: 'ready', courses: result.courses });
    } else {
      setView({ step: 'idle' });
      setError('admin.published.err.list');
    }
  }

  async function load(course: PublishedCourse) {
    if (loadingId !== null) return;
    setError(null);
    setLoadingId(course.id);
    const result = await loadPublishedDraft(course.id, deps);
    setLoadingId(null);
    if (result.ok) onLoaded(result.draft);
    else setError(LOAD_ERROR_TEXT[result.code]);
  }

  const free = view.step === 'ready' ? view.courses.filter((c) => !draftIds.includes(c.id)) : [];

  return (
    <section className="np-published" aria-labelledby="np-published-title">
      <h3 id="np-published-title" className="np-published__title">
        {t('admin.published.title')}
      </h3>
      <p className="np-published__text">{t('admin.published.hint')}</p>
      {error !== null && (
        <p role="alert" className="np-published__text np-published__error">
          <span aria-hidden="true">! </span>
          {t(error)}
        </p>
      )}
      {view.step !== 'ready' && (
        <Button
          variant="secondary"
          icon={<Download size={20} aria-hidden="true" />}
          disabled={view.step === 'listing'}
          onClick={() => void showList()}
        >
          {t('admin.published.load')}
        </Button>
      )}
      {view.step === 'listing' && (
        <p role="status" className="np-published__text">
          {t('admin.published.loading')}
        </p>
      )}
      {view.step === 'ready' && free.length === 0 && <p className="np-published__text">{t('admin.published.empty')}</p>}
      {free.length > 0 && (
        <ul className="np-published__list">
          {free.map((course) => (
            <li key={course.id}>
              <Card className="np-published__card">
                <span className="np-published__name">{course.title}</span>
                <Button
                  variant="secondary"
                  aria-label={tf('admin.published.loadNamed', { title: course.title })}
                  disabled={loadingId !== null}
                  onClick={() => void load(course)}
                >
                  {t(loadingId === course.id ? 'admin.published.busy' : 'admin.published.loadButton')}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
