import type { ButtonHTMLAttributes } from 'react';
import { Check } from 'lucide-react';
import { cx } from './cx';
import './Toggle.css';

interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role' | 'children'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string; // visible text next to the switch
}

// On/off switch. Real <button role="switch"> so keyboard and screen readers work.
// State is shown by knob position AND a check icon, never by color alone.
export function Toggle({ checked, onChange, label, className, type = 'button', ...rest }: ToggleProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      className={cx('np-toggle', checked && 'np-toggle--on', className)}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className="np-toggle__track" aria-hidden="true">
        <span className="np-toggle__knob">{checked && <Check size={14} strokeWidth={3} />}</span>
      </span>
      <span className="np-toggle__label">{label}</span>
    </button>
  );
}
