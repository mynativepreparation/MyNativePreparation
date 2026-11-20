import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../core/i18n';
import { AUTH_ROUTES, markOnboarded } from '../../core/identity/status';
import { Button, Card } from '../../core/ui';
import './PrivacyScreen.css';

// Privacy note (P04 T10): the honest wording from the phase Design, one statement per paragraph.
// OK remembers that onboarding is finished on this device (identity.onboarded) and goes to Home.
// The texts live in en.json (privacy.*); never add marketing claims here.
export function PrivacyScreen() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onOk() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await markOnboarded();
      navigate(AUTH_ROUTES.home);
      return;
    } catch {
      // Never show the raw error; the person can press OK again.
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <main className="np-privacy">
      <span className="np-privacy__icon" aria-hidden="true">
        <ShieldCheck size={36} />
      </span>
      <h1>{t('privacy.title')}</h1>

      <Card className="np-privacy__card">
        <p>{t('privacy.noServer')}</p>
        <p>{t('privacy.noRecovery')}</p>
        <p>{t('privacy.notHidden')}</p>
        <p>{t('privacy.github')}</p>
      </Card>

      {failed && (
        <p role="alert" className="np-privacy__error">
          <span aria-hidden="true">! </span>
          {t('privacy.failed')}
        </p>
      )}

      <div className="np-privacy__actions">
        <Button size="lg" disabled={busy} onClick={() => void onOk()}>
          {t('privacy.ok')}
        </Button>
      </div>
    </main>
  );
}
