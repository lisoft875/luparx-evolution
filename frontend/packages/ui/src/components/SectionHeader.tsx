import * as React from 'react';

export interface SectionHeaderProps {
  title: React.ReactNode;
  /** One line explaining what the section is for — settings screens need it, list headers do not. */
  description?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  /**
   * Lo que va a la derecha del título cuando no es un botón: un enlace, un rótulo, una cifra.
   *
   * <p>Existe porque `action` es un `<button>` y hay casos donde lo correcto es un `<a>` de
   * verdad —«Ver toda la actividad» lleva a una ruta, y un botón que navega no se puede abrir en
   * otra pestaña ni copiar—. Además recupera el renglón del título, que suele estar vacío a la
   * derecha, para algo que si no ocuparía una línea propia debajo de la tarjeta.</p>
   */
  aside?: React.ReactNode;
  className?: string;
}

/** Section title with an optional trailing "Ver todos"-style link (DESIGN_SYSTEM.md §3), used above a card list. */
export function SectionHeader({ title, description, action, aside, className }: SectionHeaderProps): React.JSX.Element {
  return (
    <div className={['lx-section-header', className].filter(Boolean).join(' ')}>
      <div>
        <p className="lx-section-header__title">{title}</p>
        {description ? <p className="lx-text-meta lx-section-header__description">{description}</p> : null}
      </div>
      {action ? (
        <button type="button" className="lx-link-button" onClick={action.onClick}>
          {action.label}
        </button>
      ) : aside ? (
        <span className="lx-section-header__aside">{aside}</span>
      ) : null}
    </div>
  );
}
