import { Star } from 'lucide-react';
import { cx } from './cx';
import './StarRating.css';

interface StarRatingProps {
  value: number; // 0..5, read only
  label?: string; // spoken text; default "<value> of 5 stars"
  className?: string;
}

const STARS = [1, 2, 3, 4, 5];

// Read-only stars. Filled star = earned, outline star = not earned (shape, not only color).
export function StarRating({ value, label, className }: StarRatingProps) {
  const rounded = Math.min(5, Math.max(0, Math.round(value)));

  return (
    <span className={cx('np-stars', className)} role="img" aria-label={label ?? `${rounded} of 5 stars`}>
      {STARS.map((n) => (
        <Star
          key={n}
          size={24}
          aria-hidden="true"
          className={n <= rounded ? 'np-stars__star np-stars__star--on' : 'np-stars__star'}
          fill={n <= rounded ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}
