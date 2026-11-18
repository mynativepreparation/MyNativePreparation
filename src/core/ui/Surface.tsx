import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './Surface.css';

// Inset (pressed-in) area, e.g. behind a group of controls.
export function Surface({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('np-surface', className)} {...rest} />;
}
