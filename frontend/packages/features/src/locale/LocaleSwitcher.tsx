import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiClient } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@luparx/i18n';
import { LocaleSelect } from '@luparx/ui';
import { toPersonalDataValues, toUpdateProfileRequest } from '../profile/personalData';

const LOCALE_STALE_TIME_MS = 10 * 60 * 1000;

/** What a municipality offers: the tags it enabled, in its order, and which of them is its default. */
export interface AvailableLocales {
  locales: string[];
  defaultLocale?: string;
}

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
    queryFn: async (): Promise<AvailableLocales> => {
      if (!tenantId) return { locales: [...SUPPORTED_LOCALES] };
      try {
        const entries = await apiClient.catalog.tenantLocales(tenantId);
        const ordered = [...entries].sort((a, b) => a.sortOrder - b.sortOrder);
        if (ordered.length === 0) return { locales: [...SUPPORTED_LOCALES] };
        return {
          locales: ordered.map((entry) => entry.locale),
          defaultLocale: (ordered.find((entry) => entry.isDefault) ?? ordered[0])?.locale,
        };
      } catch {
        return { locales: [...SUPPORTED_LOCALES] };
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
 * because they answer two different questions. The browser remembers it, per portal, so a reload
 * — including the reload that lands on the login screen — keeps the language the person chose.
 * The account remembers it so it follows them to another device, and so the server can use it for
 * the things the app never renders: e-mails, receipts, notifications.
 *
 * Reconciling that local copy with the account's own language is not done here — see
 * {@link LocalePreferenceSync}, which is mounted for the whole app. This control only exists on
 * two screens, and signing in leaves both of them, so a reconciliation living here would run only
 * when someone happened to be looking at one of those two screens.
 */
export function LocaleSwitcher({ tenantId, variant, id, className }: LocaleSwitcherProps): React.JSX.Element {
  const { apiClient, me, refreshProfile } = useAuth();
  const effectiveTenantId = tenantId !== undefined ? tenantId : me?.activeTenant?.id ?? null;
  const { data } = useAvailableLocales(apiClient, effectiveTenantId);
  const profile = me?.user;
  const enabled = data?.locales;

  function handleChange(next: SupportedLocale): void {
    // `LocaleSelect` has already switched the interface and remembered the choice in this browser.
    // Saving it on the account is best effort: a failed write must not undo what the person did.
    if (!profile || next === profile.locale) return;
    void apiClient.session
      .updateMe({
        ...toUpdateProfileRequest(toPersonalDataValues(profile), {
          locale: next,
          timeZone: profile.timeZone,
        }),
      })
      .then(() => refreshProfile())
      .catch(() => undefined);
  }

  return (
    <LocaleSelect
      locales={enabled ?? SUPPORTED_LOCALES}
      variant={variant}
      id={id}
      className={className}
      onLocaleChange={handleChange}
    />
  );
}
