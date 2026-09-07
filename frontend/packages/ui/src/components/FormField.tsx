import * as React from 'react';
import { useId } from 'react';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  /** Pass the already-translated "optional" label (e.g. t('common.optional')) to annotate a non-required field; omit for required fields. */
  optionalLabel?: string;
  children: React.ReactNode | ((ids: { inputId: string; describedBy: string | undefined }) => React.ReactNode);
}

/**
 * Wraps a single form control with a `<label>`, optional hint, and an error
 * message wired via `aria-describedby`/`aria-invalid` on the control itself.
 * Pass `children` as a render function when the control needs the generated
 * ids (id/aria-describedby) applied directly to its `<input>`.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  optionalLabel,
  children,
}: FormFieldProps): React.JSX.Element {
  const generatedId = useId();
  const inputId = htmlFor ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="lx-field">
      <label htmlFor={inputId} className="lx-field__label">
        {label}
        {optionalLabel ? <span className="lx-field__optional"> ({optionalLabel})</span> : null}
      </label>
      {typeof children === 'function' ? children({ inputId, describedBy }) : children}
      {hint ? (
        <p id={hintId} className="lx-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="lx-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
