import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ActiveTenantBadge } from '@luparx/features';
import { useAuth, usePermissions } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Button, Brand, PageLayout } from '@luparx/ui';

export interface AdminShellProps {
  children: React.ReactNode;
}

/** Shared chrome for every authenticated admin screen: top bar + left nav (CONTRACT.md §4 `/api/v1/admin/**`). */
export function AdminShell({ children }: AdminShellProps): React.JSX.Element {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  return (
    <PageLayout
      header={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 'var(--lx-space-3)', alignItems: 'center', minWidth: 0 }}>
            <Brand name={t('app.name')} />
            {/* The municipality being administered, beside the LuParX mark (CONTRACT.md v0.4) —
                its emblem and short name, and the way back to the picker when there is a choice. */}
            <ActiveTenantBadge onOpenSelector={() => navigate('/select-tenant')} />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link to="/profile">{t('nav.profile')}</Link>
            <Button type="button" variant="ghost" onClick={() => logout()}>
              {t('auth.logout.action')}
            </Button>
          </div>
        </div>
      }
      sidebar={
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link to="/">{t('nav.home')}</Link>
          {/* Operación, antes que las personas: es lo que un municipal abre todos los días. */}
          {permissions.has('TENANT_MANAGE') ? (
            <>
              <Link to="/zones">{t('nav.zones')}</Link>
              <Link to="/spaces">{t('nav.spaces')}</Link>
              <Link to="/tariffs">{t('nav.tariffs')}</Link>
            </>
          ) : null}
          <Link to="/users">{t('nav.users')}</Link>
          {/* The staff panel is its own destination and not a filter of Usuarios: the questions are
              different — that list is about the people of the municipality, this one is about the
              posts it has granted. */}
          {permissions.has('USER_READ') ? <Link to="/staff">{t('nav.staff')}</Link> : null}
          <Link to="/audit">{t('nav.audit')}</Link>
          <Link to="/reports">{t('nav.reports')}</Link>
          <hr />
          {/* Enforcement (CONTRACT.md v0.7). Shown only to whoever may read a citation: finance and
              support hold `CITATION_READ`; the catalogue additionally needs `ENFORCEMENT_MANAGE`.
              The server checks both again — this only keeps a control off a screen where pressing
              it could only ever produce a 403. */}
          {permissions.has('CITATION_READ') ? (
            <>
              <strong className="lx-text-meta">{t('nav.enforcement')}</strong>
              <Link to="/enforcement/citations">{t('nav.enforcement.citations')}</Link>
              <Link to="/appeals">{t('nav.appeals')}</Link>
              {permissions.has('ENFORCEMENT_MANAGE') ? (
                <Link to="/settings/infraction-types">{t('nav.enforcement.types')}</Link>
              ) : null}
              <hr />
            </>
          ) : null}
          {/* Municipal operation settings (CONTRACT.md v0.3) — everything a municipality tunes for
              itself: the languages its portals speak, how a bay is numbered, and when it charges. */}
          <strong className="lx-text-meta">{t('nav.settings')}</strong>
          <Link to="/settings/locales">{t('admin.settings.locales.title')}</Link>
          <Link to="/settings/space-format">{t('admin.settings.spaceFormat.title')}</Link>
          <Link to="/settings/schedule">{t('admin.settings.schedule.title')}</Link>
        </nav>
      }
    >
      {children}
    </PageLayout>
  );
}
