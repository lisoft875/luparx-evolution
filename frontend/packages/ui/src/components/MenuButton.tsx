import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';

export interface MenuButtonItem {
  label: string;
  onSelect: () => void;
  /** `danger` para una acción destructiva. Cerrar sesión NO lo es: se vuelve a entrar. */
  tone?: 'default' | 'danger';
  icon?: React.ReactNode;
}

export interface MenuButtonProps {
  /** El nombre accesible del botón: lo que dice un lector de pantalla al llegar. */
  label: string;
  /** Lo que el botón muestra: un avatar, un nombre, un rol. */
  children: React.ReactNode;
  items: MenuButtonItem[];
  /** De qué lado se alinea el panel. `end` para un menú pegado al borde derecho de una cabecera. */
  align?: 'start' | 'end';
  className?: string;
}

/**
 * Un botón que abre un panel de acciones.
 *
 * <h2>Por qué existe este componente y no se reutilizó otro</h2>
 *
 * <p>Se buscó primero, que es la regla. `Modal` abre una capa a pantalla completa con fondo
 * oscurecido: correcto para una decisión, desproporcionado para «Perfil / Cerrar sesión». `Select`
 * tiene un panel parecido pero es un `combobox`: su semántica dice «elegí un valor de esta lista» y
 * un lector de pantalla anuncia una opción seleccionada que acá no existe. `ListRow` es una fila de
 * contenido, no un control. No había nada que abra un menú de acciones, así que esto es nuevo —y la
 * v1.1 §7.4 pide exactamente esto: componentes reutilizables, no CSS puntual por pantalla.</p>
 *
 * <h2>Lo que el panel hace y no se ve</h2>
 *
 * <p>Se cierra con Escape y pulsando fuera, y al cerrarse devuelve el foco al botón: sin eso, quien
 * navega con el teclado queda con el foco en un elemento que acaba de desaparecer y el navegador lo
 * manda al principio del documento. `pointerdown` y no `click` para el cierre de afuera, porque un
 * `click` en otro botón de la cabecera llegaría DESPUÉS de que ese botón hiciera lo suyo.</p>
 */
export function MenuButton({
  label,
  children,
  items,
  align = 'end',
  className,
}: MenuButtonProps): React.JSX.Element {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (evento: PointerEvent) => {
      if (!caja.current?.contains(evento.target as Node)) setAbierto(false);
    };
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  return (
    <div className={['lx-menu', className].filter(Boolean).join(' ')} ref={caja}>
      <button
        ref={boton}
        type="button"
        className="lx-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? panelId : undefined}
        aria-label={label}
        onClick={() => setAbierto((previo) => !previo)}
      >
        {children}
        <span className={`lx-menu__caret${abierto ? ' lx-menu__caret--open' : ''}`} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" focusable="false">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {abierto ? (
        <div className={`lx-menu__panel lx-menu__panel--${align}`} id={panelId} role="menu">
          {items.map((item, indice) => (
            <button
              key={indice}
              type="button"
              role="menuitem"
              className={`lx-menu__item${item.tone === 'danger' ? ' lx-menu__item--danger' : ''}`}
              onClick={() => {
                setAbierto(false);
                item.onSelect();
              }}
            >
              {item.icon ? (
                <span className="lx-menu__item-icon" aria-hidden="true">
                  {item.icon}
                </span>
              ) : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
