import { t } from '../core/i18n';
import { useUpdateState } from '../core/update/useUpdateState';

// Asks the user before switching to a new app version (registerType: 'prompt'). The service worker itself is registered once by
// core/update/UpdateRegistrar (mounted in main.tsx); this component only reads what that registration reported.
export function UpdatePrompt() {
  const { needRefresh, apply } = useUpdateState();

  if (!needRefresh || !apply) return null;

  return (
    <div role="alert">
      <span>{t('update.available')}</span>{' '}
      <button type="button" onClick={() => void apply()}>
        {t('update.button')}
      </button>
    </div>
  );
}
