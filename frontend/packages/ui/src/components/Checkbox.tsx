import * as React from 'react';
import { useId } from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  /** One line under the label explaining the consequence of ticking it — wired to `aria-describedby`. */
  hint?: React.ReactNode;
}

/** A single labeled checkbox (e.g. "Soy el propietario" on the vehicle form) — the label and the control share one generated id unless `id` is passed explicitly. */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  return (
    <label htmlFor={inputId} className={['lx-checkbox', className].filter(Boolean).join(' ')}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="lx-checkbox__input"
        aria-describedby={hint ? hintId : undefined}
        {...rest}
      />
      <span className="lx-checkbox__label">
        {label}
        {hint ? (
          <span id={hintId} className="lx-text-meta lx-checkbox__hint">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
});
