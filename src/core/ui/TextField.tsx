import { useId, type InputHTMLAttributes } from 'react';
import { cx } from './cx';
import './TextField.css';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string; // shown as text with an icon-like prefix; never only a red border
}

// Labelled text input (inset look). Label, hint and error are linked for screen readers.
export function TextField({ label, hint, error, className, id, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('np-field', error && 'np-field--error', className)}>
      <label className="np-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="np-field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="np-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="np-field__error">
          <span aria-hidden="true">! </span>
          {error}
        </p>
      )}
    </div>
  );
}
