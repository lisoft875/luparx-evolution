import * as React from 'react';

export interface TimerProps {
  /** Remaining seconds. Formatting (MM:SS, or HH:MM:SS past an hour) always happens here — never build the string at the call site. */
  remainingSeconds: number;
  /** Below this many seconds remaining, the timer switches to the warning tone (DESIGN_SYSTEM.md §3, default 10 min). */
  warningThresholdSeconds?: number;
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
  className,
  ...aria
}: TimerProps): React.JSX.Element {
  const isWarning = remainingSeconds <= warningThresholdSeconds;
  const classes = ['lx-timer', isWarning ? 'lx-timer--warning' : '', className].filter(Boolean).join(' ');
  return (
    <span className={classes} role="timer" aria-label={aria['aria-label']}>
      {formatDuration(remainingSeconds)}
    </span>
  );
}
