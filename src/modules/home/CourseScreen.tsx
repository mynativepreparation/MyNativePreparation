import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, ClipboardList, FileText, TrendingUp } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { findCourseTests } from '../../core/content/courseTests';
import { loadCourse } from '../../core/content/loader';
import type { CourseCard } from '../../core/content/types';
import { t, type TextKey } from '../../core/i18n';
import { Button, Card, Tile } from '../../core/ui';
import { NotAvailable } from './NotAvailable';
import './CourseScreen.css';

// Course screen (P05 T3, SPEC C3): exactly four tiles. Overview, Content and Test open only when their data is `ready`;
// an empty or broken section shows the owner's "not available" text and cannot be opened. Report is always open
// (P08 builds it from what the person did, not from developer data). An unknown course shows the not-available state with Back.

type Section = 'overview' | 'content' | 'test' | 'report';

interface CourseView {
  card: CourseCard;
  open: Record<Section, boolean>;
}

/** True when the course has tests in `tests/<id>.json` (P10 T11t d). Never throws: a problem means "no tests". */
async function hasMoreTests(courseId: string): Promise<boolean> {
  try {
    return (await findCourseTests(courseId)).length > 0;
  } catch {
    return false;
  }
}

/** `null` = the course itself is not available (unknown id, missing or broken course.json). Never throws. */
async function readCourse(courseId: string): Promise<CourseView | null> {
  try {
    const loaded = await loadCourse(courseId);
    if (loaded.card.state !== 'ready') return null;
    // The Test tile is open for the old test.json OR for tests found in the manifest (only looked up when test.json is not ready).
    const hasTest = loaded.test.state === 'ready' || (await hasMoreTests(courseId));
    return {
      card: loaded.card.value,
      open: {
        overview: loaded.overview.state === 'ready',
        content: loaded.content.state === 'ready',
        test: hasTest,
        report: true,
      },
    };
  } catch {
    return null;
  }
}

const TILES: { section: Section; icon: ReactNode; title: TextKey; subtitle: TextKey }[] = [
  { section: 'overview', icon: <FileText size={28} aria-hidden="true" />, title: 'course.tile.overview', subtitle: 'course.tile.overview.sub' },
  { section: 'content', icon: <BookOpen size={28} aria-hidden="true" />, title: 'course.tile.content', subtitle: 'course.tile.content.sub' },
  { section: 'test', icon: <ClipboardList size={28} aria-hidden="true" />, title: 'course.tile.test', subtitle: 'course.tile.test.sub' },
  { section: 'report', icon: <TrendingUp size={28} aria-hidden="true" />, title: 'course.tile.report', subtitle: 'course.tile.report.sub' },
];

export function CourseScreen() {
  const navigate = useNavigate();
  const courseId = useParams().courseId ?? '';
  // The result is stored with the id it belongs to, so a new id shows "loading" again without setting state inside the effect.
  const [result, setResult] = useState<{ id: string; view: CourseView | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readCourse(courseId).then((view) => {
      if (!cancelled) setResult({ id: courseId, view });
    });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const back = (
    <div className="np-course__actions">
      <Button variant="secondary" icon={<ArrowLeft size={20} aria-hidden="true" />} onClick={() => navigate('/')}>
        {t('course.back')}
      </Button>
    </div>
  );

  if (result === null || result.id !== courseId) {
    return (
      <section className="np-course">
        <p role="status" className="np-course__sr">
          {t('course.loading')}
        </p>
        <ul className="np-course__grid" aria-hidden="true">
          {TILES.map((tile) => (
            <li key={tile.section}>
              <Card className="np-course__skeleton" />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (result.view === null) {
    return (
      <section className="np-course">
        <h1>{t('course.notFound.title')}</h1>
        <Card className="np-course__message">
          <NotAvailable />
        </Card>
        {back}
      </section>
    );
  }

  const { card, open } = result.view;
  return (
    <section className="np-course">
      <h1>{card.title}</h1>
      {card.description && <p className="np-course__desc">{card.description}</p>}

      <ul className="np-course__grid" data-np-check>
        {TILES.map((tile) => {
          const isOpen = open[tile.section];
          const noteId = `np-course-off-${tile.section}`;
          return (
            <li key={tile.section} className="np-course__item">
              <Tile
                icon={tile.icon}
                title={t(tile.title)}
                subtitle={t(tile.subtitle)}
                className={isOpen ? undefined : 'np-course__tile--off'}
                aria-disabled={isOpen ? undefined : true}
                aria-describedby={isOpen ? undefined : noteId}
                onClick={isOpen ? () => navigate(`/course/${courseId}/${tile.section}`) : undefined}
              />
              {!isOpen && (
                <div className="np-course__note">
                  <NotAvailable id={noteId} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {back}
    </section>
  );
}
