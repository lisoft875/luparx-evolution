import * as React from 'react';

export interface OccupancyDonutProps {
  /** El porcentaje medido, 0-100. `null` cuando no hay nada contra qué medirlo. */
  percent: number | null;
  /** Lo que el número ES: «Ocupación total». Va debajo de la cifra, dentro del anillo. */
  caption: string;
  /** Qué decir cuando no hay porcentaje. Se dibuja el anillo vacío, no se esconde el bloque. */
  emptyLabel: string;
  /** El nombre accesible del gráfico. Obligatorio: un `<svg>` sin nombre es una imagen muda. */
  title: string;
  /** El diámetro exterior en píxeles. */
  size?: number;
  className?: string;
}

/**
 * El anillo de ocupación: un porcentaje, dibujado.
 *
 * <h2>Por qué un componente y no un `<div>` con bordes</h2>
 *
 * <p>La referencia visual aprobada del Inicio pide un dónut grande con el porcentaje al centro, y en
 * el sistema no había ninguno: estaban `BarChart` (series por día) y las barras finas de
 * `.lx-zone-row` (una proporción por fila), y ninguna de las dos dibuja «una sola magnitud sobre su
 * total». Se audita antes de crear, y esta vez no había qué reutilizar.</p>
 *
 * <h2>Las decisiones que no son de estilo</h2>
 *
 * <p><b>Un solo valor, no una tarta por zonas.</b> La referencia lo muestra así y es lo correcto: la
 * pregunta del bloque es «¿cuán llena está la municipalidad?», una magnitud. El reparto por zona ya
 * se cuenta al lado, en filas con su nombre y su cifra — que es donde se puede leer, y no en cinco
 * porciones de colores que obligan a cruzar leyenda y dibujo.</p>
 *
 * <p><b>SVG con `stroke-dasharray`, no un gradiente cónico.</b> `conic-gradient` lo haría en dos
 * líneas de CSS y no deja nada que un lector de pantalla pueda nombrar ni que una prueba pueda
 * medir; el arco es un elemento con su longitud, y eso se puede comprobar.</p>
 *
 * <p><b>El número va en el DOM como texto, no pintado dentro del SVG.</b> Se puede seleccionar,
 * copiar, traducir y crecer con el zoom del navegador. Un `<text>` dentro del `<svg>` escala con el
 * dibujo y a 200% de zoom se sale del anillo.</p>
 *
 * <p><b>Sin color de severidad.</b> El acento es siempre el azul del sistema. Que una ocupación del
 * 90% sea buena o mala depende de la política de la municipalidad, y este anillo no la sabe; la
 * severidad vive en las filas por zona, que son las que se accionan.</p>
 */
export function OccupancyDonut({
  percent,
  caption,
  emptyLabel,
  title,
  size = 168,
  className,
}: OccupancyDonutProps): React.JSX.Element {
  // El trazo es proporcional al diámetro para que el anillo se vea igual a cualquier tamaño.
  const grosor = Math.round(size * 0.1);
  const radio = (size - grosor) / 2;
  const vuelta = 2 * Math.PI * radio;
  const acotado = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const arco = (vuelta * acotado) / 100;

  return (
    <div className={['lx-donut', className].filter(Boolean).join(' ')} style={{ width: size }}>
      <svg
        className="lx-donut__ring"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={percent == null ? `${title}: ${emptyLabel}` : `${title}: ${acotado}%`}
      >
        {/* La pista: el total. Siempre entera, también cuando el valor es cero — es lo que dice
            que el cero es un cero medido y no un dibujo que no llegó. */}
        <circle
          className="lx-donut__track"
          cx={size / 2}
          cy={size / 2}
          r={radio}
          fill="none"
          strokeWidth={grosor}
        />
        {percent == null ? null : (
          <circle
            className="lx-donut__value"
            cx={size / 2}
            cy={size / 2}
            r={radio}
            fill="none"
            strokeWidth={grosor}
            strokeLinecap="round"
            strokeDasharray={`${arco} ${vuelta - arco}`}
            // Para que el arco empiece arriba y crezca con el reloj: sin esto arranca a las tres.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <span className="lx-donut__center">
        {percent == null ? (
          <span className="lx-donut__empty">{emptyLabel}</span>
        ) : (
          <>
            <span className="lx-donut__number">{acotado}%</span>
            <span className="lx-donut__caption">{caption}</span>
          </>
        )}
      </span>
    </div>
  );
}
