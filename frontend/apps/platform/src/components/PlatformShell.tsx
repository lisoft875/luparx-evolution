import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import {
  Brand,
  Button,
  IconAudit,
  IconBuilding,
  IconLogout,
  IconReports,
  IconCatalog,
  IconSystem,
  IconUsers,
  PageLayout,
  PlatformBanner,
} from '@luparx/ui';

export interface PlatformShellProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { to: '/tenants', labelKey: 'platform.nav.tenants', icon: IconBuilding },
  { to: '/users', labelKey: 'platform.nav.users', icon: IconUsers },
  { to: '/audit', labelKey: 'platform.nav.audit', icon: IconAudit },
  { to: '/reports', labelKey: 'platform.nav.reports', icon: IconReports },
  { to: '/catalogs', labelKey: 'platform.nav.catalogs', icon: IconCatalog },
  { to: '/system', labelKey: 'platform.nav.system', icon: IconSystem },
] as const;

/** Shared chrome for every authenticated platform screen: permanent scope banner, brand header, left nav (CONTRACT.md §4 `/api/v1/platform/**`). */
export function PlatformShell({ children }: PlatformShellProps): React.JSX.Element {
  const { t } = useTranslation();
  const { me, logout } = useAuth();
  const location = useLocation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PlatformBanner>{t('platform.banner.default')}</PlatformBanner>
      <PageLayout
        header={
          <div className="lx-shell-header-row">
            <Brand name={t('app.name')} tagline={t('auth.portal.platform.title')} />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Link to="/profile" className="lx-text-meta">
                {me ? `${me.user.givenName} ${me.user.familyName}` : t('nav.profile')}
              </Link>
              <Button type="button" variant="ghost" onClick={() => logout()}>
                <IconLogout size={16} /> {t('auth.logout.action')}
              </Button>
            </div>
          </div>
        }
        sidebar={
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }} aria-label="primary">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--lx-space-2)',
                    padding: 'var(--lx-space-2) var(--lx-space-3)',
                    borderRadius: 'var(--lx-radius-sm)',
                    color: active ? 'var(--lx-primary)' : 'var(--lx-text)',
                    background: active ? 'var(--lx-primary-soft)' : 'transparent',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <Icon size={18} />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        }
      >
        {children}
      </PageLayout>
    </div>
  );
}
