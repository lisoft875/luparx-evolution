import * as React from 'react';

/**
 * `neutral`/`success`/`warning`/`danger`/`info` dicen cómo va algo. `violet`/`amber`/`teal` dicen
 * de qué TIPO es algo — son categorías, no estados, y por eso no se mezclan con los anteriores:
 * pintar un cambio de tarifa con `warning` haría que cada precio nuevo pareciera una advertencia.
 */
export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'violet'
  | 'amber'
  | 'teal';

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  /**
   * Un punto del color del tono, antes del texto.
   *
   * <p>Para una columna de estados en una tabla, donde un icono por fila es demasiado dibujo y el
   * texto solo no se distingue de los datos de al lado. El punto es decoración —`aria-hidden`—
   * porque la palabra ya dice el estado: el color nunca viaja solo.</p>
   */
  dot?: boolean;
  className?: string;
}

/** Status pill (DESIGN_SYSTEM.md §3 "Verificado" badges). Tone is always paired with text, never color-only. */
export function Badge({ tone = 'neutral', children, icon, dot, className }: BadgeProps): React.JSX.Element {
  return (
    <span className={['lx-badge', `lx-badge--${tone}`, className].filter(Boolean).join(' ')}>
      {dot ? <span className="lx-badge__dot" aria-hidden="true" /> : null}
      {icon}
      {children}
    </span>
  );
}
