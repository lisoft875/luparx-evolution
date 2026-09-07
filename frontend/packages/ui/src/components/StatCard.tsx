import * as React from 'react';
import { Card } from './Card';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/** A single-metric card (balance, count, total) with a tabular-nums value (DESIGN_SYSTEM.md §2 "Monto grande"). */
export function StatCard({ label, value, hint, icon, className }: StatCardProps): React.JSX.Element {
  return (
    <Card className={className}>
      <div className="lx-stat-card">
        {icon ? (
          <span className="lx-list-row__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="lx-stat-card__label">{label}</span>
        <span className="lx-stat-card__value">{value}</span>
        {hint ? <span className="lx-stat-card__hint">{hint}</span> : null}
      </div>
    </Card>
  );
}
