import { useEffect, useState, type FormEvent } from 'react';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { t } from '../../core/i18n';
import {
  browserPlatformAuth,
  disableFingerprint,
  enableFingerprint,
  getFingerprintState,
  type FingerprintState,
  type PlatformAuth,
} from '../../core/identity/biometric';
import { clearEnrolKey, getEnrolKey, unlock } from '../../core/identity/session';
import { Button, Card } from '../../core/ui';
import './FingerprintCard.css';

type Notice = 'cancelled' | 'unavailable' | 'failed' | 'offFailed' | 'badWords' | 'wrongKey';

// Fingerprint lock toggle (SPEC C7, P04 T12b). Reusable: the real Settings screen (P09) only places this card.
// - On: shows which level this device got (PRF or gate wording) and a "Turn off" button.
// - Off: "Turn on" needs the in-memory enrolment key made by Register/Login. After a reload there is none, so the card asks for the 12 words once
//   (unlock) to make one. The typed words stay in this component's state only and are cleared as soon as unlock succeeds; never stored or logged.
// Cancelling the phone prompt is a normal answer (a calm note), never an error.
export function FingerprintCard({ auth = browserPlatformAuth }: { auth?: PlatformAuth }) {
  const [state, setState] = useState<FingerprintState | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [askingWords, setAskingWords] = useState(false);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getFingerprintState()
      .catch((): FingerprintState => ({ enabled: false }))
      .then((value) => {
        if (!cancelled) setState(value);
      });
    void auth
      .isAvailable()
      .catch(() => false)
      .then((ok) => {
        if (!cancelled) setAvailable(ok);
      });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  async function enableWith(key: CryptoKey) {
    const result = await enableFingerprint(key, auth);
    if (result.status === 'ok') {
      clearEnrolKey();
      setAskingWords(false);
      setState({ enabled: true, level: result.level });
    } else if (result.status === 'cancelled') {
      setNotice('cancelled');
    } else if (result.status === 'unsupported') {
      setNotice('unavailable');
    } else {
      setNotice('failed');
    }
  }

  async function turnOn() {
    if (busy) return;
    setNotice(null);
    const key = getEnrolKey();
    if (key === null) {
      setAskingWords(true);
      return;
    }
    setBusy(true);
    try {
      await enableWith(key);
    } catch {
      setNotice('failed');
    }
    setBusy(false);
  }

  async function onWordsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (words.trim() === '') {
      setNotice('badWords');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await unlock(words);
      if (result.status === 'ok') {
        setWords('');
        const key = getEnrolKey();
        if (key === null) setNotice('failed');
        else await enableWith(key);
      } else if (result.status === 'wrong_key') {
        setNotice('wrongKey');
      } else {
        setNotice('badWords');
      }
    } catch {
      setNotice('failed');
    }
    setBusy(false);
  }

  async function turnOff() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await disableFingerprint();
      if (result.status === 'ok') setState({ enabled: false });
      else setNotice('offFailed');
    } catch {
      setNotice('offFailed');
    }
    setBusy(false);
  }

  function cancelWords() {
    setAskingWords(false);
    setWords('');
    setNotice(null);
  }

  const noticeText =
    notice === 'cancelled'
      ? t('fingerprint.card.cancelled')
      : notice === 'unavailable'
        ? t('fingerprint.card.unavailable')
        : notice === 'failed'
          ? t('fingerprint.card.failed')
          : notice === 'offFailed'
            ? t('fingerprint.card.turnOffFailed')
            : notice === 'badWords'
              ? t('fingerprint.card.badWords')
              : notice === 'wrongKey'
                ? t('fingerprint.card.wrongKey')
                : null;
  const noticeIsCalm = notice === 'cancelled' || notice === 'unavailable';

  return (
    <Card className="np-fingerprint-card">
      <h2 id="np-fingerprint-card-title" className="np-fingerprint-card__title">
        <Fingerprint size={22} aria-hidden="true" />
        {t('fingerprint.card.title')}
      </h2>
      <p className="np-fingerprint-card__body">{t('fingerprint.card.intro')}</p>

      {state !== null && state.enabled && (
        <>
          <p role="status" className="np-fingerprint-card__state">
            <ShieldCheck size={20} aria-hidden="true" />
            <span>{state.level === 'prf' ? t('fingerprint.screen.donePrf') : t('fingerprint.screen.doneGate')}</span>
          </p>
          <div className="np-fingerprint-card__actions">
            <Button variant="secondary" disabled={busy} onClick={() => void turnOff()}>
              {t('fingerprint.card.turnOff')}
            </Button>
          </div>
        </>
      )}

      {state !== null && !state.enabled && (
        <>
          <p role="status" className="np-fingerprint-card__state">
            {t('fingerprint.card.stateOff')}
          </p>
          {available === false && <p className="np-fingerprint-card__body">{t('fingerprint.card.unavailable')}</p>}

          {!askingWords && (
            <div className="np-fingerprint-card__actions">
              <Button
                icon={<Fingerprint size={20} aria-hidden="true" />}
                disabled={busy || available !== true}
                onClick={() => void turnOn()}
              >
                {busy ? t('fingerprint.card.working') : t('fingerprint.card.turnOn')}
              </Button>
            </div>
          )}

          {askingWords && (
            <form className="np-fingerprint-card__form" noValidate onSubmit={(event) => void onWordsSubmit(event)}>
              <p className="np-fingerprint-card__body">{t('fingerprint.card.wordsPrompt')}</p>
              <div className={notice === 'badWords' || notice === 'wrongKey' ? 'np-field np-field--error' : 'np-field'}>
                <label className="np-field__label" htmlFor="np-fingerprint-card-words">
                  {t('fingerprint.card.wordsLabel')}
                </label>
                <textarea
                  id="np-fingerprint-card-words"
                  className="np-field__input"
                  value={words}
                  onChange={(event) => {
                    setWords(event.target.value);
                    setNotice(null);
                  }}
                  rows={3}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  disabled={busy}
                />
              </div>
              <div className="np-fingerprint-card__actions">
                <Button type="button" variant="secondary" disabled={busy} onClick={cancelWords}>
                  {t('fingerprint.card.wordsCancel')}
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? t('fingerprint.card.working') : t('fingerprint.card.wordsContinue')}
                </Button>
              </div>
            </form>
          )}
        </>
      )}

      {noticeText !== null &&
        (noticeIsCalm ? (
          <p role="status" className="np-fingerprint-card__body">
            {noticeText}
          </p>
        ) : (
          <p role="alert" className="np-fingerprint-card__alert">
            <span aria-hidden="true">! </span>
            {noticeText}
          </p>
        ))}
    </Card>
  );
}
