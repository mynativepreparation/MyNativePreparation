import { t, tf } from '../../core/i18n';
import { Button } from '../../core/ui';
import { PUBLISH_ERROR_TEXT } from './publishText';
import { useLiveCheck, type UseLiveCheckDeps } from './useLiveCheck';
import type { PublishKind, PublishState } from './usePublish';

// The two small pieces of the Publish / Unpublish screens (P11 T5 step b): the question "really go live?" and the result line.
// Both are shown in the course list (per course) and in the course window. They hold no publish state: CourseManager owns it
// (the result line only adds the "Live now" check of T9, see useLiveCheck.ts).
// They use the classes of CourseManager.css; the rows that could collide on a narrow screen carry `data-np-check`.

/** How many problems of an invalid course are listed under the error line. */
const MAX_PROBLEMS = 3;

export interface PublishConfirmProps {
  kind: PublishKind;
  title: string;
  /** True while a run is going: both buttons are off. */
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PublishConfirm({ kind, title, busy, onConfirm, onCancel }: PublishConfirmProps) {
  const publishing = kind === 'publish';
  return (
    <div
      className="np-courses__confirm"
      role="group"
      aria-label={tf(publishing ? 'admin.publish.confirmPublishLabel' : 'admin.publish.confirmUnpublishLabel', { title })}
    >
      <p className="np-courses__text">
        {tf(publishing ? 'admin.publish.confirmPublishText' : 'admin.publish.confirmUnpublishText', { title })}
      </p>
      <div className="np-courses__actions" data-np-check>
        <Button variant="secondary" disabled={busy} onClick={onConfirm}>
          {t(publishing ? 'admin.publish.confirmPublishYes' : 'admin.publish.confirmUnpublishYes')}
        </Button>
        <Button variant="secondary" autoFocus disabled={busy} onClick={onCancel}>
          {t('admin.publish.cancel')}
        </Button>
      </div>
    </div>
  );
}

export interface PublishResultProps {
  state: PublishState;
  /** Clears the result (the hook's `reset`). */
  onClose: () => void;
  /** Tests hand in a fake wait for the "Live now" check; the app uses the real one. */
  liveDeps?: UseLiveCheckDeps | undefined;
}

/** The text of the "Live now" line under the result line. `idle` (nothing was sent) shows no line. */
const LIVE_TEXT = {
  checking: 'admin.publish.live.checking',
  live: 'admin.publish.live.live',
  waiting: 'admin.publish.live.waiting',
} as const;

export function PublishResult({ state, onClose, liveDeps }: PublishResultProps) {
  const live = useLiveCheck(state, liveDeps);
  if (state.phase === 'idle') return null;
  if (state.phase === 'working') {
    return (
      <p role="status" className="np-courses__text">
        {t(state.step === 'checking' ? 'admin.publish.checking' : 'admin.publish.uploading')}
      </p>
    );
  }
  if (state.phase === 'done') {
    const text = state.unchanged ? 'admin.publish.unchanged' : state.kind === 'publish' ? 'admin.publish.done' : 'admin.publish.unpublished';
    return (
      <div role="status" className="np-courses__result">
        <p className="np-courses__text">{t(text)}</p>
        {live !== 'idle' && <p className="np-courses__text">{t(LIVE_TEXT[live])}</p>}
        {state.commitSha !== null && (
          <p className="np-courses__meta">{tf('admin.publish.commit', { id: state.commitSha.slice(0, 7) })}</p>
        )}
        <div className="np-courses__actions" data-np-check>
          <Button variant="secondary" onClick={onClose}>
            {t('admin.publish.close')}
          </Button>
        </div>
      </div>
    );
  }
  const problems = state.code === 'invalid' ? state.errors.slice(0, MAX_PROBLEMS) : [];
  return (
    <div role="alert" className="np-courses__result">
      <p className="np-courses__error">
        <span aria-hidden="true">! </span>
        {t(PUBLISH_ERROR_TEXT[state.code])}
      </p>
      {problems.length > 0 && (
        <ul className="np-courses__problems">
          {problems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      )}
      <div className="np-courses__actions" data-np-check>
        <Button variant="secondary" onClick={onClose}>
          {t('admin.publish.close')}
        </Button>
      </div>
    </div>
  );
}
