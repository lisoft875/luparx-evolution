import * as React from 'react';

export interface TimerProps {
  /** Remaining seconds. Formatting (MM:SS, or HH:MM:SS past an hour) always happens here — never build the string at the call site. */
  remainingSeconds: number;
  /** Below this many seconds remaining, the timer switches to the warning tone (DESIGN_SYSTEM.md §3, default 10 min). */
  warningThresholdSeconds?: number;
  /**
   * Texto para cuando ya no queda tiempo — «Expirado», normalmente.
   *
   * Sin esto el contador se quedaba en `00:00` con el mismo aspecto que uno corriendo, y «00:00»
   * no dice si la estadía venció o si está por vencer: el número es el mismo en los dos casos y
   * el color tampoco cambia. Quien pasara de los 10 minutos de advertencia a cero no tenía forma
   * de saber que ya debía plata.
   */
  expiredLabel?: string;
  className?: string;
  'aria-label'?: string;
}

function formatDuration(totalSeconds: number): string {
  // Down, never to nearest: a countdown that reads 45:00 with 44:59.6 left is a minute the citizen
  // does not have. Callers already pass whole seconds; this is the guard for the ones that don't.
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** Large tabular-nums countdown for an active parking session (DESIGN_SYSTEM.md §2 "Temporizador"). */
export function Timer({
  remainingSeconds,
  warningThresholdSeconds = 600,
  expiredLabel,
  className,
  ...aria
}: TimerProps): React.JSX.Element {
  // Vencido gana sobre advertencia: son estados distintos y el de advertencia ya pasó.
  const isExpired = remainingSeconds <= 0;
  const isWarning = !isExpired && remainingSeconds <= warningThresholdSeconds;
  const classes = [
    'lx-timer',
    isExpired ? 'lx-timer--expired' : '',
    isWarning ? 'lx-timer--warning' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} role="timer" aria-label={aria['aria-label']}>
      {/* Palabra y no «00:00»: sin `expiredLabel` se mantiene el número, para no cambiar en silencio
          lo que ve quien llama sin pasarlo. */}
      {isExpired && expiredLabel ? expiredLabel : formatDuration(remainingSeconds)}
    </span>
  );
}
