import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './Tile.css';

interface TileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}

// Big tappable tile (home screen, course tiles).
export function Tile({ icon, title, subtitle, className, type = 'button', ...rest }: TileProps) {
  return (
    <button type={type} className={cx('np-tile', className)} {...rest}>
      <span className="np-tile__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="np-tile__title">{title}</span>
      {subtitle && <span className="np-tile__subtitle">{subtitle}</span>}
    </button>
  );
}
