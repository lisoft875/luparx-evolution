import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ActiveTenantBadge } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import {
  AppBar,
  Badge,
  BottomTabBar,
  Brand,
  IconCheck,
  IconFine,
  IconList,
  IconOffline,
  IconPin,
} from '@luparx/ui';
import type { BottomTab } from '@luparx/ui';
import { useCitationQueue, useIsOnline, useZoneDirectorySeed } from '../lib/queries';

export interface InspectorShellProps {
  children: React.ReactNode;
  /** Detail screens: back arrow + title instead of the brand row. */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack?: () => void;
}

/**
 * Shared chrome for the officer's app.
 *
 * Two things are always on screen, and both are deliberate (DESIGN_SYSTEM.md §5). The **connection
 * state** lives in the app bar, because an officer who does not know they are offline will assume a
 * citation was filed when it is still on the phone. The **five-destination bottom bar** keeps the
 * primary action inside the thumb's reach on a phone held in one hand — which is how this app is
 * used, standing, in the sun, sometimes with gloves.
 *
 * The pending count rides on the same badge as the connection state rather than getting its own
 * spot: "sin conexión · 2 pendientes" is one fact about the shift, and two separate indicators for
 * it would compete for the same glance.
 */
export function InspectorShell({
  children,
  title,
  subtitle,
  onBack,
}: InspectorShellProps): React.JSX.Element {
  const { t, tPlural } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useIsOnline();
  const { pending } = useCitationQueue();
  // One request per session, on whatever screen the officer lands on, so the zone picker is not
  // empty on a device that has already worked a shift.
  useZoneDirectorySeed();

  // The bottom bar is fixed, so it reserves no space in flow; its height is measured and applied as
  // the main region's bottom padding so it can never cover the last row of a list.
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  useEffect(() => {
    const node = footerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      /*
        `borderBoxSize` y NO `contentRect` (05-10-2026). `contentRect` devuelve la caja de
        CONTENIDO, sin el padding, y `.lx-bottom-tab-bar` paga `padding-bottom:
        env(safe-area-inset-bottom)` — la franja del gesto del iPhone. En un 14 Pro Max son 34px
        que la barra OCUPA y que `contentRect` no informa, así que `main` reservaba 34px de menos y
        lo último de cada lista quedaba debajo de la barra: justo lo que el PDF de barras fijas pide
        que no pase («el último elemento de una lista debe poder verse completo»).

        El Ciudadano ya tenía este arreglo desde el 19-09-2026, encontrado por
        tests/responsive/sobre-el-pliegue.cjs. El fiscalizador se había quedado con la versión
        vieja. `getBoundingClientRect()` de respaldo para Safari < 15.4, que devuelve lo mismo.
      */
      setFooterHeight(entry.borderBoxSize?.[0]?.blockSize ?? node.getBoundingClientRect().height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const tabs: BottomTab[] = [
    {
      key: 'lookup',
      label: t('inspector.nav.lookup'),
      icon: <IconPin />,
      onSelect: () => navigate('/'),
      current: location.pathname === '/',
    },
    {
      key: 'cite',
      label: t('inspector.nav.cite'),
      icon: <IconFine />,
      onSelect: () => navigate('/cite'),
      current: location.pathname.startsWith('/cite'),
    },
    {
      key: 'citations',
      label: t('inspector.nav.citations'),
      icon: <IconList />,
      onSelect: () => navigate('/citations'),
      current: location.pathname.startsWith('/citations'),
    },
    {
      key: 'queue',
      // The tab label is shorter than the screen's own title on purpose: five destinations share
      // one row on a 390 px phone, and a two-line label steals height from the content above it.
      label: t('inspector.nav.queue'),
      icon: <IconCheck />,
      onSelect: () => navigate('/queue'),
      current: location.pathname.startsWith('/queue'),
      badgeCount: pending > 0 ? pending : undefined,
    },
    {
      key: 'more',
      label: t('inspector.nav.more'),
      icon: <IconOffline />,
      // «Más» ya no cae en el perfil: ahora es el menú de herramientas del fiscalizador. El
      // perfil sigue estando, una fila más abajo, que es donde la especificación del 24-09-2026
      // lo pone.
      onSelect: () => navigate('/more'),
      // `/more` Y `/profile`: el perfil se abre DESDE Más y es su pantalla hija, así que la
      // pestaña se queda iluminada. Antes decía sólo `/profile`, con lo cual estando en Más no se
      // iluminaba ninguna pestaña —la pantalla no decía en qué sección estabas— y estando en el
      // perfil se iluminaba una que no era la que habías tocado. Ayuda cuelga del mismo sitio.
      current:
        location.pathname.startsWith('/more')
        || location.pathname.startsWith('/profile')
        || location.pathname.startsWith('/help'),
    },
  ];

  return (
    <div
      // La altura REAL de la barra inferior, medida arriba y publicada como variable para que
      // cualquier acción fija pueda apoyarse en ella sin volver a medirla ni codificar un número:
      // la barra cambia de alto con la safe-area del aparato.
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
      {/*
        El cromo de arriba, como un solo bloque que se queda (05-10-2026).

        Antes la barra era fija sólo donde una pantalla pedía `stickyHeader` —dos de nueve— y la
        insignia de conexión no lo era en ninguna: vivía debajo de la cabecera, en flujo normal, así
        que al desplazar «Mis boletas» se iba de la pantalla junto con el logo y la municipalidad.
        Eso es lo que reporta el PDF de barras fijas, y lo que pide es exactamente esto: que el
        header conserve «logo, municipalidad, estado En línea».

        `.lx-top-chrome` no es nuevo: es el mismo bloque que el Ciudadano usa desde el contrato
        v0.10 para agrupar su barra y el cronómetro de estadía. Agruparlos es lo que hace que la
        safe-area del notch se pague UNA vez —la paga la barra, que va primero— y que las dos filas
        se queden o se vayan juntas en vez de cada una por su cuenta.

        `sticky` y no `fixed`: el bloque conserva su lugar en el flujo, así que no hay que compensar
        su altura con relleno, no aparece una segunda barra de desplazamiento y el contenido no
        salta al activarse.
      */}
      <div className="lx-top-chrome">
        <AppBar
          start={
            !onBack ? (
              <>
                <Brand name={t('app.name')} />
                <ActiveTenantBadge onOpenSelector={() => navigate('/select-tenant')} />
              </>
            ) : undefined
          }
          onBack={onBack}
          backLabel={t('common.back')}
          title={onBack ? title : undefined}
          subtitle={onBack ? subtitle : undefined}
        />
        {/* Franja propia y a todo el ancho, con fondo opaco: lo que se desplaza tiene que pasar por
            DEBAJO y no verse a través. El recuadro interior comparte la caja de `main` para que la
            insignia quede alineada con el contenido y no pegada al borde de la pantalla. */}
        <div className="lx-inspector-status-bar">
          <div className="lx-inspector-status-bar__inner">
            {/* Never colour alone: the badge always carries the word as well as the tone. */}
            <Badge tone={online ? 'success' : 'warning'} icon={<IconOffline size={16} />}>
              {online
                ? pending > 0
                  ? tPlural('inspector.queue.count', pending)
                  : t('inspector.home.online')
                : pending > 0
                  ? tPlural('inspector.offline.queued', pending)
                  : t('inspector.offline.badge')}
            </Badge>
          </div>
        </div>
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
          maxWidth: 640,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {children}
      </main>
      <div
        ref={footerRef}
        data-lx-bottom-chrome=""
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20 }}
      >
        <BottomTabBar tabs={tabs} />
      </div>
    </div>
  );
}
