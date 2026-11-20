import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { t, type TextKey } from '../../core/i18n';
import { Button } from '../../core/ui';
import './SectionPlaceholder.css';

export type PlaceholderSection = 'overview' | 'content' | 'test' | 'report';

const TITLE: Record<PlaceholderSection, TextKey> = {
  overview: 'course.tile.overview',
  content: 'course.tile.content',
  test: 'course.tile.test',
  report: 'course.tile.report',
};

// Stand-in for a course section until its real screen exists (P06 reader: overview + content, P07 test game, P08 report).
// Each of those phases replaces the route in modules/home/index.tsx with its own screen.
export function SectionPlaceholder({ section }: { section: PlaceholderSection }) {
  const navigate = useNavigate();
  const courseId = useParams().courseId ?? '';

  return (
    <section className="np-placeholder">
      <h1>{t(TITLE[section])}</h1>
      <p>{t('course.comingSoon')}</p>
      <div className="np-placeholder__actions">
        <Button variant="secondary" icon={<ArrowLeft size={20} aria-hidden="true" />} onClick={() => navigate(`/course/${courseId}`)}>
          {t('course.backToCourse')}
        </Button>
      </div>
    </section>
  );
}
