import * as React from 'react';

export interface AppBarAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badgeCount?: number;
}

export interface AppBarProps {
  /** Left-side content when there's no back navigation — typically <Brand>. */
  start?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: AppBarAction[];
  /**
   * Contenido libre a la derecha de la barra, antes de los botones de icono.
   *
   * <p>Para lo que NO es un botón: la insignia de conexión del fiscalizador, por ejemplo. Existe
   * porque `actions` sólo sabe dibujar `<button>` con un icono dentro, y meter ahí una insignia
   * obligaba a inventarse un botón que no hace nada. El contenedor `.lx-app-bar__end` ya estaba;
   * esto es la forma de llenarlo sin disfrazar una etiqueta de control.</p>
   */
  end?: React.ReactNode;
  className?: string;
}

/*
 * Hubo una prop `sticky` acá, del 26-09-2026 al 05-10-2026, que hacía fija esta barra sola y por
 * pantalla. Se fue cuando el fiscalizador adoptó `.lx-top-chrome` —el bloque que el ciudadano ya
 * usaba— porque dejaba DOS formas de resolver lo mismo, y la cabecera del fiscalizador son dos
 * filas: la barra y la insignia de conexión. Fija la barra sola, la insignia se iba igual.
 * Para dejar cromo fijo arriba, envolverlo en `.lx-top-chrome`.
 */

/** Top bar: brand (home) or back+title (detail), plus icon actions with badge counts (DESIGN_SYSTEM.md §3). */
export function AppBar({
  start,
  onBack,
  backLabel,
  title,
  subtitle,
  actions = [],
  end,
  className,
}: AppBarProps): React.JSX.Element {
  return (
    <header className={['lx-app-bar', className].filter(Boolean).join(' ')}>
      <div className="lx-app-bar__start">
        {onBack ? (
          <button type="button" className="lx-app-bar__back" onClick={onBack} aria-label={backLabel ?? 'Back'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          start ?? null
        )}
        {title ? (
          <span className="lx-app-bar__title-group">
            <span className="lx-app-bar__title">{title}</span>
            {subtitle ? <span className="lx-app-bar__subtitle">{subtitle}</span> : null}
          </span>
        ) : null}
      </div>
      <div className="lx-app-bar__end">
        {end}
        {actions.map((action, index) => (
          <button
            key={index}
            type="button"
            className="lx-app-bar__icon-btn"
            onClick={action.onClick}
            aria-label={action.label}
          >
            {action.icon}
            {action.badgeCount ? (
              <span className="lx-app-bar__badge">{action.badgeCount > 99 ? '99+' : action.badgeCount}</span>
            ) : null}
          </button>
        ))}
      </div>
    </header>
  );
}
