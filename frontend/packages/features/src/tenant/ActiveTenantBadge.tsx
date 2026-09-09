import * as React from 'react';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { TenantBadge } from '@luparx/ui';

export interface ActiveTenantBadgeProps {
  /** Opens the picker. Omit and the badge is static — correct where there is nothing to switch to. */
  onOpenSelector?: () => void;
  className?: string;
}

/**
 * The active municipality, beside the LuParX mark (CONTRACT.md v0.4).
 *
 * Renders nothing when there is no municipality to name — the picker is what that state gets, not
 * an empty chip in the top bar. It is only pressable when the account actually has somewhere else
 * to go: a badge that opens a picker with one option in it is a dead end dressed as an affordance.
 */
export function ActiveTenantBadge({ onOpenSelector, className }: ActiveTenantBadgeProps): React.JSX.Element | null {
  const { t, locale } = useTranslation();
  const { activeTenant, activeMemberships, portal } = useAuth();

  if (!activeTenant) return null;
  // On the citizen portal the sheet offers every municipality in the country and joins them to
  // whichever they choose, so there is always somewhere else to go. Elsewhere it still needs a
  // second membership: a picker with one option in it is a dead end dressed as an affordance.
  const canSwitch = Boolean(onOpenSelector) && (portal === 'citizen' || activeMemberships.length > 1);

  return (
    <TenantBadge
      name={activeTenant.name}
      shortName={activeTenant.shortName}
      logoUrl={activeTenant.logoUrl}
      brandColor={activeTenant.brandColor}
      onClick={canSwitch ? onOpenSelector : undefined}
      actionLabel={t('tenant.badge.changeAction')}
      className={className}
      locale={locale}
    />
  );
}
