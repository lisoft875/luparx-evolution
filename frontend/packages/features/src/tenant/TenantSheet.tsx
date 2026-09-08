import * as React from 'react';
import { useCallback, useState } from 'react';
import { ApiError, NetworkError, type MembershipSummary } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, EmptyState, IconBuilding, Modal, TenantGrid, TenantTile, TenantTileSkeleton } from '@luparx/ui';

export interface TenantSheetProps {
  open: boolean;
  /**
   * Closes the sheet. It is only honoured when there is an active municipality to go back to:
   * closing the sheet with nothing chosen would leave the app on a screen whose every number
   * belongs to a municipality that has not been picked. Pass it anyway — the sheet decides.
   */
  onClose?: () => void;
  /** Called after the session has actually been re-scoped, with the municipality that won. */
  onSelected?: (tenantId: string) => void;
  /** Pinned under the grid. The picker for an account with no memberships puts "sign out" here. */
  footer?: React.ReactNode;
}

/**
 * The municipality sheet (CONTRACT.md v0.4) — the one component every route into this choice uses.
 *
 * A modal sheet and not a page, because the choice is the same choice wherever it is made: on
 * opening the app with none chosen, from the badge in the top bar, and from the parking flow just
 * before a stay is started. Three screens that looked alike but drifted apart is exactly how a
 * person ends up meeting two different answers to one question, so there is one implementation and
 * the callers differ only in whether it can be closed.
 *
 * It is a grid of emblems with names underneath rather than a list of names because that is what
 * the screen is *for*: someone who belongs to three municipalities recognises the one they want by
 * its coat of arms long before they finish reading a label.
 *
 * Four states, all of them real:
 * - **loading** — tile-shaped skeletons, so the grid does not jump when the memberships arrive;
 * - **error** — what went wrong plus a retry, never a blank sheet;
 * - **empty** — the account belongs to nothing yet, explained with the same wording the server's
 *   `NO_ACTIVE_MEMBERSHIP` gets everywhere else, so a person cannot meet two descriptions of one
 *   situation;
 * - **ready** — the grid, with the active municipality marked.
 *
 * Dismissal is deliberate: `dismissible` is false until a municipality is actually active, so the
 * sheet has no close button, ignores Escape and ignores the backdrop. There is nothing behind it
 * to return to, and an X that cannot honestly close anything is a worse answer than no X.
 */
export function TenantSheet({ open, onClose, onSelected, footer }: TenantSheetProps): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { status, activeMemberships, activeTenant, switchTenant, refreshProfile } = useAuth();
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const handleSelect = useCallback(
    async (membership: MembershipSummary): Promise<void> => {
      // Re-picking the municipality already in force is a no-op, not a round-trip: rotating the
      // session's tokens and dropping every cached answer to land exactly where we are would make
      // the app flash its loading states for nothing.
      if (membership.tenantId === activeTenant?.id) {
        onClose?.();
        return;
      }
      setPendingTenantId(membership.tenantId);
      setError(null);
      try {
        await switchTenant(membership.tenantId);
        onSelected?.(membership.tenantId);
        onClose?.();
      } catch (caught) {
        // Say which failure it was. "Something went wrong" sends people to look for a typo when
        // the API was simply unreachable, and hides a revoked membership behind a generic message.
        if (caught instanceof NetworkError) setError(t('common.error.network'));
        else if (caught instanceof ApiError && (caught.status === 403 || caught.status === 404))
          setError(t('tenant.selector.error.notAvailable'));
        else setError(t('common.error.generic'));
      } finally {
        setPendingTenantId(null);
      }
    },
    [activeTenant?.id, onClose, onSelected, switchTenant, t],
  );

  const handleRetry = useCallback(async (): Promise<void> => {
    setRetrying(true);
    setError(null);
    try {
      await refreshProfile();
    } catch {
      setError(t('common.error.generic'));
    } finally {
      setRetrying(false);
    }
  }, [refreshProfile, t]);

  const loading = status === 'loading';
  // Closable only when closing leads somewhere. See the class note above.
  const dismissible = Boolean(onClose) && Boolean(activeTenant);

  return (
    <Modal
      open={open}
      onClose={() => onClose?.()}
      dismissible={dismissible}
      variant="sheet"
      title={t('tenant.sheet.title')}
      description={activeMemberships.length > 1 ? t('tenant.sheet.description') : undefined}
      closeLabel={t('common.close')}
      footer={footer}
    >
      {error ? (
        <Alert tone="danger">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)', alignItems: 'flex-start' }}>
            <span>{error}</span>
            <Button type="button" variant="outline" loading={retrying} onClick={() => void handleRetry()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {loading ? (
        <div className="lx-tenant-grid" aria-hidden="true">
          <TenantTileSkeleton />
          <TenantTileSkeleton />
          <TenantTileSkeleton />
          <TenantTileSkeleton />
        </div>
      ) : activeMemberships.length === 0 ? (
        <EmptyState
          icon={<IconBuilding />}
          title={t('tenant.selector.empty.title')}
          /* The same sentence the server's NO_ACTIVE_MEMBERSHIP is translated to everywhere
             else — one situation, one wording. */
          description={t('common.error.NO_ACTIVE_MEMBERSHIP')}
        />
      ) : (
        <TenantGrid label={t('tenant.sheet.title')}>
          {activeMemberships.map((membership) => (
            <TenantTile
              key={membership.tenantId}
              name={membership.tenantName}
              logoUrl={membership.tenantLogoUrl}
              brandColor={membership.tenantBrandColor}
              selected={activeTenant?.id === membership.tenantId}
              busy={pendingTenantId === membership.tenantId}
              disabled={pendingTenantId !== null && pendingTenantId !== membership.tenantId}
              busyLabel={t('common.loading')}
              locale={locale}
              onSelect={() => void handleSelect(membership)}
            />
          ))}
        </TenantGrid>
      )}
    </Modal>
  );
}
