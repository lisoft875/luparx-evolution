import type { SupportedLocale } from './locale';
import { minorToMajor } from './currency';

/** Locale-aware date formatting. Pass `timeZone` explicitly for tenant/user-zone conversion; UTC is the storage format. */
export function formatDate(
  value: Date | string,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions & { timeZone?: string },
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', ...options }).format(date);
}

export function formatDateTime(
  value: Date | string,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions & { timeZone?: string },
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', ...options }).format(date);
}

export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Formats an integer minor-unit amount (never a float) as a localized currency string. */
export function formatCurrencyMinor(
  amountMinor: number,
  currencyCode: string,
  locale: SupportedLocale,
): string {
  const major = minorToMajor(amountMinor, currencyCode);
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(major);
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
