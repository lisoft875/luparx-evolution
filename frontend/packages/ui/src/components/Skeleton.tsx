import * as React from 'react';

export interface SkeletonProps {
  /** Alto de la pieza. Un número se lee como píxeles. */
  height?: number | string;
  /** Ancho. Por omisión ocupa todo el disponible. */
  width?: number | string;
  /** `pill` para una línea de texto, `block` para una tarjeta o un gráfico. */
  shape?: 'pill' | 'block';
  className?: string;
}

/**
 * El hueco que ocupa un dato mientras viene.
 *
 * <p>Existe porque «Cargando…» es peor que nada en una pantalla de varios bloques: no dice cuánto
 * va a ocupar lo que viene, así que todo salta de sitio cuando llega, y repetido en ocho tarjetas
 * convierte la carga en una lista de la misma palabra. Un bloque del tamaño del dato reserva su
 * lugar y la pantalla no se reacomoda a la vista de nadie.</p>
 *
 * <p>`aria-hidden` y sin texto: para un lector de pantalla esto no existe. Quien anuncia que se
 * está cargando es la región que lo contiene, con `aria-busy`, una vez — no doce cajas grises
 * contándolo cada una por su cuenta.</p>
 */
export function Skeleton({
  height = '1rem',
  width = '100%',
  shape = 'pill',
  className,
}: SkeletonProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={
        className ? `lx-skeleton lx-skeleton--${shape} ${className}` : `lx-skeleton lx-skeleton--${shape}`
      }
      style={{ height, width }}
    />
  );
}
