import * as React from 'react';

/**
 * `warning` is not a weaker `danger`: it marks a state the reader still controls — a rule they have
 * not satisfied yet, evidence the client had to shrink — where `danger` marks something that
 * already failed. Announced politely (role="status") for the same reason.
 */
export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  tone?: AlertTone;
  children: React.ReactNode;
}

/** Uses role="status" for info/success (polite) and role="alert" for danger (assertive), so screen readers announce it appropriately. */
export function Alert({ tone = 'info', children }: AlertProps): React.JSX.Element {
  const classes = `lx-alert lx-alert--${tone}`;
  return (
    <div className={classes} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
