import { useId } from 'react';
import { GraduationCap, LogIn, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../core/i18n';
import { AUTH_ROUTES } from '../../core/identity/status';
import { Button, Card } from '../../core/ui';
import './WelcomeScreen.css';

// First screen of the app for a person who is not logged in (P04 T7): two clear choices, no forms, no secrets.
// Register -> the 12-word key screen; Login -> the screen where a returning person pastes the 12 words.
export function WelcomeScreen() {
  const navigate = useNavigate();
  const registerHintId = useId();
  const loginHintId = useId();

  return (
    <main className="np-welcome">
      <header className="np-welcome__hero">
        <span className="np-welcome__logo" aria-hidden="true">
          <GraduationCap size={40} />
        </span>
        <p className="np-welcome__eyebrow">{t('welcome.title')}</p>
        <h1>{t('app.name')}</h1>
        <p className="np-welcome__tagline">{t('welcome.tagline')}</p>
      </header>

      <div className="np-welcome__choices">
        <Card className="np-welcome__choice">
          <Button
            size="lg"
            icon={<UserPlus size={20} aria-hidden="true" />}
            aria-describedby={registerHintId}
            onClick={() => navigate(AUTH_ROUTES.register)}
          >
            {t('welcome.register')}
          </Button>
          <p id={registerHintId} className="np-welcome__hint">
            {t('welcome.registerHint')}
          </p>
        </Card>

        <Card className="np-welcome__choice">
          <Button
            size="lg"
            variant="secondary"
            icon={<LogIn size={20} aria-hidden="true" />}
            aria-describedby={loginHintId}
            onClick={() => navigate(AUTH_ROUTES.login)}
          >
            {t('welcome.login')}
          </Button>
          <p id={loginHintId} className="np-welcome__hint">
            {t('welcome.loginHint')}
          </p>
        </Card>
      </div>
    </main>
  );
}
