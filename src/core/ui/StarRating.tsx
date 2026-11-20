import { Star } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cx } from './cx';
import './StarRating.css';

interface StarRatingProps {
  value: number; // 0..5, read only
  label?: string; // spoken text; default "<value> of 5 stars"
  className?: string;
  /** Earned stars pop in one after the other (CSS only; switched off by the device's "reduce motion" setting). */
  animate?: boolean;
  /** 'accent' (default) uses the accent colour; 'star' fills earned stars with the golden star colour. */
  tone?: 'accent' | 'star';
}

const STARS = [1, 2, 3, 4, 5];

// Read-only stars. Filled star = earned, outline star = not earned (shape, not only color).
export function StarRating({ value, label, className, animate = false, tone = 'accent' }: StarRatingProps) {
  const rounded = Math.min(5, Math.max(0, Math.round(value)));

  return (
    <span
      className={cx(
        'np-stars',
        tone === 'star' ? 'np-stars--star' : undefined,
        animate ? 'np-stars--animate' : undefined,
        className,
      )}
      role="img"
      aria-label={label ?? `${rounded} of 5 stars`}
    >
      {STARS.map((n) => {
        const earned = n <= rounded;
        // The CSS multiplies this position by a motion token to get each star's delay.
        const style = animate && earned ? ({ '--np-star-index': n - 1 } as CSSProperties) : undefined;
        return (
          <Star
            key={n}
            size={24}
            aria-hidden="true"
            className={earned ? 'np-stars__star np-stars__star--on' : 'np-stars__star'}
            fill={earned ? 'currentColor' : 'none'}
            style={style}
          />
        );
      })}
    </span>
  );
}
