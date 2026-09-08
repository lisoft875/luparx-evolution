import * as React from 'react';
import { useState } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActiveTenantBadge } from '@luparx/features';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import {
  AppBar,
  Badge,
  Brand,
  Button,
  Card,
  EmptyState,
  IconLogout,
  IconOffline,
} from '@luparx/ui';

/** Tracks `navigator.onLine` so the offline state is always visible in the app bar (DESIGN_SYSTEM.md §5). */
function useIsOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    function goOnline(): void {
      setOnline(true);
    }
    function goOffline(): void {
      setOnline(false);
    }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return online;
}

export function HomePage(): React.JSX.Element {
  const { t } = useTranslation();
  const { me, memberships, logout } = useAuth();
  const navigate = useNavigate();
  const online = useIsOnline();
  const activeMemberships = memberships.filter((m) => m.status === 'ACTIVE');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'transparent' }}>
      <AppBar
        start={
          <>
            <Brand name={t('app.name')} tagline={t('auth.portal.inspector.title')} />
            {/* The municipality this shift is in, beside the LuParX mark (CONTRACT.md v0.4). */}
            <ActiveTenantBadge onOpenSelector={() => navigate('/select-tenant')} />
          </>
        }
        actions={[{ icon: <IconLogout />, label: t('auth.logout.action'), onClick: () => logout() }]}
      />
      <main
        style={{
          flex: 1,
          padding: 'var(--lx-space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--lx-space-4)',
          maxWidth: 640,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-2)' }}>
          <Badge tone={online ? 'success' : 'warning'} icon={<IconOffline size={14} />}>
            {online ? t('inspector.home.online') : t('inspector.home.offline')}
          </Badge>
        </div>

        <h1 className="lx-text-screen-title">{t('home.inspector.title')}</h1>
        {me ? (
          <p className="lx-text-body">
            {me.user.givenName} {me.user.familyName}
          </p>
        ) : null}
        {activeMemberships.length > 1 ? (
          <Button type="button" variant="secondary" onClick={() => navigate('/select-tenant')}>
            {t('profile.changeTenant')}
          </Button>
        ) : null}

        <Card>
          <p className="lx-text-card-title" style={{ margin: '0 0 var(--lx-space-3) 0' }}>
            {t('inspector.home.patrol.title')}
          </p>
          <EmptyState title={t('home.inspector.patrolStub.title')} description={t('home.inspector.patrolStub.description')} />
          {/* TODO(extension): wire /api/v1/inspector/patrols and /api/v1/inspector/citations once module-parking ships. */}
        </Card>

        <Button type="button" variant="ghost" onClick={() => navigate('/profile')}>
          {t('nav.profile')}
        </Button>
      </main>
    </div>
  );
}
