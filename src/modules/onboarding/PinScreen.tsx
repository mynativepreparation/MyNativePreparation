import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { t, tf } from '../../core/i18n';
import { PIN_LENGTH, unlockWithPin } from '../../core/identity/pin';
import { afterUnlockPath, returnStateFor } from '../../core/identity/returnTo';
import { AUTH_ROUTES } from '../../core/identity/status';
import { Button } from '../../core/ui';
import './PinScreen.css';

type Notice = { kind: 'invalid' } | { kind: 'wrong'; triesLeft: number } | { kind: 'tooMany' } | { kind: 'failed' };

function noticeText(notice: Notice): string {
  if (notice.kind === 'invalid') return t('pin.enter.invalid');
  if (notice.kind === 'wrong') return tf('pin.enter.wrong', { n: notice.triesLeft });
  if (notice.kind === 'tooMany') return t('pin.enter.tooMany');
  return t('pin.enter.failed');
}

// PIN lock screen (P04 T12c): the front door of an app that is locked with a PIN. The PIN lives only in this component's state and is
// cleared after every try. The 12 words always work: "Use my 12 words instead" goes to Login.
export function PinScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  // The address that was asked for before the lock (a deep link such as #/admin) travels in the router state.
  const toLogin = () => navigate(AUTH_ROUTES.login, { state: returnStateFor(location.state, location.pathname) });
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const removed = notice?.kind === 'tooMany';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || removed) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await unlockWithPin(pin);
      if (result.status === 'ok') {
        navigate(afterUnlockPath(location.state));
        return;
      }
      if (result.status === 'no_pin') {
        toLogin();
        return;
      }
      if (result.status === 'invalid_pin') setNotice({ kind: 'invalid' });
      else if (result.status === 'wrong_pin') setNotice({ kind: 'wrong', triesLeft: result.triesLeft });
      else if (result.status === 'too_many_tries') setNotice({ kind: 'tooMany' });
      else setNotice({ kind: 'failed' });
    } catch {
      setNotice({ kind: 'failed' });
    }
    setPin('');
    setBusy(false);
  }

  return (
    <main className="np-pin">
      <h1>{t('pin.enter.title')}</h1>
      <p>{t('pin.enter.intro')}</p>

      <form className="np-pin__form" noValidate onSubmit={(event) => void onSubmit(event)}>
        <div className={notice ? 'np-field np-field--error' : 'np-field'}>
          <label className="np-field__label" htmlFor="np-pin-enter">
            {t('pin.enter.label')}
          </label>
          <input
            id="np-pin-enter"
            className="np-field__input np-pin__input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={(event) => {
              setPin(event.target.value);
              setNotice(null);
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            disabled={busy || removed}
            aria-invalid={notice ? true : undefined}
            aria-describedby="np-pin-enter-message"
          />
          <div id="np-pin-enter-message">
            {notice && (
              <p role="alert" className="np-field__error">
                <span aria-hidden="true">! </span>
                {noticeText(notice)}
              </p>
            )}
          </div>
        </div>

        <div className="np-pin__actions">
          {!removed && (
            <Button type="submit" icon={<KeyRound size={20} aria-hidden="true" />} disabled={busy}>
              {busy ? t('pin.enter.checking') : t('pin.enter.button')}
            </Button>
          )}
          <Button variant="secondary" disabled={busy} onClick={toLogin}>
            {t('pin.enter.useWords')}
          </Button>
        </div>
      </form>
    </main>
  );
}
