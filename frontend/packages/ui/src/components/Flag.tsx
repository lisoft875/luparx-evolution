import * as React from 'react';
import { useEffect, useState } from 'react';

const REGIONAL_INDICATOR_BASE = 0x1f1e6; // Unicode 'REGIONAL INDICATOR SYMBOL LETTER A'
const ASCII_A = 'A'.charCodeAt(0);

/** Derives the flag emoji from an ISO 3166-1 alpha-2 code — no image asset is ever stored (CONTRACT.md §2). */
export function flagEmojiFromCountryCode(countryCode: string): string {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return [...code].map((letter) => String.fromCodePoint(REGIONAL_INDICATOR_BASE + (letter.charCodeAt(0) - ASCII_A))).join('');
}

let cachedEmojiSupport: boolean | null = null;

/**
 * Best-effort feature detection: renders a flag emoji to an offscreen canvas
 * and compares its width against the two bare regional-indicator letters.
 * Most platforms that can't compose flags render them as two separate,
 * wider glyphs, which this catches. Never throws — assumes support if the
 * canvas API is unavailable (e.g. certain test/SSR environments).
 */
function detectFlagEmojiSupport(): boolean {
  if (cachedEmojiSupport !== null) return cachedEmojiSupport;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      cachedEmojiSupport = true;
      return true;
    }
    ctx.font = '24px sans-serif';
    const flagWidth = ctx.measureText(flagEmojiFromCountryCode('US')).width;
    const letterWidth = ctx.measureText('U').width + ctx.measureText('S').width;
    cachedEmojiSupport = flagWidth < letterWidth * 1.5;
  } catch {
    cachedEmojiSupport = true;
  }
  return cachedEmojiSupport;
}

export interface FlagProps {
  countryCode: string;
  /** Accessible label, e.g. the localized country name. Falls back to the bare code. */
  label?: string;
  size?: number;
}

/** Renders a country flag: emoji when the platform can compose regional indicators, else a generated inline SVG badge (no bitmap asset). */
export function Flag({ countryCode, label, size = 16 }: FlagProps): React.JSX.Element {
  const [useFallback, setUseFallback] = useState(false);
  const code = countryCode.trim().toUpperCase();

  useEffect(() => {
    setUseFallback(!detectFlagEmojiSupport());
  }, []);

  const accessibleLabel = label ?? code;

  if (useFallback) {
    return (
      <svg
        width={size}
        height={size * 0.75}
        viewBox="0 0 24 18"
        role="img"
        aria-label={accessibleLabel}
        className="lx-flag-fallback"
      >
        <rect width="24" height="18" rx="2" fill="var(--lx-surface-2)" stroke="var(--lx-border)" />
        <text x="12" y="12" textAnchor="middle" fontSize="8" fill="var(--lx-text)" fontFamily="var(--lx-font-sans)">
          {code}
        </text>
      </svg>
    );
  }

  return (
    <span role="img" aria-label={accessibleLabel} style={{ fontSize: size }}>
      {flagEmojiFromCountryCode(code)}
    </span>
  );
}
