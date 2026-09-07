import * as React from 'react';

export type AlertTone = 'info' | 'success' | 'danger';

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
