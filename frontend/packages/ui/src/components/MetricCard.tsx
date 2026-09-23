import * as React from 'react';
import { Card } from './Card';

export type MetricTone = 'primary' | 'success' | 'warning' | 'info';
export type MetricTrend = 'up' | 'down' | 'flat';

export interface MetricCardProps {
  /** El icono de la métrica, dentro de su propio bloque de color. */
  icon: React.ReactNode;
  /** El acento del bloque del icono. Distingue una métrica de otra, no comunica un estado. */
  tone?: MetricTone;
  label: string;
  /** El número. Grande, tabular y sin adornos. */
  value: React.ReactNode;
  /**
   * El microindicador: la variación contra el período anterior.
   *
   * <p>Se omite cuando no hay comparación REAL. Un «+12%» decorativo en un tablero municipal es
   * una cifra que alguien va a repetir en una reunión.</p>
   */
  delta?: string;
  /** Hacia dónde se movió. Decide el color Y la flecha, para no informar sólo por color. */
  trend?: MetricTrend;
  /** Una línea de contexto cuando no hay variación que mostrar. */
  hint?: string;
  /** Adónde lleva la tarjeta. Sin esto es una cifra que no se puede comprobar. */
  onOpen?: () => void;
  openLabel?: string;
}

/**
 * Una métrica, con su icono, su número y —sólo si es real— cuánto cambió.
 *
 * <p>Sustituye a un `StatCard` sin icono en la fila superior del Inicio y del Panel. La diferencia
 * no es decorativa: cuatro tarjetas de texto plano se leen como una lista y obligan a leer la
 * etiqueta de cada una para saber cuál es cuál; con un icono y un acento propio, cada una se
 * reconoce antes de leerla.</p>
 *
 * <p>La tarjeta entera es el botón cuando hay a dónde ir, y no sólo el número: un blanco de 44px es
 * el que no obliga a apuntar.</p>
 */
export function MetricCard({
  icon,
  tone = 'primary',
  label,
  value,
  delta,
  trend = 'flat',
  hint,
  onOpen,
  openLabel,
}: MetricCardProps): React.JSX.Element {
  const cuerpo = (
    <>
      <span className={`lx-metric__icon lx-metric__icon--${tone}`} aria-hidden="true">
        {icon}
      </span>
      <span className="lx-metric__label">{label}</span>
      <span className="lx-metric__value">{value}</span>
      {delta ? (
        <span className={`lx-metric__delta lx-metric__delta--${trend}`}>
          {/* La flecha acompaña al signo: quien no distingue el verde del rojo lee la dirección
              igual, y quien mira la pantalla al sol también. */}
          <span aria-hidden="true">{trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}</span> {delta}
        </span>
      ) : hint ? (
        <span className="lx-metric__hint">{hint}</span>
      ) : null}
    </>
  );

  return (
    <Card className="lx-metric">
      {onOpen ? (
        <button type="button" className="lx-metric__hit" onClick={onOpen} aria-label={openLabel ?? label}>
          {cuerpo}
        </button>
      ) : (
        <div className="lx-metric__hit lx-metric__hit--static">{cuerpo}</div>
      )}
    </Card>
  );
}
