import * as React from 'react';

/**
 * `warning` is not a weaker `danger`: it marks a state the reader still controls — a rule they have
 * not satisfied yet, evidence the client had to shrink — where `danger` marks something that
 * already failed. Announced politely (role="status") for the same reason.
 */
export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  tone?: AlertTone;
  children: React.ReactNode;
  /**
   * Un gancho estable para medir esta alerta desde fuera. Se dibuja como `data-testid`.
   *
   * <h2>Por qué es una prop y no se escribe `data-testid` al usar el componente</h2>
   *
   * <p>Porque eso ya se intentó y se perdió en silencio. El 06-10-2026 la pantalla de conciliación
   * escribía `<Alert data-testid="billing-state">`: este componente no reenvía props sueltas, así
   * que el atributo nunca llegó al DOM y el arnés informó «la pantalla no anuncia el estado de la
   * conciliación» cuando la anunciaba perfectamente.</p>
   *
   * <p>Lo que lo hizo invisible es el GUIÓN. TypeScript no comprueba los atributos JSX cuyo nombre
   * no es un identificador válido, así que `data-testid` pasó el `tsc` sin una palabra. `testId`,
   * en camelCase, es un error de compilación si no existe — que es exactamente la diferencia entre
   * un gancho y una esperanza.</p>
   */
  testId?: string;
}

/** Uses role="status" for info/success (polite) and role="alert" for danger (assertive), so screen readers announce it appropriately. */
export function Alert({ tone = 'info', children, testId }: AlertProps): React.JSX.Element {
  const classes = `lx-alert lx-alert--${tone}`;
  return (
    <div className={classes} role={tone === 'danger' ? 'alert' : 'status'} data-testid={testId}>
      {children}
    </div>
  );
}
