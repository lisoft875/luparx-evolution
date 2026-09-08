import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiClient } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { SUPPORTED_LOCALES, isSupportedLocale, useTranslation, type SupportedLocale } from '@luparx/i18n';
import { LocaleSelect } from '@luparx/ui';
import { toPersonalDataValues, toUpdateProfileRequest } from '../profile/personalData';

const LOCALE_STALE_TIME_MS = 10 * 60 * 1000;

/**
 * Locales offered to the viewer right now (CONTRACT.md v0.3 §"Idiomas por municipalidad").
 *
 * With a municipality in hand the list is that municipality's, read from the public catalog —
 * public precisely so the login screen can ask before anyone has authenticated. With no
 * municipality yet (a fresh login screen, before a tenant is chosen) the platform's own list is
 * the only defensible answer. If the catalog call fails the switcher still works on the platform
 * list instead of disappearing: a language menu is how someone recovers from landing on a screen
 * they cannot read.
 */
export function useAvailableLocales(apiClient: ApiClient, tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ['catalog', 'tenant-locales', tenantId ?? 'platform'],
    staleTime: LOCALE_STALE_TIME_MS,
    queryFn: async (): Promise<string[]> => {
      if (!tenantId) return [...SUPPORTED_LOCALES];
      try {
        const locales = await apiClient.catalog.tenantLocales(tenantId);
        const ordered = [...locales].sort((a, b) => a.sortOrder - b.sortOrder).map((entry) => entry.locale);
        return ordered.length > 0 ? ordered : [...SUPPORTED_LOCALES];
      } catch {
        return [...SUPPORTED_LOCALES];
      }
    },
  });
}

export interface LocaleSwitcherProps {
  /**
   * Municipality whose language list to offer. Omit to let the switcher use the signed-in
   * session's active municipality, and fall back to the platform list when there is none.
   */
  tenantId?: string | null;
  variant?: 'compact' | 'field';
  id?: string;
  className?: string;
}

/**
 * The language dropdown, wired to whichever municipality is in play.
 *
 * Picking a language switches the interface immediately and remembers the choice in two places,
 * because they answer two different questions. The browser remembers it so a reload — including
 * the reload that lands on the login screen — keeps the language the person chose. The account
 * remembers it so it follows them to another device, and so the server can use it for the things
 * the app never renders: e-mails, receipts, notifications (CONTRACT.md v0.3 — "preferencia del
 * usuario" is the first step of the resolution). Saving the preference is best-effort: the
 * interface has already switched, and a failed write must not undo what the person just did.
 */
export function LocaleSwitcher({ tenantId, variant, id, className }: LocaleSwitcherProps): React.JSX.Element {
  const { apiClient, me, refreshProfile } = useAuth();
  const { locale, setLocale } = useTranslation();
  const effectiveTenantId = tenantId !== undefined ? tenantId : me?.activeTenant?.id ?? null;
  const { data } = useAvailableLocales(apiClient, effectiveTenantId);
  const profile = me?.user;

  // The account's stored language, applied once when the profile arrives — unless this browser
  // already carries a different explicit choice, which is the more recent intent of the two.
  const applied = React.useRef(false);
  React.useEffect(() => {
    if (applied.current || !profile) return;
    applied.current = true;
    if (isSupportedLocale(profile.locale) && profile.locale !== locale && !readsStoredChoice()) {
      setLocale(profile.locale);
    }
    // Runs once per profile load; `locale` is read, never depended on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  function handleChange(next: SupportedLocale): void {
    if (!profile || next === profile.locale) return;
    void apiClient.session
      .updateMe({
        ...toUpdateProfileRequest(toPersonalDataValues(profile), {
          locale: next,
          timeZone: profile.timeZone,
        }),
      })
      .then(() => refreshProfile())
      .catch(() => {
        // Best effort: the interface is already in the chosen language.
      });
  }

  return (
    <LocaleSelect
      locales={data ?? SUPPORTED_LOCALES}
      variant={variant}
      id={id}
      className={className}
      onLocaleChange={handleChange}
    />
  );
}

/** True when this browser already holds an explicit choice, which outranks the stored account one. */
function readsStoredChoice(): boolean {
  try {
    return Boolean(globalThis.localStorage?.getItem('luparx.locale'));
  } catch {
    return false;
  }
}
