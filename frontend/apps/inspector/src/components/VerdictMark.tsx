import * as React from 'react';
import type { PlateVerdict } from '@luparx/api-client';

export interface VerdictMarkProps {
  verdict: PlateVerdict;
  size?: number;
}

/**
 * A distinct **shape** per verdict, not a distinct colour.
 *
 * The answers have to be told apart at a metre, in sunlight, by someone who may be colour-blind —
 * so each one is a different glyph before it is a different tone (DESIGN_SYSTEM.md §2 rule 4, §5).
 * A tick, a shield, an hourglass, a divided bay, a barred circle and a question mark are legible as
 * silhouettes; six coloured dots are not.
 *
 * `EXEMPT` and `COVERED` share a tone on purpose — both mean "do not fine for non-payment" — and are
 * told apart by shape, which is the rule working exactly as intended: the officer sees at a glance
 * that no ticket is due, and the shape (and the sentence) say why.
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
    case 'EXEMPT':
      // A shield: this vehicle is protected from the fine, whatever it did or did not pay.
      return (
        <svg {...common}>
          <path d="M12 2.8l7 2.8v5.6c0 4.4-2.9 7.6-7 9.2-4.1-1.6-7-4.8-7-9.2V5.6z" {...stroke} />
          <path d="M8.8 12.2l2.2 2.2 4.2-4.4" {...stroke} />
        </svg>
      );
    case 'EXPIRED':
      // An hourglass: it paid, and the time ran out. Not the barred circle of "never paid".
      return (
        <svg {...common}>
          <path d="M7 3h10M7 21h10" {...stroke} />
          <path d="M8 3v3.2c0 1.3.6 2.5 1.7 3.2L12 11l2.3-1.6A3.9 3.9 0 0 0 16 6.2V3" {...stroke} />
          <path d="M8 21v-3.2c0-1.3.6-2.5 1.7-3.2L12 13l2.3 1.6c1.1.7 1.7 1.9 1.7 3.2V21" {...stroke} />
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
    // COVERED and EXEMPT share a tone deliberately: both mean "no non-payment citation". The shape
    // and the sentence carry the difference between having paid and being exempt.
    case 'COVERED':
      return 'success';
    case 'EXEMPT':
      return 'success';
    case 'EXPIRED':
      return 'warning';
    case 'BAY_MISMATCH':
      return 'warning';
    case 'NOT_COVERED':
      return 'danger';
    default:
      return 'info';
  }
}
