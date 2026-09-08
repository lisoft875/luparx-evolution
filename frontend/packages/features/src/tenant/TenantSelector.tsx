import * as React from 'react';
import { useTranslation } from '@luparx/i18n';
import { Brand } from '@luparx/ui';
import { TenantSheet } from './TenantSheet';

export interface TenantSelectorProps {
  /** Called once the session is scoped to the chosen municipality. */
  onSelected: () => void;
  /** Rendered under the grid — e.g. a "sign out" escape hatch for an account with no memberships. */
  footer?: React.ReactNode;
}

/**
 * The "choose your municipality" step as a route (CONTRACT.md v0.4).
 *
 * This is the guard's destination: `RequireTenant` sends an account with no active municipality
 * here, so the sheet is what the app opens on. It renders the very same {@link TenantSheet} the
 * badge and the parking flow open — the difference is only that this one cannot be closed, because
 * there is nothing behind it yet to go back to.
 *
 * Behind the sheet is the product's own ground with the LuParX mark on it, and not a blank page:
 * the sheet is translucent at its edges and on a wide screen it is a centred panel, so what sits
 * underneath is visible and should say which product this is.
 */
export function TenantSelector({ onSelected, footer }: TenantSelectorProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="lx-tenant-picker">
      <Brand name={t('app.name')} />
      <TenantSheet open onSelected={() => onSelected()} footer={footer} />
    </div>
  );
}
