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

/**
 * The language's own name for itself ("Español (Costa Rica)", "English (United States)"), which is
 * what a language menu has to show: someone who cannot read the current interface language still
 * has to find their own in the list. `Intl.DisplayNames` is asked in the locale being described,
 * not in the active one, and falls back to the raw BCP 47 tag where the runtime has no data.
 */
export function localeEndonym(locale: string): string {
  try {
    const [language, region] = locale.split('-');
    const languageNames = new Intl.DisplayNames([locale], { type: 'language' });
    const languageName = languageNames.of(language ?? locale) ?? locale;
    const capitalized = languageName.charAt(0).toLocaleUpperCase(locale) + languageName.slice(1);
    if (!region) return capitalized;
    const regionNames = new Intl.DisplayNames([locale], { type: 'region' });
    const regionName = regionNames.of(region);
    return regionName ? `${capitalized} (${regionName})` : capitalized;
  } catch {
    return locale;
  }
}

/**
 * Where a viewer's own language choice is remembered between visits.
 *
 * It is a *preference of this browser*, not the source of truth: the account's `locale` on the
 * server is (CONTRACT.md v0.3 — user preference → enabled by the municipality → municipality
 * default → platform default). This exists so the choice survives a reload before anyone has
 * signed in, which is exactly when a person who cannot read the current language needs it.
 * Every access is guarded: private windows and blocked site data make storage throw.
 */
const LOCALE_STORAGE_KEY = 'luparx.locale';

export function readStoredLocale(): SupportedLocale | undefined {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return isSupportedLocale(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredLocale(locale: SupportedLocale): void {
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // A viewer who blocks site data still gets the language they picked for this session.
  }
}
