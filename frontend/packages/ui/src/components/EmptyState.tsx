import * as React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Circular icon + positive title + supporting copy (DESIGN_SYSTEM.md §3 — always name the active tenant in `description`). */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): React.JSX.Element {
  return (
    <div className={['lx-empty-state', className].filter(Boolean).join(' ')}>
      {icon ? (
        <span className="lx-empty-state__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="lx-empty-state__title">{title}</p>
      {description ? <p className="lx-empty-state__description">{description}</p> : null}
      {action}
    </div>
  );
}
