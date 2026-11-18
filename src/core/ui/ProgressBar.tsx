import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './ProgressBar.css';

interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value: number; // 0..max
  max?: number;
  label: string; // spoken name, e.g. "Course progress"
  showPercent?: boolean; // visible number, so progress is never shown by length alone
}

export function ProgressBar({ value, max = 100, label, showPercent = true, className, ...rest }: ProgressBarProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = Math.round((clamped / safeMax) * 100);

  return (
    <div className={cx('np-progress', className)} {...rest}>
      <div
        className="np-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
      >
        <div className="np-progress__fill" style={{ width: `${percent}%` }} />
      </div>
      {showPercent && <span className="np-progress__text">{percent}%</span>}
    </div>
  );
}
