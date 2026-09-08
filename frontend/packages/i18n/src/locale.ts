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
 * Deterministic resolution of the language to present, in the order CONTRACT.md v0.3 fixes:
 * the person's own preference → what the municipality enabled → the municipality's default →
 * the platform default.
 *
 * `enabled` is the gate, not a suggestion: a preference the municipality does not offer cannot
 * win, or an administrator who removed a language would still be serving it. An empty or unknown
 * `enabled` list means "not known yet" rather than "nothing is allowed" — during that window the
 * platform's own supported set is the only defensible gate, and re-resolving once the catalog
 * answers is what settles it.
 */
export interface LocaleResolutionInput {
  /** The person's explicit choice: the account's `locale`, or this browser's remembered one. */
  preference?: string | null;
  /** BCP 47 tags the municipality enabled, in its own order. */
  enabled?: readonly string[];
  /** The municipality's default tag. */
  tenantDefault?: string | null;
}

export function resolvePreferredLocale(input: LocaleResolutionInput): SupportedLocale {
  const offered = (input.enabled ?? []).filter(isSupportedLocale);
  const gate = offered.length > 0 ? offered : SUPPORTED_LOCALES;
  const allows = (candidate: string | undefined | null): candidate is SupportedLocale =>
    isSupportedLocale(candidate) && (gate as readonly string[]).includes(candidate);

  if (allows(input.preference)) return input.preference;
  if (allows(input.tenantDefault)) return input.tenantDefault;
  return gate[0] ?? DEFAULT_LOCALE;
}

/**
 * Where a viewer's own language choice is remembered between visits.
 *
 * It is a *preference of this browser*, not the source of truth: the account's `locale` on the
 * server is (CONTRACT.md v0.3 — user preference → enabled by the municipality → municipality
 * default → platform default). This exists so the choice survives a reload before anyone has
 * signed in, which is exactly when a person who cannot read the current language needs it.
 * Every access is guarded: private windows and blocked site data make storage throw.
 *
 * The key is scoped per portal. The four portals are four different products with four different
 * audiences — an inspector working in English does not decide what language the citizen app opens
 * in — and in production they may well be served from one host, where a single shared key would
 * make each portal silently overwrite the others' choice.
 */
const LOCALE_STORAGE_PREFIX = 'luparx.locale';
/** The pre-portal key, still read once so an existing choice is not thrown away on upgrade. */
const LEGACY_LOCALE_STORAGE_KEY = 'luparx.locale';

let storageScope = '';

/** Namespaces the remembered choice to one portal (`citizen`, `admin`, …). Set once at boot. */
export function setLocaleStorageScope(scope: string): void {
  storageScope = scope;
}

function storageKey(): string {
  return storageScope ? `${LOCALE_STORAGE_PREFIX}.${storageScope}` : LOCALE_STORAGE_PREFIX;
}

export function readStoredLocale(): SupportedLocale | undefined {
  try {
    const stored = globalThis.localStorage?.getItem(storageKey());
    if (isSupportedLocale(stored)) return stored;
    const legacy = globalThis.localStorage?.getItem(LEGACY_LOCALE_STORAGE_KEY);
    return isSupportedLocale(legacy) ? legacy : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredLocale(locale: SupportedLocale): void {
  try {
    globalThis.localStorage?.setItem(storageKey(), locale);
  } catch {
    // A viewer who blocks site data still gets the language they picked for this session.
  }
}
