import * as React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Button, PageLayout } from '@luparx/ui';

export interface AdminShellProps {
  children: React.ReactNode;
}

/** Shared chrome for every authenticated admin screen: top bar + left nav (CONTRACT.md §4 `/api/v1/admin/**`). */
export function AdminShell({ children }: AdminShellProps): React.JSX.Element {
  const { t } = useTranslation();
  const { me, memberships, logout } = useAuth();
  const activeTenantName = me?.activeTenant?.name;
  const activeMemberships = memberships.filter((m) => m.status === 'ACTIVE');

  return (
    <PageLayout
      header={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>{t('app.name')}</strong>
            {activeTenantName ? <span> — {activeTenantName}</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {activeMemberships.length > 1 ? <Link to="/select-tenant">{t('profile.changeTenant')}</Link> : null}
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
          <Link to="/users">{t('nav.users')}</Link>
          <Link to="/audit">{t('nav.audit')}</Link>
          <Link to="/reports">{t('nav.reports')}</Link>
          <hr />
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
