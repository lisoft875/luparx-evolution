import * as React from 'react';
import { useState } from 'react';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Button, TenantMark } from '@luparx/ui';
import { TenantSheet } from './TenantSheet';

export interface TenantSwitchControlProps {
  /**
   * Called after the active municipality has actually changed. Screens with their own local
   * selections (a chosen zone, a typed bay code, a picked duration) reset them here: those belong
   * to the municipality that was active when they were made and mean nothing in another one.
   */
  onSwitched?: (tenantId: string) => void;
  /** Supporting line under the municipality's name, e.g. "zones and rates depend on this". */
  hint?: string;
}

/**
 * The active municipality, shown where a decision depends on it, with the switch beside it.
 *
 * The parking flow is the case this exists for: which zones there are, what an hour costs, what a
 * bay code looks like and how much money is available are all answers this one choice decides, and
 * a person standing in a bay in Escazú with the app still set to San José would be told a price
 * that will never be charged. So the municipality is stated *before* the zone is chosen rather than
 * assumed, and changing it here goes through the same `switchTenant` every other path uses — which
 * is what drops the previous municipality's cached answers (see TenantCacheReset) instead of
 * leaving them on screen.
 */
export function TenantSwitchControl({ onSwitched, hint }: TenantSwitchControlProps): React.JSX.Element | null {
  const { t, locale } = useTranslation();
  const { activeTenant, activeMemberships, portal } = useAuth();
  const [open, setOpen] = useState(false);

  if (!activeTenant) return null;
  // A citizen can always change: since v0.6 the sheet offers the whole country and joins them to
  // whichever they pick, so hiding the control behind "you belong to more than one" would lock a
  // first-time visitor into the municipality they happened to register in. The other portals still
  // need a membership somebody granted, so for them one membership is genuinely no choice.
  const canSwitch = portal === 'citizen' || activeMemberships.length > 1;

  return (
    <>
      <div className="lx-tenant-switch">
        <TenantMark
          name={activeTenant.name}
          logoUrl={activeTenant.logoUrl}
          brandColor={activeTenant.brandColor}
          size="badge"
          decorative
          locale={locale}
        />
        <span className="lx-tenant-switch__text">
          <span className="lx-tenant-switch__name">{activeTenant.name}</span>
          {hint ? <span className="lx-tenant-switch__meta">{hint}</span> : null}
        </span>
        {canSwitch ? (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            {t('tenant.switch.action')}
          </Button>
        ) : null}
      </div>

      {/* The very same sheet the app opens on and the top-bar badge reopens — so changing
          municipality here cannot come to mean anything different from changing it there. */}
      <TenantSheet open={open} onClose={() => setOpen(false)} onSelected={(tenantId) => onSwitched?.(tenantId)} />
    </>
  );
}
