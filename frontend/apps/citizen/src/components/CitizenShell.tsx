import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@luparx/i18n';
import { ActiveTenantBadge, TenantSheet } from '@luparx/features';
import { AppBar, Brand, BottomTabBar, IconBell, IconCar, IconHome, IconList, IconPark, IconWallet } from '@luparx/ui';
import type { BottomTab } from '@luparx/ui';
import { ActiveSessionsBar } from './ActiveSessionsBar';

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

  // The footer (timer bar + tab bar) is `position: fixed`, so it never reserves space in normal
  // flow on its own — measured here and applied as `main`'s bottom padding so it can never cover
  // page content (CONTRACT.md v0.2 rule 3). A plain `position: sticky` footer looked equivalent
  // but only "sticks" once its static flow position would scroll past the viewport edge; on a
  // page taller than one screen it stayed glued to the bottom from scroll position zero and
  // overlapped whatever content happened to render underneath — fixed + measured padding is what
  // actually holds on every screen, tall or short.
  // The municipality sheet is opened from the top-bar badge and closed again in place. It is not a
  // route: the person is in the middle of a screen, and navigating away and back would lose
  // whatever they had scrolled to or typed for the sake of a choice that takes one tap.
  const [tenantSheetOpen, setTenantSheetOpen] = useState(false);

  const footerRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  useEffect(() => {
    const node = footerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setFooterHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'transparent' }}>
      {bare ? null : (
        <AppBar
          start={
            !onBack ? (
              <>
                <Brand name={t('app.name')} />
                {/* The active municipality lives beside the LuParX mark (CONTRACT.md v0.4) and is
                    the way back to the picker. It renders nothing until one is chosen, and is only
                    pressable when the account has more than one to choose between. */}
                <ActiveTenantBadge onOpenSelector={() => setTenantSheetOpen(true)} />
              </>
            ) : undefined
          }
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
          paddingTop: 'var(--lx-space-4)',
          paddingRight: 'var(--lx-space-4)',
          paddingLeft: 'var(--lx-space-4)',
          paddingBottom: `calc(var(--lx-space-4) + ${footerHeight}px)`,
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
      <div ref={footerRef} style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20 }}>
        {/* Present on every screen while >=1 session is active (CONTRACT.md v0.2 rule 3) — fixed to
            the viewport bottom, stacked directly above the tab bar; `main`'s measured padding-bottom
            above is what keeps it from ever covering page content. */}
        <ActiveSessionsBar />
        <BottomTabBar tabs={tabs} />
      </div>
      {/* Reopened from the badge. Everything tenant-scoped on the screen behind is dropped and
          re-read by TenantCacheReset the moment the choice actually changes. */}
      <TenantSheet open={tenantSheetOpen} onClose={() => setTenantSheetOpen(false)} />
    </div>
  );
}
