import { ArrowLeft, Download, FileText } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadManifest } from '../../core/content/loader';
import { t, tf } from '../../core/i18n';
import { LockedError } from '../../core/identity/keyring';
import { getOpenedCourseIds, getProfile, listAttempts } from '../../core/storage/repo';
import { Button, Card, NotAvailable, ProgressBar, StarRating, TextField } from '../../core/ui';
import { createBrowserSaveEnvironment } from './browserSaveEnvironment';
import { reportLabels } from './labels';
import { loadReportInput, ManifestUnavailableError, type ReportScope, type ReportSources } from './loadReportInput';
import { makeReportPdf } from './makeReportPdf';
import { buildReportModel, isReportEmpty, type BuildReportInput, type CourseReport } from './reportData';
import { defaultReportName, savePdf, type SaveEnvironment } from './savePdf';
import './ReportScreen.css';

// The Report screen (P08 T7c, SPEC C6): summary of the progress, scope switch, file name, Create PDF, Save / Share.
// All rules live in the pure files (loadReportInput, reportData, makeReportPdf, savePdf); this screen only wires them.
// - Route `course/:courseId/report` (registered in T7d). An unknown course id = the owner's "not available" text + Back.
// - Everything the screen needs from outside arrives as OPTIONAL props with the real functions as defaults, so tests pass fakes.
// - Create PDF and Save are two taps on purpose: sharing needs a fresh tap (user gesture) and the name can be edited in between.
// - The PDF library is never imported here: `makeReportPdf` loads it with `import()` when the person taps Create PDF.
// - Nothing from an old run can land in a new one: a scope change (or closing the screen) makes late results be ignored.

export interface ReportScreenProps {
  /** The four data functions. Tests pass fakes; the app uses the real content loader and repository. */
  sources?: ReportSources;
  /** Tests pass a fake; the app uses the real PDF maker. */
  makePdf?: typeof makeReportPdf;
  /** Tests pass a fake; the app uses the real save logic. */
  save?: typeof savePdf;
  /** Tests pass a fake; the app builds the real browser environment when the person taps Save. */
  saveEnvironment?: SaveEnvironment;
  /** The current time, for the default file name and the date in the PDF header. Tests pass a fixed one. */
  now?: () => Date;
}

type SaveResult = Awaited<ReturnType<typeof savePdf>>;
type ErrorKind = 'locked' | 'manifest' | 'other';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; input: BuildReportInput }
  | { status: 'notAvailable' }
  | { status: 'error'; kind: ErrorKind };

type PdfState = { status: 'idle' } | { status: 'busy' } | { status: 'ready'; bytes: Uint8Array } | { status: 'failed' };

const REAL_SOURCES: ReportSources = { loadManifest, listAttempts, getOpenedCourseIds, getProfile };

const realNow = (): Date => new Date();

const ERROR_TEXT: Record<ErrorKind, 'report.error.locked' | 'report.error.manifest' | 'report.error.other'> = {
  locked: 'report.error.locked',
  manifest: 'report.error.manifest',
  other: 'report.error.other',
};

function errorKind(error: unknown): ErrorKind {
  if (error instanceof LockedError) return 'locked';
  if (error instanceof ManifestUnavailableError) return 'manifest';
  return 'other';
}

/** "21 November 2026": the date line of the PDF header (the layout formats nothing itself). */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function saveText(result: SaveResult): string {
  if (result.status === 'saved') return tf('report.saved', { name: result.fileName });
  if (result.status === 'cancelled') return t('report.cancelled');
  return t('report.saveFailed');
}

function CourseSummary({ course }: { course: CourseReport }) {
  return (
    <Card className="np-report__course">
      <h2 className="np-report__course-title">{course.title}</h2>
      <p className="np-report__line">{course.opened ? t('reportPdf.opened') : t('reportPdf.notOpened')}</p>
      {course.testsTaken === 0 || course.bestPercent === null || course.lastPercent === null ? (
        <p className="np-report__line">{t('reportPdf.noTest')}</p>
      ) : (
        <>
          <p className="np-report__line">{tf('report.course.tests', { count: course.testsTaken })}</p>
          <p className="np-report__caption">{t('reportPdf.best')}</p>
          <ProgressBar value={course.bestPercent} label={t('reportPdf.best')} />
          <p className="np-report__line">{tf('report.course.last', { percent: course.lastPercent })}</p>
          <StarRating value={course.stars} tone="star" label={tf('report.course.stars', { stars: course.stars })} />
        </>
      )}
    </Card>
  );
}

/** The route element. The inner screen is keyed by course, so another course always starts from a clean state. */
export function ReportScreen(props: ReportScreenProps) {
  const courseId = useParams().courseId ?? '';
  return <Report key={courseId} courseId={courseId} {...props} />;
}

function Report({
  courseId,
  sources = REAL_SOURCES,
  makePdf = makeReportPdf,
  save = savePdf,
  saveEnvironment,
  now = realNow,
}: ReportScreenProps & { courseId: string }) {
  const navigate = useNavigate();
  const [scope, setScope] = useState<ReportScope>('all');
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const [pdf, setPdf] = useState<PdfState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SaveResult | null>(null);
  const [fileName, setFileName] = useState<string>(() => defaultReportName(now()));
  // Counts "runs" of Create / Save. A result that arrives for an older run (scope changed, screen closed) is ignored.
  const run = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadReportInput(scope, courseId, sources).then(
      (input) => {
        if (cancelled) return;
        if (input !== null && input.courses.some((course) => course.id === courseId)) {
          setLoad({ status: 'ready', input });
        } else {
          setLoad({ status: 'notAvailable' });
        }
      },
      (error: unknown) => {
        if (!cancelled) setLoad({ status: 'error', kind: errorKind(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scope, courseId, sources, reload]);

  useEffect(
    () => () => {
      run.current += 1;
    },
    [],
  );

  const model = useMemo(() => (load.status === 'ready' ? buildReportModel(load.input) : null), [load]);

  const forgetPdf = () => {
    run.current += 1;
    setPdf({ status: 'idle' });
    setSaving(false);
    setSaved(null);
  };

  const chooseScope = (next: ReportScope) => {
    if (next === scope) return;
    forgetPdf();
    setLoad({ status: 'loading' });
    setScope(next);
  };

  const retry = () => {
    forgetPdf();
    setLoad({ status: 'loading' });
    setReload((count) => count + 1);
  };

  const create = () => {
    if (model === null || isReportEmpty(model) || pdf.status === 'busy') return;
    run.current += 1;
    const mine = run.current;
    setPdf({ status: 'busy' });
    setSaved(null);
    void makePdf({ model, labels: reportLabels(), dateText: formatDate(now()) }).then(
      (bytes) => {
        if (run.current === mine) setPdf({ status: 'ready', bytes });
      },
      () => {
        if (run.current === mine) setPdf({ status: 'failed' });
      },
    );
  };

  const saveFile = () => {
    if (pdf.status !== 'ready' || saving) return;
    const mine = run.current;
    setSaving(true);
    setSaved(null);
    // Called straight from the tap (no waiting before it), so the browser still counts it as a user gesture for sharing.
    const environment = saveEnvironment ?? createBrowserSaveEnvironment();
    void save({ bytes: pdf.bytes, name: fileName, fallbackName: defaultReportName(now()) }, environment).then((result) => {
      if (run.current !== mine) return;
      setSaving(false);
      setSaved(result);
    });
  };

  const header = (
    <header className="np-report__header">
      <h1 className="np-report__title">{t('report.title')}</h1>
    </header>
  );

  const back = (
    <div className="np-report__actions">
      <Button
        variant="secondary"
        icon={<ArrowLeft size={20} aria-hidden="true" />}
        onClick={() => navigate(`/course/${courseId}`)}
      >
        {t('report.back')}
      </Button>
    </div>
  );

  if (load.status === 'notAvailable') {
    return (
      <section className="np-report" data-np-check>
        {header}
        <NotAvailable />
        {back}
      </section>
    );
  }

  const scopeSwitch = (
    <div className="np-report__scope" role="group" aria-label={t('report.scope.label')} data-np-check>
      <Button
        variant={scope === 'all' ? 'primary' : 'secondary'}
        aria-pressed={scope === 'all'}
        onClick={() => chooseScope('all')}
      >
        {t('report.scope.all')}
      </Button>
      <Button
        variant={scope === 'course' ? 'primary' : 'secondary'}
        aria-pressed={scope === 'course'}
        onClick={() => chooseScope('course')}
      >
        {t('report.scope.course')}
      </Button>
    </div>
  );

  let status = '';
  if (load.status === 'loading') status = t('report.loading');
  else if (pdf.status === 'busy') status = t('report.creating');
  else if (pdf.status === 'failed') status = t('report.createFailed');
  else if (saving) status = t('report.saving');
  else if (saved !== null) status = saveText(saved);
  else if (pdf.status === 'ready') status = t('report.ready');

  return (
    <section className="np-report" data-np-check>
      {header}
      {scopeSwitch}

      {load.status === 'loading' && <div className="np-report__skeleton" aria-hidden="true" />}

      {load.status === 'error' && (
        <Card className="np-report__error">
          <p role="alert" className="np-report__error-text">
            {t(ERROR_TEXT[load.kind])}
          </p>
          <Button onClick={retry}>{t('report.retry')}</Button>
        </Card>
      )}

      {model !== null && isReportEmpty(model) && <p className="np-report__empty">{t('report.empty')}</p>}

      {model !== null && !isReportEmpty(model) && (
        <>
          <Card>
            <dl className="np-report__totals" data-np-check>
              <div className="np-report__total">
                <dt>{t('reportPdf.coursesOpened')}</dt>
                <dd>{model.totals.coursesOpened}</dd>
              </div>
              <div className="np-report__total">
                <dt>{t('reportPdf.testsTaken')}</dt>
                <dd>{model.totals.testsTaken}</dd>
              </div>
              <div className="np-report__total">
                <dt>{t('reportPdf.stars')}</dt>
                <dd>{model.totals.stars}</dd>
              </div>
            </dl>
          </Card>

          <ul className="np-report__list" data-np-check>
            {model.courses.map((course) => (
              <li key={course.id}>
                <CourseSummary course={course} />
              </li>
            ))}
          </ul>

          <Card className="np-report__make">
            <TextField
              label={t('report.fileName.label')}
              hint={t('report.fileName.hint')}
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {pdf.status === 'ready' ? (
              <Button
                size="lg"
                icon={<Download size={20} aria-hidden="true" />}
                disabled={saving}
                onClick={saveFile}
              >
                {t('report.save')}
              </Button>
            ) : (
              <Button
                size="lg"
                icon={<FileText size={20} aria-hidden="true" />}
                disabled={pdf.status === 'busy'}
                onClick={create}
              >
                {t('report.create')}
              </Button>
            )}
          </Card>
        </>
      )}

      <p role="status" className="np-report__status">
        {status}
      </p>

      {back}
    </section>
  );
}
