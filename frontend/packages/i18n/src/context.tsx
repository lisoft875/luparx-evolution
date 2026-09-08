import * as React from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { TranslationKey } from './locales/es-CR';
import { esCR } from './locales/es-CR';
import { enUS } from './locales/en-US';
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
  detectBrowserLocale,
  readStoredLocale,
  setLocaleStorageScope,
  writeStoredLocale,
} from './locale';
import { pluralCategory } from './formatters';

const dictionaries: Record<SupportedLocale, Record<TranslationKey, string>> = {
  'es-CR': esCR,
  'en-US': enUS,
};

export type TranslationParams = Record<string, string | number>;

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, token: string) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
}

export interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  /** Translates a stable key, filling `{{token}}` placeholders from `params`. */
  t: (key: TranslationKey, params?: TranslationParams) => string;
  /**
   * Resolves a plural key family: looks up `${baseKey}.${category}` for the
   * CLDR category of `count` in the active locale, falling back to
   * `${baseKey}.other` if that specific category isn't defined.
   */
  tPlural: (baseKey: string, count: number, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export interface I18nProviderProps {
  children: React.ReactNode;
  /** Initial locale override, e.g. from a saved user preference. Defaults to browser detection. */
  initialLocale?: SupportedLocale;
  /**
   * Portal this app is (`citizen`, `admin`, …). Namespaces the remembered choice so the four
   * portals cannot overwrite each other's language when they share a host.
   */
  storageScope?: string;
}

export function I18nProvider({ children, initialLocale, storageScope }: I18nProviderProps): React.JSX.Element {
  // Set before the first read below: the scope decides which key that read looks at, so doing it
  // in an effect would read the wrong key once and then flip the language under the viewer.
  if (storageScope) setLocaleStorageScope(storageScope);

  // Deterministic order, and the same one on every reload: an explicit override from the host app,
  // then this browser's remembered choice, then what the browser itself asks for.
  const [locale, setLocaleState] = useState<SupportedLocale>(
    () => initialLocale ?? readStoredLocale() ?? detectBrowserLocale(),
  );

  const setLocale = useCallback((next: SupportedLocale): void => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams): string => {
      const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
      const template = dictionary[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
      return interpolate(template, params);
    },
    [locale],
  );

  const tPlural = useCallback(
    (baseKey: string, count: number, params?: TranslationParams): string => {
      const category = pluralCategory(count, locale);
      const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
      const record = dictionary as unknown as Record<string, string>;
      const specific = record[`${baseKey}.${category}`];
      const other = record[`${baseKey}.other`];
      const template = specific ?? other ?? baseKey;
      return interpolate(template, { count, ...params });
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, tPlural }),
    [locale, setLocale, t, tPlural],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}

/** Ergonomic alias mirroring common i18n library naming; identical to useI18n(). */
export function useTranslation(): I18nContextValue {
  return useI18n();
}
