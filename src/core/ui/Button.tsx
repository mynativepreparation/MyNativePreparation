import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './Button.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'lg';
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={cx('np-button', `np-button--${variant}`, `np-button--${size}`, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}
