import { useEffect, useState, type FormEvent } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { t, type TextKey } from '../../core/i18n';
import {
  checkPin,
  disablePin,
  enablePin,
  getPinState,
  MAX_PIN_TRIES,
  PIN_LENGTH,
  type PinProblem,
  type PinState,
} from '../../core/identity/pin';
import { getEnrolKey, unlock } from '../../core/identity/session';
import { Button, Card } from '../../core/ui';
import './PinCard.css';

type Step = 'idle' | 'words' | 'pin';
type Notice =
  | 'badWords'
  | 'wrongKey'
  | 'wrongLength'
  | 'notDigits'
  | 'tooEasy'
  | 'mismatch'
  | 'noKey'
  | 'failed'
  | 'offFailed'
  | 'offNotSaved';

const NOTICE_TEXT: Record<Notice, TextKey> = {
  badWords: 'pin.card.badWords',
  wrongKey: 'pin.card.wrongKey',
  wrongLength: 'pin.setup.wrongLength',
  notDigits: 'pin.setup.notDigits',
  tooEasy: 'pin.setup.tooEasy',
  mismatch: 'pin.setup.mismatch',
  noKey: 'pin.setup.noKey',
  failed: 'pin.setup.failed',
  offFailed: 'pin.card.turnOffFailed',
  offNotSaved: 'pin.card.offNotSaved',
};

const PROBLEM_NOTICE: Record<PinProblem, Notice> = {
  wrong_length: 'wrongLength',
  not_digits: 'notDigits',
  too_easy: 'tooEasy',
};

// PIN lock toggle (SPEC C7, P04 T12c). Reusable: the real Settings screen (P09) only places this card.
// - On: says so and offers "Turn off" (needs the unlocked app, which Settings always is).
// - Off: "Turn on" needs the in-memory enrolment key made by Register/Login. After a reload there is none, so the card asks for the 12 words once
//   (unlock) to make one, then asks for the new PIN twice. The typed words and PINs stay in this component's state only and are cleared as soon as they were used.
// Both locks may be on (T12d): a good fingerprint opens the app, otherwise the PIN does. Nothing here depends on the fingerprint lock.
export function PinCard() {
  const [state, setState] = useState<PinState | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [words, setWords] = useState('');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPinState()
      .catch((): PinState => ({ enabled: false, triesLeft: MAX_PIN_TRIES }))
      .then((value) => {
        if (!cancelled) setState(value);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function turnOn() {
    if (busy) return;
    setNotice(null);
    setStep(getEnrolKey() === null ? 'words' : 'pin');
  }

  function cancelForm() {
    setStep('idle');
    setWords('');
    setPin('');
    setAgain('');
    setNotice(null);
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
        if (getEnrolKey() === null) setNotice('failed');
        else setStep('pin');
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

  async function onPinSubmit(event: FormEvent<HTMLFormElement>) {
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
        setState({ enabled: true, triesLeft: MAX_PIN_TRIES });
        setStep('idle');
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

  async function turnOff() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await disablePin();
      if (result.status === 'ok') {
        setState({ enabled: false, triesLeft: MAX_PIN_TRIES });
        if (!result.persisted) setNotice('offNotSaved');
      } else {
        setNotice('offFailed');
      }
    } catch {
      setNotice('offFailed');
    }
    setBusy(false);
  }

  const noticeIsCalm = notice === 'offNotSaved';
  const fieldClass = notice !== null && !noticeIsCalm && step === 'pin' ? 'np-field np-field--error' : 'np-field';
  const wordsFieldClass = notice === 'badWords' || notice === 'wrongKey' ? 'np-field np-field--error' : 'np-field';

  return (
    <Card className="np-pin-card">
      <h2 id="np-pin-card-title" className="np-pin-card__title">
        <Lock size={22} aria-hidden="true" />
        {t('pin.card.title')}
      </h2>
      <p className="np-pin-card__body">{t('pin.card.intro')}</p>

      {state !== null && state.enabled && (
        <>
          <p role="status" className="np-pin-card__state">
            <ShieldCheck size={20} aria-hidden="true" />
            <span>{t('pin.card.stateOn')}</span>
          </p>
          <div className="np-pin-card__actions">
            <Button variant="secondary" disabled={busy} onClick={() => void turnOff()}>
              {t('pin.card.turnOff')}
            </Button>
          </div>
        </>
      )}

      {state !== null && !state.enabled && (
        <>
          <p role="status" className="np-pin-card__state">
            {t('pin.card.stateOff')}
          </p>

          {step === 'idle' && (
            <div className="np-pin-card__actions">
              <Button icon={<Lock size={20} aria-hidden="true" />} disabled={busy} onClick={turnOn}>
                {t('pin.card.turnOn')}
              </Button>
            </div>
          )}

          {step === 'words' && (
            <form className="np-pin-card__form" noValidate onSubmit={(event) => void onWordsSubmit(event)}>
              <p className="np-pin-card__body">{t('pin.card.wordsPrompt')}</p>
              <div className={wordsFieldClass}>
                <label className="np-field__label" htmlFor="np-pin-card-words">
                  {t('pin.card.wordsLabel')}
                </label>
                <textarea
                  id="np-pin-card-words"
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
              <div className="np-pin-card__actions">
                <Button type="button" variant="secondary" disabled={busy} onClick={cancelForm}>
                  {t('pin.card.wordsCancel')}
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? t('pin.card.working') : t('pin.card.wordsContinue')}
                </Button>
              </div>
            </form>
          )}

          {step === 'pin' && (
            <form className="np-pin-card__form" noValidate onSubmit={(event) => void onPinSubmit(event)}>
              <div className={fieldClass}>
                <label className="np-field__label" htmlFor="np-pin-card-new">
                  {t('pin.setup.pinLabel')}
                </label>
                <input
                  id="np-pin-card-new"
                  className="np-field__input np-pin-card__input"
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
                <label className="np-field__label" htmlFor="np-pin-card-again">
                  {t('pin.setup.againLabel')}
                </label>
                <input
                  id="np-pin-card-again"
                  className="np-field__input np-pin-card__input"
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
              </div>
              <p className="np-pin-card__body">{t('pin.setup.tries')}</p>
              <div className="np-pin-card__actions">
                <Button type="button" variant="secondary" disabled={busy} onClick={cancelForm}>
                  {t('pin.card.cancel')}
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? t('pin.card.working') : t('pin.card.save')}
                </Button>
              </div>
            </form>
          )}
        </>
      )}

      {notice !== null &&
        (noticeIsCalm ? (
          <p role="status" className="np-pin-card__body">
            {t(NOTICE_TEXT[notice])}
          </p>
        ) : (
          <p role="alert" className="np-pin-card__alert">
            <span aria-hidden="true">! </span>
            {t(NOTICE_TEXT[notice])}
          </p>
        ))}
    </Card>
  );
}
