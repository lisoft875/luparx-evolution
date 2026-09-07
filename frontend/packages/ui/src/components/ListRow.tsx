import * as React from 'react';

export interface ListRowProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Right-aligned value — typically an <AmountText> or a status <Badge> (DESIGN_SYSTEM.md §3 "Listas de movimientos"). */
  value?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

/** Icon-in-rounded-box + title/meta + right-aligned value row, the base unit of every list screen. */
export function ListRow({ icon, title, meta, value, onClick, className }: ListRowProps): React.JSX.Element {
  const classes = ['lx-list-row', className].filter(Boolean).join(' ');
  const content = (
    <>
      {icon ? (
        <span className="lx-list-row__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="lx-list-row__body">
        <span className="lx-list-row__title">{title}</span>
        {meta ? <span className="lx-list-row__meta">{meta}</span> : null}
      </span>
      {value !== undefined ? <span className="lx-list-row__value">{value}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
