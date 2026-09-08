import * as React from 'react';
import { useAuth } from '@luparx/auth';
import { resolvePreferredLocale, useTranslation, writeStoredLocale } from '@luparx/i18n';
import { useAvailableLocales } from './LocaleSwitcher';

/**
 * Keeps the language of the running app in agreement with the contract's resolution
 * (CONTRACT.md v0.3: user preference → enabled by the municipality → municipality default →
 * platform default). Renders nothing; mount it once, inside the auth provider.
 *
 * It is deliberately *not* part of the language dropdown. The dropdown exists on two screens —
 * the login screen and the account screen — and signing in leaves both immediately, so a
 * reconciliation living there ran only if the person happened to be looking at one of those
 * screens when the profile arrived. That is why an account set to Spanish still opened in English
 * after signing in from a browser that had been switched to English: nothing was mounted to notice.
 *
 * The rules it enforces, in order:
 *
 *  - **A signed-in account's language wins over this browser's copy.** The profile is what the
 *    person chose deliberately and carries between devices; the local copy is whatever the last
 *    visitor to this browser picked, possibly on the login screen of a shared phone. Applied once
 *    per account, so it never fights the switcher afterwards.
 *  - **The chosen language has to be one the municipality enabled.** An administrator who
 *    withdraws a language must not keep serving it out of a cached preference.
 *  - **The result is written back to this browser**, per portal, so the next reload — including
 *    the one that lands on the login screen — already speaks it.
 */
export function LocalePreferenceSync(): null {
  const { apiClient, me } = useAuth();
  const { locale, setLocale } = useTranslation();
  const { data } = useAvailableLocales(apiClient, me?.activeTenant?.id ?? null);
  const profile = me?.user;

  const enabled = data?.locales;
  const tenantDefault = data?.defaultLocale;
  const appliedForUser = React.useRef<string | null>(null);

  React.useEffect(() => {
    // Wait for the municipality's list: resolving against the platform list first and the real one
    // a moment later would flip the interface under the reader.
    if (!enabled) return;

    if (!profile) {
      appliedForUser.current = null;
      const resolved = resolvePreferredLocale({ preference: locale, enabled, tenantDefault });
      if (resolved !== locale) setLocale(resolved);
      return;
    }

    if (appliedForUser.current === profile.id) {
      // Already reconciled for this account; the viewer is in charge from here on. Their current
      // choice still has to clear the municipality's gate.
      const resolved = resolvePreferredLocale({ preference: locale, enabled, tenantDefault });
      if (resolved !== locale) setLocale(resolved);
      return;
    }

    appliedForUser.current = profile.id;
    const resolved = resolvePreferredLocale({ preference: profile.locale, enabled, tenantDefault });
    if (resolved !== locale) setLocale(resolved);
    else writeStoredLocale(resolved);
    // `locale` is read, not depended on: this reacts to who is signed in and what is enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, enabled, tenantDefault]);

  return null;
}
