import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, NetworkError, type TenantCatalogEntry } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import {
  Alert,
  Button,
  EmptyState,
  IconBuilding,
  Input,
  Modal,
  TenantGrid,
  TenantTile,
  TenantTileSkeleton,
} from '@luparx/ui';
import { useTenants } from '../catalogHooks';

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

/** Above this many tiles the sheet stops being something you scan and starts being something you search. */
const SEARCH_THRESHOLD = 8;

/**
 * The municipality sheet (CONTRACT.md v0.4, extended in v0.6) — the one component every route into
 * this choice uses.
 *
 * <p><b>On the citizen portal it offers the country, not the account's history.</b> Since v0.6,
 * `POST /citizen/session/tenant` creates the membership on the spot for a municipality the citizen
 * had never used, which is the product: somebody who drives to Cartago for the afternoon pays for
 * a bay there without asking anyone's permission first. A picker that showed only the
 * municipalities they had already joined made that impossible to reach — you could only ever
 * return to where you had already been. So the grid is `GET /catalog/tenants`, the whole
 * publishable list, with the ones the citizen already uses marked as such.</p>
 *
 * <p>The other portals are unchanged and must be: an admin or inspector membership <em>is</em>
 * authority, the server refuses to grant one on request, and offering a grid of municipalities
 * nobody can enter would be a list of doors that do not open. Those portals keep showing
 * `activeMemberships`.</p>
 *
 * <p><b>Search reaches past the list.</b> `q` is sent to the server, which matches on name and
 * slug, so typing "cart" finds Cartago whether or not it was in the first response. It appears
 * once there are more tiles than a person will scan (see `SEARCH_THRESHOLD`) — a country with
 * dozens of municipalities is unusable without it, and a search box over four tiles is noise.</p>
 *
 * <p>A municipality that has closed itself to self-service answers
 * `TENANT_NOT_OPEN_TO_CITIZENS`; that is its own message, not a generic access denial, because the
 * citizen has done nothing wrong and there is nothing for them to fix.</p>
 */
export function TenantSheet({ open, onClose, onSelected, footer }: TenantSheetProps): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { status, portal, activeMemberships, activeTenant, switchTenant, refreshProfile, apiClient } = useAuth();
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [search, setSearch] = useState('');

  // Only the citizen portal can join on the fly, so only it browses the catalogue.
  const offersCatalog = portal === 'citizen';
  // The country of the municipality in force. A citizen driving between municipalities stays in
  // one country; the day the platform serves two, this is the seam that already carries it, and it
  // is never a hardcoded ISO code.
  const countryCode = activeTenant?.countryCode;
  const catalogQuery = useTenants(apiClient, countryCode, offersCatalog ? search : undefined);

  // Clearing the search on close matters: reopening the sheet on a filtered list looks like a
  // catalogue that has lost most of its municipalities.
  useEffect(() => {
    if (!open) {
      setSearch('');
      setError(null);
    }
  }, [open]);

  const memberTenantIds = useMemo(
    () => new Set(activeMemberships.map((membership) => membership.tenantId)),
    [activeMemberships],
  );

  /**
   * What the grid draws. On the citizen portal that is the catalogue; everywhere else it is the
   * memberships, mapped into the same shape so there is one renderer and not two.
   */
  const tenants: TenantCatalogEntry[] = useMemo(() => {
    if (offersCatalog) return catalogQuery.data ?? [];
    return activeMemberships.map((membership) => ({
      id: membership.tenantId,
      slug: membership.tenantId,
      name: membership.tenantName,
      countryCode: countryCode ?? '',
      shortName: membership.tenantShortName ?? null,
      logoUrl: membership.tenantLogoUrl ?? null,
      brandColor: membership.tenantBrandColor ?? null,
    }));
  }, [offersCatalog, catalogQuery.data, activeMemberships, countryCode]);

  const handleSelect = useCallback(
    async (tenantId: string): Promise<void> => {
      // Re-picking the municipality already in force is a no-op, not a round-trip: rotating the
      // session's tokens and dropping every cached answer to land exactly where we are would make
      // the app flash its loading states for nothing.
      if (tenantId === activeTenant?.id) {
        onClose?.();
        return;
      }
      setPendingTenantId(tenantId);
      setError(null);
      try {
        await switchTenant(tenantId);
        onSelected?.(tenantId);
        onClose?.();
      } catch (caught) {
        // Say which failure it was. "Something went wrong" sends people to look for a typo when
        // the API was simply unreachable, and hides a municipality's own policy behind a generic
        // message.
        if (caught instanceof NetworkError) setError(t('common.error.network'));
        else if (caught instanceof ApiError && caught.code === 'TENANT_NOT_OPEN_TO_CITIZENS')
          setError(t('tenant.selector.error.notOpenToCitizens'));
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
      await Promise.all([refreshProfile(), catalogQuery.refetch()]);
    } catch {
      setError(t('common.error.generic'));
    } finally {
      setRetrying(false);
    }
  }, [refreshProfile, catalogQuery, t]);

  const loading = status === 'loading' || (offersCatalog && catalogQuery.isPending);
  // Closable only when closing leads somewhere. See the class note above.
  const dismissible = Boolean(onClose) && Boolean(activeTenant);
  // The threshold is judged on the unfiltered catalogue, so the field does not vanish the moment a
  // search narrows the grid to three results — which would take away the only way back.
  const showSearch = offersCatalog && (search.length > 0 || tenants.length > SEARCH_THRESHOLD);

  return (
    <Modal
      open={open}
      onClose={() => onClose?.()}
      dismissible={dismissible}
      variant="sheet"
      title={t('tenant.sheet.title')}
      description={offersCatalog ? t('tenant.sheet.catalogDescription') : t('tenant.sheet.description')}
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

      {showSearch ? (
        <div style={{ marginBottom: 'var(--lx-space-4)' }}>
          <Input
            type="search"
            value={search}
            aria-label={t('tenant.sheet.searchLabel')}
            placeholder={t('tenant.sheet.searchPlaceholder')}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="lx-tenant-grid" aria-hidden="true">
          <TenantTileSkeleton />
          <TenantTileSkeleton />
          <TenantTileSkeleton />
          <TenantTileSkeleton />
        </div>
      ) : tenants.length === 0 ? (
        <EmptyState
          icon={<IconBuilding />}
          title={search ? t('tenant.sheet.noMatches.title') : t('tenant.selector.empty.title')}
          description={
            search
              ? t('tenant.sheet.noMatches.description', { query: search })
              : /* The same sentence the server's NO_ACTIVE_MEMBERSHIP is translated to everywhere
                   else — one situation, one wording. */
                t('common.error.NO_ACTIVE_MEMBERSHIP')
          }
        />
      ) : (
        <TenantGrid label={t('tenant.sheet.title')}>
          {tenants.map((tenant) => (
            <TenantTile
              key={tenant.id}
              name={tenant.name}
              logoUrl={tenant.logoUrl}
              brandColor={tenant.brandColor}
              selected={activeTenant?.id === tenant.id}
              // Which ones the citizen already uses, stated rather than implied by position: in a
              // grid of every municipality in the country, "I have a balance here" is the fact
              // that tells them apart.
              badge={memberTenantIds.has(tenant.id) ? t('tenant.sheet.memberBadge') : undefined}
              busy={pendingTenantId === tenant.id}
              disabled={pendingTenantId !== null && pendingTenantId !== tenant.id}
              busyLabel={t('common.loading')}
              locale={locale}
              onSelect={() => void handleSelect(tenant.id)}
            />
          ))}
        </TenantGrid>
      )}
    </Modal>
  );
}
