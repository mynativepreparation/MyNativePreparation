import type { HTMLAttributes } from 'react';
import { Info } from 'lucide-react';
import { cx } from './cx';
import './Toast.css';

interface ToastProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> {
  message: string;
}

// Short message bubble. role="status" so screen readers announce it politely.
export function Toast({ message, className, ...rest }: ToastProps) {
  return (
    <div role="status" className={cx('np-toast', className)} {...rest}>
      <Info size={20} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
