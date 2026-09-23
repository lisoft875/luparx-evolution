import * as React from 'react';
import { useCallback, useRef } from 'react';

/**
 * Dónde había dejado la persona el menú lateral.
 *
 * <h2>Por qué hace falta recordarlo</h2>
 *
 * <p>Reportado el 23-09-2026: bajando en el menú para llegar a Reclamos o a Exoneraciones, el menú
 * se va solo hasta arriba y hay que volver a buscar. La causa no es un efecto ni un
 * {@code scrollIntoView} —no existe ninguno en todo el frontend— sino la forma del árbol: las 23
 * pantallas del portal de administración montan CADA UNA su propio {@code AdminShell}, así que
 * navegar de Zonas a Tarifas desmonta un {@code <nav>} y monta otro. No se pierde la posición del
 * menú: se estrena un elemento distinto, y un elemento recién nacido tiene {@code scrollTop = 0}.</p>
 *
 * <h2>Por qué se arregla así y no moviendo las rutas</h2>
 *
 * <p>La cura «correcta» sería una ruta de layout con {@code <Outlet/>}, para que el shell viviera
 * una sola vez por encima de las pantallas. Eso toca las 23 páginas y el archivo de rutas de los
 * cuatro portales para arreglar un salto de scroll, y la especificación pide explícitamente la
 * corrección más pequeña y estable posible. Recordar un número y volver a ponerlo es eso.</p>
 *
 * <p>Vive en el módulo y no en un estado de React a propósito: tiene que sobrevivir precisamente al
 * desmontaje que causa el problema. Se pierde al recargar la página, que es lo correcto — una
 * recarga es un empezar de nuevo, y restaurar un scroll de la sesión anterior sorprendería.</p>
 */
let scrollDelMenu = 0;

export interface PageLayoutProps {
  header?: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
}

/** Generic app shell: optional top header, optional side navigation, and a main content region with a skip-link target. */
export function PageLayout({ header, sidebar, children }: PageLayoutProps): React.JSX.Element {
  const menu = useRef<HTMLElement | null>(null);

  /**
   * Devolver el menú a donde estaba, antes de que se pinte.
   *
   * <p>En el callback de la `ref` y no en un `useEffect`: acá los hijos ya están en el DOM —el alto
   * real se conoce, así que `scrollTop` no se recorta a cero— y todavía no hubo pintado, así que no
   * se ve el salto y la corrección del salto.</p>
   */
  const montarMenu = useCallback((node: HTMLElement | null) => {
    menu.current = node;
    if (node && scrollDelMenu > 0) {
      node.scrollTop = scrollDelMenu;
    }
  }, []);

  return (
    <div className="lx-page-layout">
      {header ? <header className="lx-page-layout__header">{header}</header> : null}
      <div className="lx-page-layout__body">
        {sidebar ? (
          <nav
            className="lx-page-layout__sidebar"
            aria-label="primary"
            ref={montarMenu}
            onScroll={(event) => {
              scrollDelMenu = event.currentTarget.scrollTop;
            }}
          >
            {sidebar}
          </nav>
        ) : null}
        <main id="main-content" className="lx-page-layout__content">
          {children}
        </main>
      </div>
    </div>
  );
}

export interface CenteredLayoutProps {
  children: React.ReactNode;
}

/** Centered single-column shell for auth screens (login/register/forgot password) — deliberately screen-specific, no shared nav. */
export function CenteredLayout({ children }: CenteredLayoutProps): React.JSX.Element {
  return (
    <div className="lx-centered-layout">
      <div className="lx-centered-layout__card">{children}</div>
    </div>
  );
}
