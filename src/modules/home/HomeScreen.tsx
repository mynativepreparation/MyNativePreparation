import { BookOpen, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { contentUrl } from '../../core/content/loader';
import { t } from '../../core/i18n';
import { Button, Card, Surface } from '../../core/ui';
import { NotAvailable } from './NotAvailable';
import { useCourses, type CourseEntry } from './useCourses';
import './HomeScreen.css';

// Home = Courses (P05 T2, SPEC C2): one card per course from manifest.json, sorted by `order`.
// A course without a usable course.json stays visible but disabled, with the owner's "not available" text (never hidden, never a crash).
// Titles and descriptions are plain text. Nothing here reads personal data.
function CourseTile({ entry, onOpen }: { entry: CourseEntry; onOpen: () => void }) {
  const { card } = entry;
  const unavailable = card === null;
  const noteId = `np-home-off-${entry.id}`;

  return (
    <Card className={unavailable ? 'np-home__card np-home__card--off' : 'np-home__card'}>
      <button
        type="button"
        className="np-home__open"
        aria-disabled={unavailable ? true : undefined}
        aria-describedby={unavailable ? noteId : undefined}
        onClick={unavailable ? undefined : onOpen}
      >
        {card?.cover ? (
          <img className="np-home__cover" src={contentUrl(`courses/${entry.id}/${card.cover}`)} alt={entry.title} loading="lazy" />
        ) : (
          <Surface className="np-home__cover np-home__cover--icon">
            <BookOpen size={32} aria-hidden="true" />
          </Surface>
        )}
        <span className="np-home__title">{entry.title}</span>
        {card?.description && <span className="np-home__desc">{card.description}</span>}
      </button>
      {unavailable && (
        <div className="np-home__note">
          <NotAvailable id={noteId} />
        </div>
      )}
    </Card>
  );
}

export function HomeScreen() {
  const navigate = useNavigate();
  const { state, retry } = useCourses();

  return (
    <section className="np-home">
      <h1>{t('home.title')}</h1>
      <p className="np-home__intro">{t('home.intro')}</p>

      {state.status === 'loading' && (
        <>
          <p role="status" className="np-home__sr">
            {t('home.loading')}
          </p>
          <div className="np-home__grid" aria-hidden="true">
            <Card className="np-home__skeleton" />
            <Card className="np-home__skeleton" />
          </div>
        </>
      )}

      {state.status === 'empty' && (
        <Card className="np-home__message">
          <BookOpen size={24} aria-hidden="true" />
          <p role="status">{t('home.empty')}</p>
        </Card>
      )}

      {state.status === 'error' && (
        <Card className="np-home__message">
          <p role="status">{state.reason === 'invalid' ? t('home.error.invalid') : t('home.error.unavailable')}</p>
          <Button variant="secondary" icon={<RefreshCw size={20} aria-hidden="true" />} onClick={retry}>
            {t('home.retry')}
          </Button>
        </Card>
      )}

      {state.status === 'ready' && (
        <ul className="np-home__grid" data-np-check>
          {state.courses.map((entry) => (
            <li key={entry.id}>
              <CourseTile entry={entry} onOpen={() => navigate(`/course/${entry.id}`)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
