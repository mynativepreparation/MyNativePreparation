import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { t, type TextKey } from '../../core/i18n';
import { Button, Card } from '../../core/ui';
import { checkForUpdate, type UpdateCheckResult } from '../../core/update/checkForUpdate';
import { useUpdateState } from '../../core/update/useUpdateState';
import './UpdateCard.css';

// "Update app" card (SPEC C7, P09 T2). UI only: the logic is core/update (checkForUpdate + the update store, DECISIONS Q23).
// Flow: the button checks online; a new version found (or already waiting) shows "Update now", which switches to the new
// version and reloads the page (saved data stays). Every message goes into ONE polite live region, so screen readers hear it.
// The raw error is never shown. The card is not placed in the Settings screen here (that is P09 T5).
type Status = 'idle' | 'checking' | UpdateCheckResult;

// 'available' is not here: it is shown as "A new version is ready" with the Update now button.
const RESULT_TEXT: Partial<Record<UpdateCheckResult, TextKey>> = {
  offline: 'update.offline',
  latest: 'update.latest',
  error: 'update.error',
  unsupported: 'update.unsupported',
};

// These messages start with "!" so they do not depend on color alone.
const WARNING_TEXT: ReadonlySet<TextKey> = new Set<TextKey>(['update.offline', 'update.error', 'update.applyFailed']);

function pickMessage(status: Status, ready: boolean, applying: boolean, applyFailed: boolean): TextKey | undefined {
  if (applying) return 'update.applying';
  if (applyFailed) return 'update.applyFailed';
  if (status === 'checking') return 'update.checking';
  if (ready) return 'update.ready';
  if (status === 'idle') return undefined;
  return RESULT_TEXT[status];
}

export function UpdateCard() {
  const { registration, needRefresh, apply } = useUpdateState();
  const [status, setStatus] = useState<Status>('idle');
  const [applying, setApplying] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);

  const checking = status === 'checking';
  const busy = checking || applying;
  // A version already waiting (reported by the service worker) counts as ready, even before the button is pressed.
  const ready = needRefresh || status === 'available';
  const message = pickMessage(status, ready, applying, applyFailed);
  const warning = message !== undefined && WARNING_TEXT.has(message);

  async function onCheck() {
    if (busy) return;
    setApplyFailed(false);
    setStatus('checking');
    // checkForUpdate never throws and ends within its own time limit (10 seconds).
    const result = await checkForUpdate({ registration, isOnline: () => navigator.onLine, needRefresh });
    setStatus(result);
  }

  async function onApply() {
    if (busy || !apply) return;
    setApplying(true);
    setApplyFailed(false);
    try {
      await apply();
      // Success: the page reloads on its own, so the card stays in the "Updating" state until then.
    } catch {
      // Never show the raw error; the person can try again.
      setApplyFailed(true);
      setApplying(false);
    }
  }

  return (
    <Card className="np-update">
      <h2 id="np-update-title" className="np-update__title">
        <RefreshCw size={22} aria-hidden="true" />
        {t('update.title')}
      </h2>
      <p className="np-update__body">{t('update.body')}</p>
      <p className="np-update__status" role="status" aria-live="polite">
        {warning ? <span aria-hidden="true">! </span> : null}
        {message ? t(message) : null}
      </p>
      <div className="np-update__actions">
        {ready ? (
          <Button
            icon={<Download size={20} aria-hidden="true" />}
            disabled={busy || !apply}
            aria-busy={applying}
            onClick={() => void onApply()}
          >
            {t('update.now')}
          </Button>
        ) : (
          <Button variant="secondary" disabled={busy} aria-busy={checking} onClick={() => void onCheck()}>
            {t('update.check')}
          </Button>
        )}
      </div>
    </Card>
  );
}
