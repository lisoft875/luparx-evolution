import * as React from 'react';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/** Status pill (DESIGN_SYSTEM.md §3 "Verificado" badges). Tone is always paired with text, never color-only. */
export function Badge({ tone = 'neutral', children, icon, className }: BadgeProps): React.JSX.Element {
  return (
    <span className={['lx-badge', `lx-badge--${tone}`, className].filter(Boolean).join(' ')}>
      {icon}
      {children}
    </span>
  );
}
