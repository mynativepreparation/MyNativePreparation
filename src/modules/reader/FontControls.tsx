import { t } from '../../core/i18n';
import { IconButton } from '../../core/ui';
import { MAX_SCALE, MIN_SCALE } from './readerMath';
import './FontControls.css';

interface FontControlsProps {
  scale: number;
  onDecrease: () => void;
  onIncrease: () => void;
}

/** `A-` / `A+` buttons and the current size, for people who cannot (or do not want to) pinch. */
export function FontControls({ scale, onDecrease, onIncrease }: FontControlsProps) {
  const atMin = scale <= MIN_SCALE + 1e-9;
  const atMax = scale >= MAX_SCALE - 1e-9;
  return (
    <div className="np-font-controls" role="group" aria-label={t('reader.font.group')}>
      <IconButton
        label={t('reader.font.smaller')}
        icon={<span className="np-font-glyph np-font-glyph-small" aria-hidden="true">A-</span>}
        onClick={onDecrease}
        disabled={atMin}
      />
      <span className="np-font-value" aria-live="polite">
        {Math.round(scale * 100)}%
      </span>
      <IconButton
        label={t('reader.font.larger')}
        icon={<span className="np-font-glyph np-font-glyph-large" aria-hidden="true">A+</span>}
        onClick={onIncrease}
        disabled={atMax}
      />
    </div>
  );
}
