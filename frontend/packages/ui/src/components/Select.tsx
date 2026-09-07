import * as React from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  invalid?: boolean;
  options: SelectOption[];
  /** Rendered as a disabled, non-selectable first option when the field has no default value. */
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, options, placeholder, className, value, ...rest },
  ref,
) {
  const classes = ['lx-select', invalid ? 'lx-select--invalid' : '', className].filter(Boolean).join(' ');
  return (
    <select ref={ref} className={classes} aria-invalid={invalid || undefined} value={value} {...rest}>
      {placeholder ? (
        <option value="" disabled hidden={value !== '' && value !== undefined}>
          {placeholder}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
});
