import type { SupportedLocale } from './locale';
import { minorToMajor } from './currency';
import { applyNumberSymbolOverrides, currencyDisplayFractionDigits, localeHourCycle } from './presentation';

/** Locale-aware date formatting. Pass `timeZone` explicitly for tenant/user-zone conversion; UTC is the storage format. */
export function formatDate(
  value: Date | string,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions & { timeZone?: string },
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', ...options }).format(date);
}

/**
 * `hourCycle` defaults to the platform's per-locale clock convention
 * (`presentation.ts` — `es-CR` reads 24h, `en-US` 12h) — pass `hourCycle`
 * in `options` to override it for a specific call.
 */
export function formatDateTime(
  value: Date | string,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions & { timeZone?: string },
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: localeHourCycle(locale),
    ...options,
  }).format(date);
}

/**
 * Time-only formatting (e.g. an active session's expiry clock) — always
 * Intl, never a hand-built "HH:MM". `hourCycle` defaults the same way as
 * {@link formatDateTime}.
 */
export function formatTime(
  value: Date | string,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions & { timeZone?: string },
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short', hourCycle: localeHourCycle(locale), ...options }).format(date);
}

/**
 * Locale-aware number formatting. Grouping/decimal glyphs follow the
 * platform's per-locale presentation config (`presentation.ts`) rather than
 * whatever ICU's default CLDR data happens to pick — every other part of
 * the formatted string (digits, sign, any `options` requested) is still
 * entirely Intl's output, just re-assembled with `formatToParts` so only
 * those two glyphs are ever substituted.
 */
export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  const parts = new Intl.NumberFormat(locale, options).formatToParts(value);
  return applyNumberSymbolOverrides(parts, locale);
}

/**
 * Formats an integer minor-unit amount (never a float) as a localized
 * currency string. Decimal digits *shown* follow the currency's display
 * policy (`presentation.ts` `currencyDisplayFractionDigits` — e.g. CRC is
 * shown with none) which is independent from `minorToMajor`'s ISO minor-unit
 * math used to derive the major-unit value in the first place. Grouping/
 * decimal glyphs follow the same locale-specific override as
 * {@link formatNumber}; the currency symbol's position and the sign are
 * still entirely ICU's decision for `locale`.
 */
export function formatCurrencyMinor(
  amountMinor: number,
  currencyCode: string,
  locale: SupportedLocale,
): string {
  const major = minorToMajor(amountMinor, currencyCode);
  const fractionDigits = currencyDisplayFractionDigits(currencyCode);
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).formatToParts(major);
  return applyNumberSymbolOverrides(parts, locale);
}

const pluralRulesCache = new Map<SupportedLocale, Intl.PluralRules>();

function pluralRulesFor(locale: SupportedLocale): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

/**
 * Resolves the CLDR plural category for `count` in `locale` (zero/one/two/few/many/other).
 * Consumers look up `${baseKey}.${category}` in the dictionary, falling back to
 * `${baseKey}.other` when the specific category has no translation — deterministic,
 * never a runtime guess.
 */
export function pluralCategory(count: number, locale: SupportedLocale): Intl.LDMLPluralRule {
  return pluralRulesFor(locale).select(count);
}
