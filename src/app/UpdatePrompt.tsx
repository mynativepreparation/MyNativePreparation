import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '../core/i18n';

// Asks the user before switching to a new app version (registerType: 'prompt').
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div role="alert">
      <span>{t('update.available')}</span>{' '}
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        {t('update.button')}
      </button>
    </div>
  );
}
