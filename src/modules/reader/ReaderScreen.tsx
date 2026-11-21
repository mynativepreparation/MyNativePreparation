import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadCourse } from '../../core/content/loader';
import type { Block } from '../../core/content/types';
import { t } from '../../core/i18n';
import { markCourseOpened } from '../../core/storage/repo';
import { Button, Card, NotAvailable } from '../../core/ui';
import { BlockView, type OpenedImage } from './BlockView';
import { FontControls } from './FontControls';
import { ImageViewer } from './ImageViewer';
import { useFontScale } from './useFontScale';
import './ReaderScreen.css';

// Reader (P06, SPEC C4): shows the Overview or the Content of a course as e-book style blocks.
// Ready data = the blocks; an empty or broken section, an unknown course or any load error = the owner's "not available" text + Back.

export type ReaderSection = 'overview' | 'content';

interface ReaderView {
  courseTitle: string;
  blocks: Block[];
}

/** `null` = nothing to read (unknown course, empty or broken section, load error). Never throws. */
async function readSection(courseId: string, section: ReaderSection): Promise<ReaderView | null> {
  try {
    const loaded = await loadCourse(courseId);
    if (loaded.card.state !== 'ready') return null;
    const data = loaded[section];
    if (data.state !== 'ready' || data.value.length === 0) return null;
    return { courseTitle: loaded.card.value.title, blocks: data.value };
  } catch {
    return null;
  }
}

export function ReaderScreen({ section }: { section: ReaderSection }) {
  const navigate = useNavigate();
  const courseId = useParams().courseId ?? '';
  const key = `${courseId}:${section}`;
  // The result is stored with the key it belongs to, so a new course or section shows "loading" again.
  const [result, setResult] = useState<{ key: string; view: ReaderView | null } | null>(null);
  const [image, setImage] = useState<OpenedImage | null>(null);
  const { scale, increase, decrease, pinchHandlers } = useFontScale();
  const closeImage = useCallback(() => setImage(null), []);

  useEffect(() => {
    let cancelled = false;
    void readSection(courseId, section).then((view) => {
      if (cancelled) return;
      setResult({ key, view });
      // P08: remember that the course was opened (the report says "opened", not "finished"). Never blocks or breaks reading:
      // a locked store or a missing database only means the course is not counted.
      if (view !== null) void markCourseOpened(courseId).catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [courseId, section, key]);

  const title = t(section === 'overview' ? 'course.tile.overview' : 'course.tile.content');

  const back = (
    <div className="np-reader__actions">
      <Button variant="secondary" icon={<ArrowLeft size={20} aria-hidden="true" />} onClick={() => navigate(`/course/${courseId}`)}>
        {t('course.backToCourse')}
      </Button>
    </div>
  );

  if (result === null || result.key !== key) {
    return (
      <section className="np-reader">
        <p role="status" className="np-reader__sr">
          {t('course.loading')}
        </p>
        <Card className="np-reader__skeleton" aria-hidden="true" />
      </section>
    );
  }

  if (result.view === null) {
    return (
      <section className="np-reader">
        <h1 className="np-reader__title">{title}</h1>
        <Card className="np-reader__message">
          <NotAvailable />
        </Card>
        {back}
      </section>
    );
  }

  const { courseTitle, blocks } = result.view;
  return (
    <section className="np-reader">
      <header className="np-reader__header">
        <div>
          <p className="np-reader__course">{courseTitle}</p>
          <h1 className="np-reader__title">{title}</h1>
        </div>
        <FontControls scale={scale} onDecrease={decrease} onIncrease={increase} />
      </header>

      <Card className="np-reader__card">
        <div className="np-reader__area" style={{ fontSize: `${scale}rem` }} {...pinchHandlers}>
          <BlockView blocks={blocks} courseId={courseId} onOpenImage={setImage} />
        </div>
      </Card>

      {back}
      {image && <ImageViewer image={image} onClose={closeImage} />}
    </section>
  );
}
