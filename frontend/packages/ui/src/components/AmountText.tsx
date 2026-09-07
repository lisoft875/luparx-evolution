import * as React from 'react';
import { formatCurrencyMinor, type SupportedLocale } from '@luparx/i18n';

export type AmountSign = 'charge' | 'income' | 'neutral';

export interface AmountTextProps {
  /** Integer minor-unit amount — never a float (CONTRACT.md §5). Sign, when omitted, is inferred from this value. */
  amountMinor: number;
  currencyCode: string;
  locale: SupportedLocale;
  sign?: AmountSign;
  /** Prepends +/− so the charge/income state is never communicated by color alone (DESIGN_SYSTEM.md §2/§4.4). */
  showSignPrefix?: boolean;
  className?: string;
}

/** Locale+currency-aware amount with the design system's semantic coloring (charges in danger, income in success). Always `Intl.NumberFormat` under the hood — never manual currency formatting. */
export function AmountText({
  amountMinor,
  currencyCode,
  locale,
  sign,
  showSignPrefix = true,
  className,
}: AmountTextProps): React.JSX.Element {
  const resolvedSign: AmountSign = sign ?? (amountMinor < 0 ? 'charge' : amountMinor > 0 ? 'income' : 'neutral');
  const formatted = formatCurrencyMinor(Math.abs(amountMinor), currencyCode, locale);
  const prefix = showSignPrefix ? (resolvedSign === 'charge' ? '−' : resolvedSign === 'income' ? '+' : '') : '';
  const classes = ['lx-amount', `lx-amount--${resolvedSign}`, className].filter(Boolean).join(' ');
  return (
    <span className={classes}>
      {prefix}
      {formatted}
    </span>
  );
}
