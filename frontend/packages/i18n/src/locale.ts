/**
 * Supported BCP 47 locale tags. Adding a market means adding both a tag here
 * and a dictionary in ./locales — never a hardcoded string check elsewhere.
 */
export const SUPPORTED_LOCALES = ['es-CR', 'en-US'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Platform default locale. Configuration, not a business rule embedded in logic. */
export const DEFAULT_LOCALE: SupportedLocale = 'es-CR';

export function isSupportedLocale(value: string | undefined | null): value is SupportedLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Deterministic locale resolution: exact tag match, then primary-language
 * match (e.g. "es-PA" -> "es-CR"), then the platform default. Never throws,
 * never picks randomly.
 */
export function resolveLocale(candidates: readonly (string | undefined | null)[]): SupportedLocale {
  for (const candidate of candidates) {
    if (isSupportedLocale(candidate)) return candidate;
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    const primary = candidate.split('-')[0]?.toLowerCase();
    const match = SUPPORTED_LOCALES.find((locale) => locale.split('-')[0]?.toLowerCase() === primary);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** Detects the viewer's preferred supported locale from the browser, with a deterministic fallback. */
export function detectBrowserLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const candidates = navigator.languages && navigator.languages.length > 0
    ? [...navigator.languages]
    : [navigator.language];
  return resolveLocale(candidates);
}
