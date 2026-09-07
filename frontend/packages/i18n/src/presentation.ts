import type { SupportedLocale } from './locale';
import { minorUnitExponent } from './currency';

/**
 * Platform-default *presentation* policy — how a value is rendered, as
 * opposed to how it is stored or computed. This is deliberately separate
 * from `currency.ts` (`minorUnitExponent`/`minorToMajor`/`majorToMinor`):
 * `amount_minor` on the wire and in the database always uses the ISO 4217
 * minor unit (CONTRACT.md §5 — CRC's colón keeps its 2 formal decimal
 * digits there, `minorToMajor` is unaffected by anything in this file).
 * What differs here is only how many of those digits a screen *shows* a
 * user, and which glyphs it uses for grouping/decimal separators — both are
 * genuine per-market UX conventions (Costa Rican colón amounts are
 * conventionally shown with no decimals; `es-CR` groups thousands with `.`
 * and marks decimals with `,`), never a business rule and never hardcoded
 * at a call site.
 *
 * TODO(extension): both tables below are platform defaults. A tenant that
 * needs a different convention (e.g. a municipality outside Costa Rica, or
 * one that prefers showing colón cents) should be able to override its
 * entries per tenant once tenant-scoped display settings exist
 * (CONTRACT.md §2) — that override point is these two lookup functions:
 * swap their "platform default" table lookup for a tenant-aware one without
 * touching any call site in `formatters.ts` or the apps.
 */

// ---- Currency display: fraction digits shown, keyed by ISO 4217 code -----

interface CurrencyDisplay {
  /** Decimal digits to *show*. Falls back to the currency's ISO minor-unit exponent when unset. */
  fractionDigits: number;
}

/**
 * Platform-default display overrides. Only currencies that deliberately
 * diverge from their ISO minor-unit exponent for on-screen presentation
 * need an entry — CRC is shown as whole colones (no céntimos) even though
 * the ISO minor unit (and `amount_minor`) keeps 2 decimal digits.
 */
const CURRENCY_DISPLAY: Partial<Record<string, CurrencyDisplay>> = {
  CRC: { fractionDigits: 0 },
};

/** Decimal digits to render for `currencyCode` — the display override if one exists, else the ISO exponent. */
export function currencyDisplayFractionDigits(currencyCode: string): number {
  const override = CURRENCY_DISPLAY[currencyCode.toUpperCase()];
  return override ? override.fractionDigits : minorUnitExponent(currencyCode);
}

// ---- Number symbols: grouping/decimal glyphs, keyed by locale -----------

interface NumberSymbols {
  group: string;
  decimal: string;
}

/**
 * Platform-default grouping/decimal glyphs per supported locale, explicit
 * for every locale (not left to whatever ICU's default CLDR data happens to
 * pick) so the platform's number presentation is a reviewable configuration
 * rather than an implicit runtime detail. `es-CR` conventionally uses `.`
 * for thousands and `,` for decimals; `en-US` is the reverse (and matches
 * ICU's own default here, spelled out explicitly rather than relied upon).
 */
const LOCALE_NUMBER_SYMBOLS: Record<SupportedLocale, NumberSymbols> = {
  'es-CR': { group: '.', decimal: ',' },
  'en-US': { group: ',', decimal: '.' },
};

/**
 * Re-renders the `group`/`decimal` parts of an already-`Intl`-formatted
 * number with the platform's configured glyphs, joining every other part
 * (currency symbol, digits, sign, literal spacing…) exactly as ICU placed
 * it. Never reorders parts and never touches any part other than
 * `group`/`decimal` — the currency symbol's position, the sign, and digit
 * grouping boundaries are still entirely ICU's decision for `locale`.
 */
export function applyNumberSymbolOverrides(parts: Intl.NumberFormatPart[], locale: SupportedLocale): string {
  const symbols = LOCALE_NUMBER_SYMBOLS[locale];
  return parts
    .map((part) => {
      if (part.type === 'group') return symbols.group;
      if (part.type === 'decimal') return symbols.decimal;
      return part.value;
    })
    .join('');
}

// ---- Hour cycle: 12h vs 24h clock, keyed by locale -----------------------

/**
 * Platform-default hour cycle per supported locale, explicit for every
 * locale for the same reason as `LOCALE_NUMBER_SYMBOLS` above. Costa Rica
 * conventionally reads the clock in 24-hour form; the US convention is
 * 12-hour with an am/pm marker.
 */
const LOCALE_HOUR_CYCLE: Record<SupportedLocale, 'h11' | 'h12' | 'h23' | 'h24'> = {
  'es-CR': 'h23',
  'en-US': 'h12',
};

export function localeHourCycle(locale: SupportedLocale): 'h11' | 'h12' | 'h23' | 'h24' {
  return LOCALE_HOUR_CYCLE[locale];
}
