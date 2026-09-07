import * as React from 'react';

export type ButtonVariant = 'primary' | 'solid' | 'secondary' | 'outline' | 'ghost' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` (gradient + glow) is reserved for the single primary CTA of a
   * screen (DESIGN_SYSTEM.md §2 rule 5 — "Estacionar ahora", "Iniciar
   * estacionamiento"). `solid` is the same gradient fill without the glow,
   * for every other filled-blue action ("Recargar", "Agregar").
   */
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, fullWidth = false, disabled, className, children, ...rest },
  ref,
) {
  const classes = ['lx-btn', `lx-btn--${variant}`, fullWidth ? 'lx-btn--full' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} className={classes} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {children}
    </button>
  );
});
