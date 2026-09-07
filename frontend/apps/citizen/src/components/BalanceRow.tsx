import * as React from 'react';
import { formatCurrencyMinor, type SupportedLocale } from '@luparx/i18n';
import { Button, Card, type ButtonVariant } from '@luparx/ui';

export interface BalanceRowProps {
  label: string;
  balanceMinor: number;
  currencyCode: string;
  locale: SupportedLocale;
  actionLabel: React.ReactNode;
  onAction: () => void;
  actionVariant?: ButtonVariant;
}

/**
 * Full-width "Saldo disponible / ₡48.800 [Recargar]" row shared by the
 * Home (active-session variant) and Wallet screens (DESIGN_SYSTEM.md §3).
 * Wraps to a second line only as a last resort — never overlaps the amount.
 */
export function BalanceRow({
  label,
  balanceMinor,
  currencyCode,
  locale,
  actionLabel,
  onAction,
  actionVariant = 'solid',
}: BalanceRowProps): React.JSX.Element {
  return (
    <Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--lx-space-3)' }}>
        <div style={{ minWidth: 0 }}>
          <p className="lx-stat-card__label" style={{ margin: 0 }}>
            {label}
          </p>
          <p className="lx-stat-card__value" style={{ margin: 0 }}>
            {formatCurrencyMinor(balanceMinor, currencyCode, locale)}
          </p>
        </div>
        <Button type="button" variant={actionVariant} onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </Card>
  );
}
