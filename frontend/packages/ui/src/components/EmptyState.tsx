import * as React from 'react';

export type EmptyStateTone = 'primary' | 'success';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  /** Icon box color — `success` for a positive "all clear" state (DESIGN_SYSTEM.md §3 "Estados vacíos"). */
  tone?: EmptyStateTone;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Circular icon + positive title + supporting copy (DESIGN_SYSTEM.md §3 — always name the active tenant in `description`). */
export function EmptyState({ icon, tone = 'primary', title, description, action, className }: EmptyStateProps): React.JSX.Element {
  const iconClasses = ['lx-empty-state__icon', tone !== 'primary' ? `lx-empty-state__icon--${tone}` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={['lx-empty-state', className].filter(Boolean).join(' ')}>
      {icon ? (
        <span className={iconClasses} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="lx-empty-state__title">{title}</p>
      {description ? <p className="lx-empty-state__description">{description}</p> : null}
      {action}
    </div>
  );
}
