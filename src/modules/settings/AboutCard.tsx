import { Info } from 'lucide-react';
import { t, tf } from '../../core/i18n';
import { Card } from '../../core/ui';
import './AboutCard.css';

// About card (SPEC C7, P09 T4): app name, version, licence, data policy and the open-source parts. Read-only.
// The data policy uses the SAME texts as the privacy screen (privacy.* keys), never a second wording.
// The version comes from package.json through `define` in vite.config.ts; "unknown" only if that constant is missing.
// It is not placed in the Settings screen here (that is P09 T5).
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';

export function AboutCard() {
  return (
    <Card className="np-about">
      <h2 id="np-about-title" className="np-about__title">
        <Info size={22} aria-hidden="true" />
        {t('about.title')}
      </h2>
      <p className="np-about__name">{t('app.name')}</p>
      <p className="np-about__text">{tf('about.version', { version: APP_VERSION })}</p>
      <p className="np-about__text">{t('about.licence')}</p>

      <h3 className="np-about__heading">{t('about.dataTitle')}</h3>
      <p className="np-about__text">{t('privacy.noServer')}</p>
      <p className="np-about__text">{t('privacy.noRecovery')}</p>
      <p className="np-about__text">{t('privacy.notHidden')}</p>
      <p className="np-about__text">{t('privacy.github')}</p>

      <h3 className="np-about__heading">{t('about.librariesTitle')}</h3>
      <p className="np-about__text">{t('about.libraries')}</p>
    </Card>
  );
}
