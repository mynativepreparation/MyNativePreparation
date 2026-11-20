import { useState, type FormEvent } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { t, type TextKey } from '../../core/i18n';
import { checkPin, enablePin, PIN_LENGTH, type PinProblem } from '../../core/identity/pin';
import { clearEnrolKey } from '../../core/identity/session';
import { AUTH_ROUTES } from '../../core/identity/status';
import { Button, Card } from '../../core/ui';
import './PinScreen.css';

type Notice = 'wrongLength' | 'notDigits' | 'tooEasy' | 'mismatch' | 'noKey' | 'failed';

const NOTICE_TEXT: Record<Notice, TextKey> = {
  wrongLength: 'pin.setup.wrongLength',
  notDigits: 'pin.setup.notDigits',
  tooEasy: 'pin.setup.tooEasy',
  mismatch: 'pin.setup.mismatch',
  noKey: 'pin.setup.noKey',
  failed: 'pin.setup.failed',
};

const PROBLEM_NOTICE: Record<PinProblem, Notice> = {
  wrong_length: 'wrongLength',
  not_digits: 'notDigits',
  too_easy: 'tooEasy',
};

// PIN offer (P04 T12c), shown after the fingerprint offer was skipped. Optional: "Skip for now" always works and the 12 words always unlock.
// Both locks may be on (T12d), but this offer only appears after Skip; the second lock is set from Settings. The screen never holds the 12 words; enablePin uses the in-memory enrolment key
// made by createIdentity/unlock (see keyring.ts). The PIN lives only in this component's state and is cleared as soon as it was used.
export function PinSetupScreen() {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [done, setDone] = useState(false);

  function next() {
    clearEnrolKey();
    navigate(AUTH_ROUTES.info);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const checked = checkPin(pin);
    if (!checked.ok) {
      setNotice(PROBLEM_NOTICE[checked.reason]);
      return;
    }
    if (pin !== again) {
      setNotice('mismatch');
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const result = await enablePin(pin);
      if (result.status === 'ok') {
        setDone(true);
      } else if (result.status === 'invalid_pin') {
        setNotice(PROBLEM_NOTICE[result.problem]);
      } else if (result.status === 'needs_words') {
        setNotice('noKey');
      } else {
        setNotice('failed');
      }
    } catch {
      setNotice('failed');
    }
    setPin('');
    setAgain('');
    setBusy(false);
  }

  if (done) {
    return (
      <main className="np-pin">
        <h1>{t('pin.setup.title')}</h1>
        <Card className="np-pin__notice">
          <ShieldCheck size={24} aria-hidden="true" />
          <p role="status">{t('pin.setup.done')}</p>
        </Card>
        <p>{t('pin.setup.tries')}</p>
        <div className="np-pin__actions">
          <Button onClick={next}>{t('pin.setup.continue')}</Button>
        </div>
      </main>
    );
  }

  const fieldClass = notice ? 'np-field np-field--error' : 'np-field';
  return (
    <main className="np-pin">
      <h1>{t('pin.setup.title')}</h1>
      <p>{t('pin.setup.intro')}</p>
      <p>{t('pin.setup.honest')}</p>
      <p>{t('pin.setup.tries')}</p>

      <form className="np-pin__form" noValidate onSubmit={(event) => void onSubmit(event)}>
        <div className={fieldClass}>
          <label className="np-field__label" htmlFor="np-pin-new">
            {t('pin.setup.pinLabel')}
          </label>
          <input
            id="np-pin-new"
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
            disabled={busy}
          />
        </div>
        <div className={fieldClass}>
          <label className="np-field__label" htmlFor="np-pin-again">
            {t('pin.setup.againLabel')}
          </label>
          <input
            id="np-pin-again"
            className="np-field__input np-pin__input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={PIN_LENGTH}
            value={again}
            onChange={(event) => {
              setAgain(event.target.value);
              setNotice(null);
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
          />
          {notice && (
            <p role="alert" className="np-field__error">
              <span aria-hidden="true">! </span>
              {t(NOTICE_TEXT[notice])}
            </p>
          )}
        </div>

        <div className="np-pin__actions">
          <Button type="submit" icon={<Lock size={20} aria-hidden="true" />} disabled={busy}>
            {busy ? t('pin.setup.turningOn') : t('pin.setup.turnOn')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={next}>
            {t('pin.setup.skip')}
          </Button>
        </div>
      </form>
    </main>
  );
}
