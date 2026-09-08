import * as React from 'react';

export interface SectionHeaderProps {
  title: React.ReactNode;
  /** One line explaining what the section is for — settings screens need it, list headers do not. */
  description?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}

/** Section title with an optional trailing "Ver todos"-style link (DESIGN_SYSTEM.md §3), used above a card list. */
export function SectionHeader({ title, description, action, className }: SectionHeaderProps): React.JSX.Element {
  return (
    <div className={['lx-section-header', className].filter(Boolean).join(' ')}>
      <div>
        <p className="lx-section-header__title">{title}</p>
        {description ? <p className="lx-text-meta lx-section-header__description">{description}</p> : null}
      </div>
      {action ? (
        <button type="button" className="lx-link-button" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
