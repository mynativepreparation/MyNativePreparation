import { t } from '../../core/i18n';
import { wire } from '../../core/wire/wire';

export function HomeScreen() {
  return (
    <section>
      <h1>{t('home.title')}</h1>
      <button type="button" onClick={() => wire.emit('ui.toast', { message: t('toast.hello') })}>
        {t('home.toastButton')}
      </button>
    </section>
  );
}
