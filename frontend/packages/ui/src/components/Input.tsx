import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  const classes = ['lx-input', invalid ? 'lx-input--invalid' : '', className].filter(Boolean).join(' ');
  return <input ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest} />;
});
