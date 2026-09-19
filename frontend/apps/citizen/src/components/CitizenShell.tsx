import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@luparx/i18n';
import { ActiveTenantBadge, TenantSheet } from '@luparx/features';
import { AppBar, Brand, BottomTabBar, IconBell, IconCar, IconHome, IconList, IconPark, IconWallet } from '@luparx/ui';
import type { BottomTab } from '@luparx/ui';
import { ActiveSessionsBar } from './ActiveSessionsBar';
import { useUnreadNotificationCount } from '../lib/queries';

export interface CitizenShellProps {
  children: React.ReactNode;
  /** Detail-screen title, shown in the compact app bar next to a back arrow (DESIGN_SYSTEM.md §3 "App bar"). Requires `onBack`. */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  /**
   * A bottom-tab root screen (Vehículos, Multas, Billetera, Mi cuenta):
   * suppresses the app bar entirely — the screen's own "Título de pantalla"
   * (28/700) heading takes its place, matching the reference mockup's plain
   * content heading for these screens.
   */
  bare?: boolean;
  /**
   * That heading, for a `bare` screen — the `<h1>` and anything that belongs on its line, such as
   * Vehículos' "Agregar" button.
   *
   * <p>It is a prop rather than the first child because the running-stay bar goes <em>between</em>
   * the heading and the content: on a screen with no app bar the title is what says where you are,
   * and pushing it below a bar that is only sometimes there made the screen look like it belonged
   * to the timer. Passing it up here is what lets the shell put the bar in the middle.</p>
   */
  heading?: React.ReactNode;
}

/**
 * Shared chrome for every citizen screen: brand+bell app bar (Home), no app
 * bar at all (`bare` — tab-root list screens render their own in-content
 * heading), or back+title(+subtitle) (drill-down screens) — plus the fixed
 * 5-destination bottom bar (DESIGN_SYSTEM.md §3).
 */
export function CitizenShell({
  children,
  title,
  subtitle,
  onBack,
  bare = false,
  heading,
}: CitizenShellProps): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Only for the root screens that show the bell: a detail screen renders a back arrow instead, and
  // polling a count nobody can see would be a request per minute per open screen for nothing.
  const unreadQuery = useUnreadNotificationCount();
  const unreadCount = unreadQuery.data?.unread;
  const location = useLocation();

  // The footer (the tab bar) is `position: fixed`, so it never reserves space in normal flow on
  // its own — measured here and applied as `main`'s bottom padding so it can never cover page
  // content. A plain `position: sticky` footer looked equivalent but only "sticks" once its static
  // flow position would scroll past the viewport edge; on a page taller than one screen it stayed
  // glued to the bottom from scroll position zero and overlapped whatever content happened to
  // render underneath — fixed + measured padding is what actually holds on every screen, tall or
  // short. The top chrome needs none of that: sticky is exactly right at the top, because the
  // element's static position *is* where it belongs before any scrolling, so it reserves its own
  // space in flow and can never cover anything.
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
      if (!entry) return;
      /*
        `borderBoxSize` y NO `contentRect`: éste devuelve la caja de CONTENIDO, sin el padding, y la
        barra de pestañas paga `padding-bottom: env(safe-area-inset-bottom)` — la franja del gesto
        del iPhone. En un 14 Pro Max eso son 34px que la barra ocupa y que `contentRect` no reporta:
        medido, 90px reales contra 56 informados.

        El efecto era que `main` reservaba 34px de menos y lo ÚLTIMO de cada pantalla quedaba debajo
        de la barra: la tarjeta de multas y «Ver todas» en el Inicio, «Agregar tarjeta» en la
        Billetera, el selector de idioma en Más. Detectado por
        tests/responsive/sobre-el-pliegue.cjs el 2026-09-19.

        `getBoundingClientRect()` de respaldo para navegadores sin `borderBoxSize` (Safari < 15.4),
        que devuelve lo mismo y está siempre disponible.
      */
      const alto = entry.borderBoxSize?.[0]?.blockSize ?? node.getBoundingClientRect().height;
      setFooterHeight(alto);
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
      onSelect: () => navigate('/more'),
      current:
        location.pathname === '/more' ||
        location.pathname.startsWith('/profile') ||
        location.pathname.startsWith('/fines'),
    },
  ];

  return (
    // `100dvh` y no `100vh`: en Safari de iPhone `vh` es la altura con la barra de herramientas
    // RETRAÍDA, o sea más alta que lo que se ve. El shell se declaraba más alto que la pantalla, la
    // barra de pestañas quedaba empujada fuera del área visible y había que hacer scroll para
    // alcanzar acciones que están arriba del todo —reportado en un iPhone 14 Pro Max al buscar
    // «agregar vehículo», que vive en la cabecera. `dvh` sigue a la barra en vez de ignorarla.
    <div
      // La altura REAL de la barra de pestañas, medida acá y publicada como variable para que un
      // CTA fijo pueda apoyarse en ella sin volver a medirla ni codificar un número: la barra
      // cambia de alto con la safe-area del aparato y con el modo de accesibilidad.
      style={
        {
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100dvh',
          background: 'transparent',
          '--lx-bottom-nav-height': `${footerHeight}px`,
        } as React.CSSProperties
      }
    >
      {/* On a `bare` screen the heading scrolls away like ordinary content and the timer bar below
          it is what stays — so the screen is titled by its own name, not by whatever is parked
          (CONTRACT.md v0.10). It sits outside `main` only so the bar can come between the two. */}
      {bare && heading ? <div className="lx-screen-heading">{heading}</div> : null}
      {/* Top chrome as one sticky group: the app bar (when the screen has one) and, on every screen
          while a stay is running, the countdown (CONTRACT.md v0.2 rule 3 / v0.10). Grouping them is
          what keeps the safe-area inset handled exactly once — the app bar already pays it, and on
          `bare` screens the timer bar pays it instead as the group's only child (see
          `.lx-top-chrome > .lx-sticky-timer-bar:first-child` in tokens.css). */}
      <div className="lx-top-chrome">
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
              ? [
                  {
                    icon: <IconBell />,
                    label: t('common.notifications'),
                    onClick: () => navigate('/notifications'),
                    // Undefined and not 0 while the count is still loading, so the badge is absent
                    // rather than briefly claiming "0" — AppBar hides a falsy count either way, but
                    // saying "no news" before asking would be the screen guessing.
                    badgeCount: unreadCount,
                  },
                ]
              : []
          }
        />
        )}
        <ActiveSessionsBar />
      </div>
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
        <BottomTabBar tabs={tabs} />
      </div>
      {/* Reopened from the badge. Everything tenant-scoped on the screen behind is dropped and
          re-read by TenantCacheReset the moment the choice actually changes. */}
      <TenantSheet open={tenantSheetOpen} onClose={() => setTenantSheetOpen(false)} />
    </div>
  );
}
