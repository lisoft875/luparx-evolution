import * as React from 'react';

export interface AppBarAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badgeCount?: number;
}

export interface AppBarProps {
  /** Left-side content when there's no back navigation — typically <Brand>. */
  start?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: AppBarAction[];
  className?: string;
}

/** Top bar: brand (home) or back+title (detail), plus icon actions with badge counts (DESIGN_SYSTEM.md §3). */
export function AppBar({ start, onBack, backLabel, title, subtitle, actions = [], className }: AppBarProps): React.JSX.Element {
  return (
    <header className={['lx-app-bar', className].filter(Boolean).join(' ')}>
      <div className="lx-app-bar__start">
        {onBack ? (
          <button type="button" className="lx-app-bar__back" onClick={onBack} aria-label={backLabel ?? 'Back'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          start ?? null
        )}
        {title ? (
          <span className="lx-app-bar__title-group">
            <span className="lx-app-bar__title">{title}</span>
            {subtitle ? <span className="lx-app-bar__subtitle">{subtitle}</span> : null}
          </span>
        ) : null}
      </div>
      <div className="lx-app-bar__end">
        {actions.map((action, index) => (
          <button
            key={index}
            type="button"
            className="lx-app-bar__icon-btn"
            onClick={action.onClick}
            aria-label={action.label}
          >
            {action.icon}
            {action.badgeCount ? (
              <span className="lx-app-bar__badge">{action.badgeCount > 99 ? '99+' : action.badgeCount}</span>
            ) : null}
          </button>
        ))}
      </div>
    </header>
  );
}
