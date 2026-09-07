import * as React from 'react';

export type CardTone = 'default' | 'success' | 'warning';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  /** Nested/inner card surface (`--lx-surface-2`) for a row inside another card. */
  nested?: boolean;
}

/** The base elevated surface for every grouped block of content (DESIGN_SYSTEM.md §2/§3). */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { tone = 'default', nested = false, className, children, ...rest },
  ref,
) {
  const classes = [
    'lx-card',
    nested ? 'lx-card--nested' : '',
    tone !== 'default' ? `lx-card--tone-${tone}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div ref={ref} className={classes} {...rest}>
      {children}
    </div>
  );
});

export interface CardStackProps {
  children: React.ReactNode;
  className?: string;
}

/** Vertical stack of cards with the design system's fixed 12px inter-card gap. */
export function CardStack({ children, className }: CardStackProps): React.JSX.Element {
  return <div className={['lx-card-stack', className].filter(Boolean).join(' ')}>{children}</div>;
}
