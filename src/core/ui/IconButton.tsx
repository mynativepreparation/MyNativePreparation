import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './IconButton.css';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode;
  label: string; // spoken name of the button (required: an icon alone has no text)
}

export function IconButton({ icon, label, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} className={cx('np-icon-button', className)} {...rest}>
      {icon}
    </button>
  );
}
