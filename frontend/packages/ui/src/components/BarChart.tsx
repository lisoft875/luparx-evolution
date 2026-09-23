import * as React from 'react';
import { useId, useState } from 'react';

/** Una barra: un día, un sector, lo que sea que se esté contando. */
export interface BarChartDatum {
  /** Clave estable. No se muestra. */
  key: string;
  /** Lo que va debajo de la barra. Corto: «17 sep». */
  label: string;
  /** El valor, para la altura. Cero es un valor, no un hueco. */
  value: number;
  /** El valor ya formateado —con moneda, con separadores— para el rótulo y la tabla. */
  valueLabel: string;
  /** Lo que lee un lector de pantalla en el botón. Si falta, se arma con label y valueLabel. */
  ariaLabel?: string;
}

export interface BarChartProps {
  /** Qué se está graficando. Va al `aria-label` y al encabezado de la tabla. */
  title: string;
  data: readonly BarChartDatum[];
  /** Las tres marcas del eje, ya formateadas. Si falta, el eje no se dibuja. */
  formatAxis?: (value: number) => string;
  emptyLabel: string;
  loading?: boolean;
  loadingLabel?: string;
  /** Encabezados de la tabla que acompaña al gráfico. */
  tableHeaders: { label: string; value: string };
  className?: string;
}

/** Cuántas líneas de referencia. Tres: piso, mitad y techo. Más es reja. */
const MARCAS = 3;

/**
 * Barras verticales, sin librería.
 *
 * <h2>Por qué HTML y no SVG</h2>
 *
 * <p>Un SVG con `viewBox` escala el texto junto con el dibujo: en un teléfono las fechas del eje
 * quedan de cuatro píxeles. Con cajas normales el texto es texto —se lee igual en cualquier ancho,
 * lo agranda quien tiene la letra grande del sistema, y el foco del teclado funciona solo—.</p>
 *
 * <h2>Un solo color</h2>
 *
 * <p>Todas las barras van del mismo color a propósito. Pintar la más alta más oscura codifica dos
 * veces lo mismo —la altura YA dice cuál es la más alta— y gasta el color, que es lo único que
 * quedaría para distinguir una segunda serie. El acento se reserva para la barra seleccionada, que
 * es información distinta: dónde está parada la persona.</p>
 *
 * <h2>El número exacto, sin depender del mouse</h2>
 *
 * <p>Cada barra es un botón: se puede tabular, se puede tocar en un teléfono y se anuncia con su
 * valor. Un tooltip que sólo aparece al pasar el mouse deja afuera a todo el que no tiene mouse.
 * Y debajo va la misma serie como tabla, oculta a la vista pero no al lector de pantalla: un
 * gráfico que no se puede leer de otra forma es un gráfico que excluye.</p>
 */
export function BarChart({
  title,
  data,
  formatAxis,
  emptyLabel,
  loading = false,
  loadingLabel,
  tableHeaders,
  className,
}: BarChartProps): React.JSX.Element {
  const tablaId = useId();
  // Arranca en la última: es la más reciente y la que alguien viene a mirar.
  const [seleccion, setSeleccion] = useState<string | null>(null);

  if (loading) {
    return <p className="lx-text-meta">{loadingLabel ?? ''}</p>;
  }
  if (data.length === 0) {
    return <p className="lx-text-meta">{emptyLabel}</p>;
  }

  const maximo = Math.max(...data.map((d) => d.value), 0);
  const activa = seleccion ?? data[data.length - 1]?.key ?? null;
  const destacada = data.find((d) => d.key === activa) ?? null;

  return (
    <div className={className ? `lx-bars ${className}` : 'lx-bars'}>
      {/* El valor de la barra en foco, arriba y siempre en el mismo lugar: un rótulo que salta de
          posición según la barra obliga a buscarlo cada vez. */}
      <p className="lx-bars__callout">
        {destacada ? (
          <>
            <span className="lx-bars__callout-label">{destacada.label}</span>
            <strong className="lx-bars__callout-value">{destacada.valueLabel}</strong>
          </>
        ) : null}
      </p>

      <div className="lx-bars__plot">
        {formatAxis ? (
          <div className="lx-bars__axis" aria-hidden="true">
            {Array.from({ length: MARCAS }, (_, i) => {
              // De arriba hacia abajo: techo, mitad, piso.
              const fraccion = (MARCAS - 1 - i) / (MARCAS - 1);
              return (
                <span key={i} className="lx-bars__axis-tick">
                  {formatAxis(maximo * fraccion)}
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="lx-bars__track" role="img" aria-label={title} aria-describedby={tablaId}>
          {/* Las líneas de referencia van detrás y en gris: son andamio, no dato. */}
          <div className="lx-bars__grid" aria-hidden="true">
            {Array.from({ length: MARCAS }, (_, i) => (
              <span key={i} className="lx-bars__grid-line" />
            ))}
          </div>
          {data.map((punto) => {
            // Con todo en cero no hay proporción que calcular; queda el tope mínimo, que deja ver
            // que el día existe y no recaudó nada.
            const alto = maximo > 0 ? (punto.value / maximo) * 100 : 0;
            const seleccionada = punto.key === activa;
            return (
              <button
                key={punto.key}
                type="button"
                className={
                  seleccionada ? 'lx-bars__col lx-bars__col--on' : 'lx-bars__col'
                }
                aria-pressed={seleccionada}
                aria-label={punto.ariaLabel ?? `${punto.label}: ${punto.valueLabel}`}
                onClick={() => setSeleccion(punto.key)}
                onMouseEnter={() => setSeleccion(punto.key)}
                onFocus={() => setSeleccion(punto.key)}
              >
                <span className="lx-bars__bar" style={{ height: `${alto}%` }} />
                <span className="lx-bars__col-label">{punto.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* La misma serie, en texto. Oculta a la vista, disponible para quien no ve el dibujo. */}
      <table id={tablaId} className="lx-visually-hidden">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{tableHeaders.label}</th>
            <th scope="col">{tableHeaders.value}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((punto) => (
            <tr key={punto.key}>
              <th scope="row">{punto.label}</th>
              <td>{punto.valueLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
