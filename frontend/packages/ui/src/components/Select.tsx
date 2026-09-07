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
  /** Leading icon inside the field (e.g. a pin for a zone picker — DESIGN_SYSTEM.md §3 "Flujo de estacionamiento"). */
  icon?: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, options, placeholder, icon, className, value, ...rest },
  ref,
) {
  const classes = ['lx-select', icon ? 'lx-select--with-icon' : '', invalid ? 'lx-select--invalid' : '', className]
    .filter(Boolean)
    .join(' ');
  const select = (
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
  if (!icon) return select;
  return (
    <span className="lx-select-wrap">
      <span className="lx-select-wrap__icon" aria-hidden="true">
        {icon}
      </span>
      {select}
    </span>
  );
});
