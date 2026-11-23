import { Check } from 'lucide-react';
import { t, type TextKey } from '../../core/i18n';
import { useTheme } from '../../core/theme/useTheme';
import type { ThemeMode } from '../../core/theme/theme';
import { Button, Card } from '../../core/ui';
import { AboutCard } from './AboutCard';
import { FingerprintCard } from './FingerprintCard';
import { PassphraseCard } from './PassphraseCard';
import { PinCard } from './PinCard';
import { ProfileCard } from './ProfileCard';
import { UpdateCard } from './UpdateCard';
import './SettingsScreen.css';

const MODES: { mode: ThemeMode; label: TextKey }[] = [
  { mode: 'light', label: 'theme.light' },
  { mode: 'dark', label: 'theme.dark' },
  { mode: 'colour', label: 'theme.colour' },
];

export function SettingsScreen() {
  const { mode, setMode } = useTheme();

  return (
    <section>
      <h1>{t('settings.title')}</h1>
      <div className="np-settings__stack" data-np-check>
        <ProfileCard />
        <Card>
          <h2 id="np-theme-label">{t('settings.theme')}</h2>
          <div
            className="np-settings__modes"
            role="group"
            aria-labelledby="np-theme-label"
            data-np-check
          >
            {MODES.map((m) => {
              const selected = m.mode === mode;
              return (
                <Button
                  key={m.mode}
                  variant={selected ? 'primary' : 'secondary'}
                  aria-pressed={selected}
                  icon={selected ? <Check size={18} aria-hidden="true" /> : undefined}
                  onClick={() => setMode(m.mode)}
                >
                  {t(m.label)}
                </Button>
              );
            })}
          </div>
        </Card>
        <FingerprintCard />
        <PinCard />
        <PassphraseCard />
        <UpdateCard />
        <AboutCard />
      </div>
    </section>
  );
}
