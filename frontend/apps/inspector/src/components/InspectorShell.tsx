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
  IconBell,
  IconCheck,
  IconFine,
  IconList,
  IconOffline,
  IconPin,
} from '@luparx/ui';
import type { BottomTab } from '@luparx/ui';
import { useCitationQueue, useInspectorUnreadCount, useIsOnline, useZoneDirectorySeed } from '../lib/queries';

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
 * El recuento de pendientes NO va en esa insignia (06-10-2026). Durante un día compartieron texto
 * —«sin conexión · 2 pendientes»— con el argumento de que son un solo hecho del turno. El argumento
 * sigue siendo bueno y la fila no da para él: la insignia vive en la esquina de una barra que ya
 * lleva el logo y la municipalidad, y esa frase no cabe en un teléfono de 320px. El recuento tiene
 * su sitio propio desde el primer día, y mejor: la pestaña «Pendientes» lo lleva como número y se
 * puede tocar para ir a verlas.
 */
export function InspectorShell({
  children,
  title,
  subtitle,
  onBack,
}: InspectorShellProps): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useIsOnline();
  const { pending } = useCitationQueue();
  /*
    El número de la campana (06-10-2026).

    Suma dos cosas distintas a propósito, y hay que decirlo: los avisos del servidor sin leer y las
    boletas que todavía no salieron del teléfono. La campana no es «mensajes», es «lo que requiere tu
    atención», y para un fiscalizador una boleta sin subir requiere más atención que cualquier aviso.

    La cola no puede ser una notificación del servidor —son boletas que el servidor no conoce— así que
    es el cliente el único que puede sumarlas, y es acá.
  */
  const sinLeer = useInspectorUnreadCount();
  const avisos = (sinLeer.data?.unread ?? 0) + pending;
  /** La única pantalla sin campana: la de los avisos. Un botón hacia donde ya estás. */
  const enAvisos = location.pathname.startsWith('/notifications');
  // One request per session, on whatever screen the officer lands on, so the zone picker is not
  // empty on a device that has already worked a shift.
  useZoneDirectorySeed();

  /*
    Al cambiar de pantalla, arriba (08-10-2026).

    `barras-fijas.cjs` lo encontró: con la pantalla desplazada al fondo y tocando un destino de la
    barra inferior, la pantalla nueva aparecía a `scrollY=183` — a media altura, con su título
    fuera de la vista. React Router no reposiciona el desplazamiento al navegar, y el navegador
    conserva el que tenía.

    No es una regresión de esta tanda, y conviene decirlo con precisión: el defecto estaba desde
    siempre y lo que cambió es que ahora SE VE. Antes la pantalla de destino era más corta que el
    desplazamiento heredado, así que el navegador lo recortaba a cero y parecía correcto; la
    pantalla de inicio creció —saludo, cuatro tarjetas con ayuda, consulta rápida y última
    consulta— y 183 pasó a ser una posición válida.

    Por `pathname` y no por la ubicación completa: cambiar un parámetro de búsqueda en la misma
    pantalla —un filtro, por ejemplo— no es llegar a otra parte y no debería mover la vista.

    No se pierde ninguna restauración: hoy no hay ninguna. React Router no la hace, así que esto no
    reemplaza a nada. El día que se quiera recordar la posición al volver atrás, el sitio de esa
    decisión es éste.
  */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

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
        El cromo de arriba, que se queda (05-10-2026).

        Antes la barra era fija sólo donde una pantalla pedía `stickyHeader` —dos de nueve—, así que
        al desplazar «Mis boletas» el logo, la municipalidad y el estado de conexión se iban de la
        pantalla. Eso es lo que reporta el PDF de barras fijas, y lo que pide es exactamente esto:
        que el header conserve «logo, municipalidad, estado En línea».

        `.lx-top-chrome` no es nuevo: es el mismo bloque que el Ciudadano usa desde el contrato
        v0.10 para agrupar su barra y el cronómetro de estadía. Acá envuelve una sola fila —desde el
        06-10-2026 el estado de conexión va DENTRO de la barra, no debajo— y sigue siendo el sitio
        correcto: es lo que hace fija la cabecera, y si mañana el fiscalizador gana una franja de
        verdad (una alerta de turno, digamos) va acá y se queda con ella.

        `sticky` y no `fixed`: el bloque conserva su lugar en el flujo, así que no hay que compensar
        su altura con relleno, no aparece una segunda barra de desplazamiento y el contenido no
        salta al activarse.
      */}
      <div className="lx-top-chrome">
        <AppBar
          className="lx-app-bar--inspector"
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
          /*
            El estado de conexión, a la derecha de la MISMA fila (06-10-2026).

            Del 05 al 06 de octubre esto fue una franja propia a todo el ancho
            —`.lx-inspector-status-bar`— colgada debajo de la barra dentro de este mismo
            `.lx-top-chrome`. Funcionaba y se quedaba fija, y era dos filas de cromo para una sola
            idea: el PDF del 06-10-2026 lo reporta como «duplicación visual» y pide un único «En
            línea» arriba a la derecha. La franja se borró del árbol; no está escondida con CSS.

            No se creó ningún indicador nuevo: es esta misma insignia, con el mismo `useIsOnline`,
            dentro del `.lx-app-bar__end` que ya existía y estaba vacío en este portal.
          */
          /*
            La campana, a la derecha del estado (06-10-2026).

            Va en `actions` y no en `end`, lo que la pone DESPUÉS de «En línea» — al revés del
            diagrama del PDF, y con motivo. `actions` es la maquinaria que ya existe para esto: dibuja
            `.lx-app-bar__icon-btn` con su objetivo táctil de 44px y `.lx-app-bar__badge` con el
            contador, que es exactamente lo que el encargo pide reutilizar en vez de crear. Y el orden
            que produce es el mejor de los dos: lo único pulsable de esa esquina queda en la esquina,
            donde llega el pulgar, y el estado —que no se pulsa— queda al lado. Es además cómo está el
            Ciudadano desde que tiene campana, y la consistencia entre portales pesa más que el orden
            de un dibujo.

            Sin contador cuando es cero: `badgeCount` no se dibuja con un valor falso, y `undefined`
            mientras la consulta viaja es lo correcto —decir «0 avisos» antes de preguntar sería la
            pantalla adivinando—.

            En TODAS las pantallas menos en la de avisos (corregido el 07-10-2026).

            Hasta ayer la condición era `!onBack`: la campana sólo en las pantallas raíz. El
            razonamiento era que una pantalla de detalle lleva flecha y título y no necesita más
            cromo. Está mal, y el PDF del 07-10 lo muestra con una captura: entrar a Ayuda hacía
            desaparecer la campana, y con ella el contador de avisos sin leer. Un indicador que se
            esconde al navegar no es un indicador — su trabajo es estar cuando uno NO lo está
            buscando. La campana es parte del header global, igual que «En línea».

            La única excepción que sobrevive es la propia pantalla de avisos: ahí la campana sería
            un botón que lleva a donde ya estás, y ésa sigue siendo la razón de siempre para no
            dibujar un control muerto. Se decide por la ruta y no por `onBack`, porque `onBack` dice
            «esta pantalla tiene vuelta atrás», que es otra pregunta.
          */
          actions={
            // Ver la nota de arriba: la campana se queda en TODAS menos en los avisos.
            enAvisos
              ? []
              : [
                  {
                    icon: <IconBell />,
                    label: t('inspector.notifications.open'),
                    onClick: () => navigate('/notifications'),
                    badgeCount: avisos > 0 ? avisos : undefined,
                  },
                ]
          }
          end={
            /*
              El estado de conexión, resuelto en dos sitios y no en uno (08-10-2026).

              Hubo un choque real entre dos encargos. El del 06-10 pidió «En línea» arriba a la
              derecha y se hizo; la referencia visual del 07-10 lo dibuja junto al saludo, en la
              pantalla de inicio. Los dos tienen razón en algo distinto, y por eso no se elige: se
              parte por lo que cada caso necesita.

              Cuando hay señal, «En línea» es una confirmación. Vive junto al saludo, que es donde
              la referencia la pone y donde se lee al entrar; si se va al desplazarse no se pierde
              nada, porque no había nada que decidir.

              Cuando NO hay señal, es una advertencia, y cambia de naturaleza: un fiscalizador que
              no sabe que está sin señal da por presentada una boleta que todavía está en el
              teléfono. Esa advertencia tiene que estar en todas las pantallas y no puede
              desplazarse fuera de la vista, así que aparece acá, en la barra fija.

              Y nunca las dos a la vez: sin señal, la pantalla de inicio no dibuja su ficha. Un solo
              indicador en pantalla, que es lo que el encargo del 06-10 pedía al quitar la franja
              duplicada.
            */
            !online ? (
              <Badge
                /* El mismo gancho estable para medir desde fuera: buscarla por su texto obligaría
                   a las pruebas a conocer las traducciones. */
                className="lx-connection-badge lx-connection-badge--compact"
                tone="warning"
              >
                {t('inspector.offline.badge')}
              </Badge>
            ) : undefined
                    }
        />
      </div>
      {/*
        El área que se desplaza (07-10-2026).

        Deja de llevar sus medidas en `style` y pasa a `.lx-inspector-main`, por un motivo concreto
        y no por limpieza: la especificación responsive pide 16px de margen lateral en celular y
        24-32px en tablet, con el ancho útil subiendo a ~720px. Eso son consultas de medio, y un
        objeto `style` en línea no puede tenerlas. Lo único que sigue viajando desde aquí es el
        relleno inferior, porque depende de la altura MEDIDA de la barra y ningún CSS puede saberla.
      */}
      <main className="lx-inspector-main" style={{ paddingBottom: `calc(var(--lx-space-4) + ${footerHeight}px)` }}>
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
