import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@luparx/i18n';
import { AppBar, Brand, BottomTabBar, IconBell, IconCar, IconHome, IconList, IconPark, IconWallet } from '@luparx/ui';
import type { BottomTab } from '@luparx/ui';

export interface CitizenShellProps {
  children: React.ReactNode;
  /** Detail-screen title, shown in the compact app bar next to a back arrow (DESIGN_SYSTEM.md §3 "App bar"). Requires `onBack`. */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  /**
   * A bottom-tab root screen (Vehículos, Multas, Billetera, Mi cuenta):
   * suppresses the app bar entirely — the page renders its own in-content
   * "Título de pantalla" (28/700) heading instead, matching the reference
   * mockup's plain content heading for these screens.
   */
  bare?: boolean;
}

/**
 * Shared chrome for every citizen screen: brand+bell app bar (Home), no app
 * bar at all (`bare` — tab-root list screens render their own in-content
 * heading), or back+title(+subtitle) (drill-down screens) — plus the fixed
 * 5-destination bottom bar (DESIGN_SYSTEM.md §3).
 */
export function CitizenShell({ children, title, subtitle, onBack, bare = false }: CitizenShellProps): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const tabs: BottomTab[] = [
    {
      key: 'home',
      label: t('nav.home'),
      icon: <IconHome />,
      onSelect: () => navigate('/'),
      current: location.pathname === '/',
    },
    {
      key: 'park',
      label: t('nav.park'),
      icon: <IconPark />,
      onSelect: () => navigate('/park'),
      current: location.pathname.startsWith('/park'),
    },
    {
      key: 'vehicles',
      label: t('nav.vehicles'),
      icon: <IconCar />,
      onSelect: () => navigate('/vehicles'),
      current: location.pathname === '/vehicles',
    },
    {
      key: 'wallet',
      label: t('nav.wallet'),
      icon: <IconWallet />,
      onSelect: () => navigate('/wallet'),
      current: location.pathname === '/wallet' || location.pathname === '/movements',
    },
    {
      key: 'more',
      label: t('nav.more'),
      icon: <IconList />,
      onSelect: () => navigate('/profile'),
      current: location.pathname === '/profile' || location.pathname === '/fines',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--lx-bg)' }}>
      {bare ? null : (
        <AppBar
          start={!onBack ? <Brand name={t('app.name')} /> : undefined}
          onBack={onBack}
          backLabel={t('common.back')}
          title={onBack ? title : undefined}
          subtitle={onBack ? subtitle : undefined}
          actions={
            !onBack
              ? // TODO(domain): notification count stands in for `/api/v1/citizen/notifications` (unread count).
                [{ icon: <IconBell />, label: t('common.notifications'), onClick: () => undefined, badgeCount: 7 }]
              : []
          }
        />
      )}
      <main
        style={{
          flex: 1,
          padding: 'var(--lx-space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--lx-card-gap)',
          maxWidth: 560,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {children}
      </main>
      <div style={{ position: 'sticky', bottom: 0 }}>
        <BottomTabBar tabs={tabs} />
      </div>
    </div>
  );
}
