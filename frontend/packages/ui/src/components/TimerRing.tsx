import * as React from 'react';

/**
 * El contador de la estadía, dentro de un anillo de progreso.
 *
 * <h2>De dónde sale</h2>
 *
 * <p>El segundo boceto aprobado (22-10-2026) pone en la tarjeta de estacionamiento activo el
 * vehículo a la izquierda y un contador circular amarillo a la derecha. Esto es ese contador.</p>
 *
 * <h2>Qué conserva del contador de siempre</h2>
 *
 * <p>Todo: el mismo formato `MM:SS` —y `HH:MM:SS` pasada la hora—, el mismo truncado hacia abajo
 * (un contador que marca 45:00 con 44:59,6 restantes regala un minuto que la persona no tiene), la
 * misma palabra «Expirado» en vez de un `00:00` indistinguible, el mismo umbral de advertencia y
 * el mismo `role="timer"`. Es el {@link Timer} de siempre con un anillo alrededor, no un contador
 * nuevo con reglas propias.</p>
 *
 * <h2>Amarillo, pero no siempre</h2>
 *
 * <p>El boceto muestra el estado normal, y en el estado normal el anillo es ámbar. Pero el color
 * sigue al estado: ámbar mientras queda tiempo, el tono de advertencia bajo el umbral y el de
 * peligro una vez vencida. Dejarlo amarillo fijo borraría la señal de urgencia, que es justo lo
 * que el P0 del 19-10-2026 costó arreglar —el Inicio llegó a decir «activo» con la estadía
 * vencida—. El boceto pide una forma; la urgencia es una regla, y la regla manda.</p>
 *
 * <h2>Por qué el anillo no es información</h2>
 *
 * <p>El arco es `aria-hidden`: lo que un lector de pantalla necesita es el tiempo, y eso lo dice
 * el texto del centro con su `role="timer"`. Un «68 por ciento» no le sirve a nadie.</p>
 *
 * <p>Y el arco sólo se dibuja si quien llama pasa {@link totalSeconds}: sin saber cuánto duraba la
 * estadía no hay fracción que mostrar, y pintar un anillo lleno «porque sí» sería inventarse un
 * dato. En ese caso queda el contador dentro de un aro liso.</p>
 */
export interface TimerRingProps {
  /** Segundos restantes. El formato se decide acá dentro, nunca en quien llama. */
  remainingSeconds: number;
  /**
   * Duración total de la estadía, en segundos, para la fracción del arco. Sin esto no se dibuja
   * progreso: no se adivina.
   */
  totalSeconds?: number;
  /** Bajo este valor el contador pasa al tono de advertencia. */
  warningThresholdSeconds?: number;
  /** «Expirado». Sin esto se mantiene el número, para no cambiar en silencio lo que ve quien llama. */
  expiredLabel?: string;
  /** Rótulo bajo el número: «tiempo restante». Se omite con la estadía vencida. */
  caption?: string;
  /** Diámetro en píxeles. */
  size?: number;
  className?: string;
  'aria-label'?: string;
}

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function TimerRing({
  remainingSeconds,
  totalSeconds,
  warningThresholdSeconds = 600,
  expiredLabel,
  caption,
  size = 132,
  className,
  ...aria
}: TimerRingProps): React.JSX.Element {
  // Vencido gana sobre advertencia: son estados distintos y el de advertencia ya pasó.
  const vencida = remainingSeconds <= 0;
  const advertencia = !vencida && remainingSeconds <= warningThresholdSeconds;
  const color = vencida
    ? 'var(--lx-danger)'
    : advertencia
      ? 'var(--lx-warning)'
      : 'var(--lx-accent-amber)';

  /*
    La fracción se acota a [0, 1] a propósito. Un servidor que devuelva un vencimiento más lejano
    que la duración declarada —o una extensión aplicada después— daría más de 1, y un arco que da
    más de una vuelta se lee como menos tiempo del que queda.
  */
  const fraccion = totalSeconds && totalSeconds > 0
    ? Math.min(1, Math.max(0, remainingSeconds / totalSeconds))
    : null;

  const grosor = Math.max(6, Math.round(size * 0.065));
  const radio = (size - grosor) / 2;
  const vuelta = 2 * Math.PI * radio;

  return (
    <div
      className={['lx-timer-ring', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      <svg
        className="lx-timer-ring__arco"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radio}
          fill="none"
          stroke="var(--lx-border)"
          strokeWidth={grosor}
        />
        {fraccion === null ? null : (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radio}
            fill="none"
            stroke={color}
            strokeWidth={grosor}
            strokeLinecap="round"
            strokeDasharray={vuelta}
            strokeDashoffset={vuelta * (1 - fraccion)}
            /* Desde arriba y en el sentido del reloj, como cualquier reloj. */
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="lx-timer-ring__centro">
        <span
          className={[
            'lx-timer',
            'lx-timer--anillo',
            vencida ? 'lx-timer--expired' : '',
            advertencia ? 'lx-timer--warning' : '',
          ].filter(Boolean).join(' ')}
          role="timer"
          aria-label={aria['aria-label']}
        >
          {vencida && expiredLabel ? expiredLabel : formatDuration(remainingSeconds)}
        </span>
        {caption ? <span className="lx-text-meta lx-timer-ring__rotulo">{caption}</span> : null}
      </div>
    </div>
  );
}
