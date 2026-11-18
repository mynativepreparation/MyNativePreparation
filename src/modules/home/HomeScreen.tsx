import { Zap } from 'lucide-react';
import { t } from '../../core/i18n';
import { Button, Card } from '../../core/ui';
import { wire } from '../../core/wire/wire';

export function HomeScreen() {
  return (
    <section>
      <h1>{t('home.title')}</h1>
      <Card>
        <Button
          icon={<Zap size={20} aria-hidden="true" />}
          onClick={() => wire.emit('ui.toast', { message: t('toast.hello') })}
        >
          {t('home.toastButton')}
        </Button>
      </Card>
    </section>
  );
}
