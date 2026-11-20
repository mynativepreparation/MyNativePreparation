import { useEffect, useState } from 'react';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../core/i18n';
import { browserPlatformAuth, enableFingerprint, type FingerprintLevel, type PlatformAuth } from '../../core/identity/biometric';
import { clearEnrolKey, getEnrolKey } from '../../core/identity/session';
import { AUTH_ROUTES } from '../../core/identity/status';
import { Button, Card } from '../../core/ui';
import './FingerprintScreen.css';

type Notice = 'cancelled' | 'unsupported' | 'failed' | 'noKey';

// Fingerprint offer (P04 T12b), shown right after Register. Optional: "Skip for now" always works and the 12 words always unlock.
// The screen never holds the 12 words; it only uses the in-memory enrolment key made by createIdentity/unlock (see keyring.ts).
// Cancelling the phone prompt is a normal answer (a calm note), never an error screen.
export function FingerprintScreen({ auth = browserPlatformAuth }: { auth?: PlatformAuth }) {
  const navigate = useNavigate();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [level, setLevel] = useState<FingerprintLevel | null>(null);

  useEffect(() => {
    let cancelled = false;
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

  // Skip goes to the PIN offer and KEEPS the enrolment key for it (the PIN screen forgets it). Only one app lock works at a time.
  function skip() {
    navigate(AUTH_ROUTES.pinSetup);
  }

  function next() {
    clearEnrolKey();
    navigate(AUTH_ROUTES.info);
  }

  async function turnOn() {
    if (busy) return;
    const key = getEnrolKey();
    if (key === null) {
      setNotice('noKey');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await enableFingerprint(key, auth);
      if (result.status === 'ok') {
        clearEnrolKey();
        setLevel(result.level);
      } else if (result.status === 'cancelled') {
        setNotice('cancelled');
      } else if (result.status === 'unsupported') {
        setNotice('unsupported');
      } else {
        setNotice('failed');
      }
    } catch {
      setNotice('failed');
    }
    setBusy(false);
  }

  if (level !== null) {
    return (
      <main className="np-fingerprint">
        <h1>{t('fingerprint.title')}</h1>
        <Card className="np-fingerprint__notice">
          <ShieldCheck size={24} aria-hidden="true" />
          <p role="status">{level === 'prf' ? t('fingerprint.screen.donePrf') : t('fingerprint.screen.doneGate')}</p>
        </Card>
        <p>{t('fingerprint.screen.words')}</p>
        <div className="np-fingerprint__actions">
          <Button onClick={next}>{t('fingerprint.screen.continue')}</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="np-fingerprint">
      <h1>{t('fingerprint.title')}</h1>
      <p>{t('fingerprint.screen.intro')}</p>
      <p>{t('fingerprint.screen.words')}</p>
      <p>{t('fingerprint.screen.private')}</p>

      {available === false && <p role="status">{t('fingerprint.screen.unavailable')}</p>}
      {notice === 'cancelled' && <p role="status">{t('fingerprint.screen.cancelled')}</p>}
      {notice === 'unsupported' && <p role="status">{t('fingerprint.screen.unavailable')}</p>}
      {notice === 'failed' && <p role="alert">{t('fingerprint.screen.failed')}</p>}
      {notice === 'noKey' && <p role="alert">{t('fingerprint.screen.noKey')}</p>}

      <div className="np-fingerprint__actions">
        <Button
          icon={<Fingerprint size={20} aria-hidden="true" />}
          onClick={() => void turnOn()}
          disabled={busy || available !== true}
        >
          {busy ? t('fingerprint.screen.turningOn') : t('fingerprint.screen.turnOn')}
        </Button>
        <Button variant="secondary" onClick={skip} disabled={busy}>
          {t('fingerprint.screen.skip')}
        </Button>
      </div>
    </main>
  );
}
