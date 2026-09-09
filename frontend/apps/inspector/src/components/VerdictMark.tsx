import * as React from 'react';
import type { PlateVerdict } from '@luparx/api-client';

export interface VerdictMarkProps {
  verdict: PlateVerdict;
  size?: number;
}

/**
 * A distinct **shape** per verdict, not a distinct colour.
 *
 * The four answers have to be told apart at a metre, in sunlight, by someone who may be
 * colour-blind — so each one is a different glyph before it is a different tone (DESIGN_SYSTEM.md
 * §2 rule 4, §5). A tick, a divided bay, a barred circle and a question mark are legible as
 * silhouettes; four coloured dots are not.
 */
export function VerdictMark({ verdict, size = 56 }: VerdictMarkProps): React.JSX.Element {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
  };
  const stroke = {
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (verdict) {
    case 'COVERED':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M8 12.5l2.5 2.5L16 9.5" {...stroke} />
        </svg>
      );
    case 'BAY_MISMATCH':
      // Two bays, one marked: "paid for that one, not this one" as a picture.
      return (
        <svg {...common}>
          <rect x="2.5" y="6" width="8" height="12" rx="1.5" {...stroke} />
          <rect x="13.5" y="6" width="8" height="12" rx="1.5" {...stroke} />
          <path d="M4.5 12h4" {...stroke} />
          <path d="M15.5 9.5l4 5M19.5 9.5l-4 5" {...stroke} />
        </svg>
      );
    case 'NOT_COVERED':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M6.5 6.5l11 11" {...stroke} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M9.4 9.2a2.7 2.7 0 1 1 3.4 3.3c-.6.2-.9.7-.9 1.3v.4" {...stroke} />
          <path d="M12 17.2h.01" {...stroke} />
        </svg>
      );
  }
}

/** The tone that accompanies the shape — never the only signal. */
export function verdictTone(verdict: PlateVerdict): 'success' | 'warning' | 'danger' | 'info' {
  switch (verdict) {
    case 'COVERED':
      return 'success';
    case 'BAY_MISMATCH':
      return 'warning';
    case 'NOT_COVERED':
      return 'danger';
    default:
      return 'info';
  }
}
