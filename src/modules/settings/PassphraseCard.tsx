import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { t } from '../../core/i18n';
import { logOut } from '../../core/identity/session';
import { Button, Card } from '../../core/ui';
import './PassphraseCard.css';

// Passphrase information (SPEC C7, P04 T12): read-only explanation of the 12 words plus the Log out action.
// Reusable: the real Settings screen (P09) only places this card. Log out asks for confirmation first and warns that the
// 12 words are needed to log in again. After logOut() the app's route guard (listening to `identity:locked`) shows Login.
export function PassphraseCard() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onConfirm() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await logOut();
      setConfirming(false);
    } catch {
      // Never show the raw error; the person can try again.
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <Card className="np-passphrase">
      <h2 id="np-passphrase-title" className="np-passphrase__title">
        <KeyRound size={22} aria-hidden="true" />
        {t('passphrase.title')}
      </h2>
      <p className="np-passphrase__body">{t('passphrase.body')}</p>

      {!confirming && (
        <Button
          variant="secondary"
          icon={<LogOut size={20} aria-hidden="true" />}
          onClick={() => {
            setFailed(false);
            setConfirming(true);
          }}
        >
          {t('passphrase.logout')}
        </Button>
      )}

      {confirming && (
        <div className="np-passphrase__confirm" role="group" aria-label={t('passphrase.logout')}>
          <p className="np-passphrase__warn">
            <span aria-hidden="true">! </span>
            {t('passphrase.logoutWarn')}
          </p>
          {failed && (
            <p role="alert" className="np-passphrase__error">
              <span aria-hidden="true">! </span>
              {t('passphrase.logoutFailed')}
            </p>
          )}
          <div className="np-passphrase__actions">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              {t('passphrase.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void onConfirm()}>
              {t('passphrase.logoutConfirm')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
