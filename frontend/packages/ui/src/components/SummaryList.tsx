import * as React from 'react';

export interface SummaryRowProps {
  label: string;
  value: React.ReactNode;
}

export interface SummaryListProps {
  children: React.ReactNode;
}

/**
 * Label on the left, value on the right — the two lines the reference dialogs close with ("nueva
 * hora de vencimiento", "precio de la extensión").
 *
 * A `<dl>` rather than two `<span>`s in a flex row: these really are terms and their definitions,
 * and a screen reader that knows it reads "precio de la extensión, ₡150,00" instead of two
 * unrelated fragments. The value is a node, so an amount can carry its own emphasis.
 */
export function SummaryList({ children }: SummaryListProps): React.JSX.Element {
  return <dl className="lx-summary">{children}</dl>;
}

export function SummaryRow({ label, value }: SummaryRowProps): React.JSX.Element {
  return (
    <div className="lx-summary__row">
      <dt className="lx-summary__label">{label}</dt>
      <dd className="lx-summary__value">{value}</dd>
    </div>
  );
}
