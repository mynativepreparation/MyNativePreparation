import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../core/i18n';
import { generateMnemonic12 } from '../../core/identity/mnemonic';
import { createIdentity } from '../../core/identity/session';
import { AUTH_ROUTES, isOnboarded } from '../../core/identity/status';
import { Button, Card, Surface, Toast } from '../../core/ui';
import './RegisterScreen.css';

const TOAST_MS = 4000;

// Register (P04 T8): shows a NEW 12-word key once. The words live only in this component's state (never stored, logged or sent
// through the wire). The identity is created when the person confirms with the checkbox and presses Continue.
export function RegisterScreen() {
  const navigate = useNavigate();
  const [words] = useState(() => generateMnemonic12());
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasOldData, setHasOldData] = useState(false);

  // A returning, logged-out person may still land here: a NEW key cannot open the old data on this device, so say so.
  useEffect(() => {
    let cancelled = false;
    void isOnboarded().then((onboarded) => {
      if (!cancelled) setHasOldData(onboarded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The local toast hides itself after a few seconds (the plain layout has no app-wide toast host).
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function copyWords() {
    try {
      // If the browser has no clipboard (or refuses), this throws and the words stay on screen to be copied by hand.
      await navigator.clipboard.writeText(words);
      setMessage(t('register.copied'));
    } catch {
      setMessage(t('register.copyFailed'));
    }
  }

  async function onContinue() {
    if (!saved || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await createIdentity(words);
      if (result.status === 'ok') {
        navigate(AUTH_ROUTES.fingerprint);
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <main className="np-register">
      <h1>{t('register.title')}</h1>
      <p>{t('register.intro')}</p>

      {hasOldData && (
        <Card className="np-register__notice">
          <ShieldAlert size={24} aria-hidden="true" />
          <p>{t('register.replaceWarning')}</p>
        </Card>
      )}

      <Surface>
        <ol className="np-register__words" aria-label={t('register.title')}>
          {words.split(' ').map((word, index) => (
            <li key={index} className="np-register__item">
              <span className="np-register__num">
                <span className="np-register__sr">{t('register.wordPrefix')} </span>
                {index + 1}
              </span>
              <span className="np-register__word">{word}</span>
            </li>
          ))}
        </ol>
      </Surface>

      <div className="np-register__copy">
        <Button variant="secondary" icon={<Copy size={20} aria-hidden="true" />} onClick={() => void copyWords()}>
          {t('register.copy')}
        </Button>
      </div>

      <Card className="np-register__notice">
        <ShieldAlert size={24} aria-hidden="true" />
        <p>{t('register.warning')}</p>
      </Card>

      <label className="np-register__confirm">
        <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
        <span>{t('register.saved')}</span>
      </label>

      {failed && (
        <p role="alert" className="np-register__error">
          <span aria-hidden="true">! </span>
          {t('register.error')}
        </p>
      )}

      <div className="np-register__actions">
        <Button variant="secondary" icon={<ArrowLeft size={20} aria-hidden="true" />} onClick={() => navigate(AUTH_ROUTES.welcome)}>
          {t('register.back')}
        </Button>
        <Button disabled={!saved || busy} onClick={() => void onContinue()}>
          {busy ? t('register.creating') : t('register.continue')}
        </Button>
      </div>

      {message && <Toast message={message} />}
    </main>
  );
}
