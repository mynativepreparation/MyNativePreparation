import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './Card.css';

// Raised neumorphism card.
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('np-card', className)} {...rest} />;
}
