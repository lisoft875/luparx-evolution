import type { CSSProperties } from 'react';

/**
 * How a municipality's own colour is allowed to touch the interface.
 *
 * CONTRACT.md v0.4 gives every municipality a `brand_color`, and DESIGN_SYSTEM.md keeps every
 * colour in the product behind a `--lx-*` token. Both hold at once here: the brand colour
 * **accents** (a ring, a wash behind a tile, the monogram's ground) and never replaces a token —
 * surfaces, body text and controls stay exactly what the design system says they are.
 *
 * The hard part is contrast, and it is not solved by "put white text on it". The seeded palette
 * alone spans `#1d4ed8` (relative luminance ≈ 0.08) to `#b45309` (≈ 0.21), and the product's
 * default ground is near-black `#020A18`: a municipality that picks a dark navy would draw a ring
 * that is invisible against the page and a monogram whose white initials sit at a fine contrast
 * while its dark twin on the light theme would do the opposite. So each colour is projected to a
 * legible one **per theme** — lightened until it reads on the dark ground, darkened until it reads
 * on the light one — and the monogram's ink is chosen by measuring, not by assuming.
 *
 * Everything below is pure arithmetic on sRGB, deterministic and dependency-free: the same hex
 * always yields the same variables, which is what lets them be emitted as inline custom properties
 * and consumed by ordinary CSS rules in tokens.css.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Accepts `#rgb` and `#rrggbb` in any case — the two shapes CONTRACT.md v0.4 says the server accepts. */
export function parseHexColor(value: string | null | undefined): Rgb | null {
  if (!value) return null;
  const hex = value.trim().replace(/^#/, '');
  const expanded =
    hex.length === 3 && /^[0-9a-fA-F]{3}$/.test(hex)
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function channelLuminance(value: number): number {
  const sRgb = value / 255;
  return sRgb <= 0.03928 ? sRgb / 12.92 : ((sRgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

/** WCAG 2.1 contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Walks `color` toward white (or black) in small steps until it reaches `targetLuminance`.
 * A binary search would be faster and is not worth it: 40 steps of a 3-multiply function, run once
 * per municipality per render of a screen that shows at most a handful of them.
 */
function towardLuminance(color: Rgb, targetLuminance: number, direction: 'lighter' | 'darker'): Rgb {
  const anchor = direction === 'lighter' ? WHITE : BLACK;
  const satisfied = (candidate: Rgb): boolean =>
    direction === 'lighter'
      ? relativeLuminance(candidate) >= targetLuminance
      : relativeLuminance(candidate) <= targetLuminance;
  if (satisfied(color)) return color;
  for (let step = 1; step <= 40; step += 1) {
    const candidate = mix(color, anchor, step / 40);
    if (satisfied(candidate)) return candidate;
  }
  return anchor;
}

/** Black or white, whichever actually reads on `background`. Measured, never assumed. */
export function readableInkOn(background: Rgb): string {
  return contrastRatio(background, WHITE) >= contrastRatio(background, BLACK) ? '#ffffff' : '#000000';
}

/**
 * Minimum luminance an accent needs to be visible against the product's near-black ground
 * (`--lx-bg: #020A18`, luminance ≈ 0.005 tras el rediseño 360°; antes #020612, ≈ 0.004 — el
 * umbral de abajo no depende del fondo, así que el cálculo no cambió), y el máximo en el claro
 * (`#f4f6fb`, ≈ 0.90). Both were picked so the resulting ring clears roughly 3:1 against its own
 * background — the WCAG 2.1 threshold for a non-text graphical object, which is exactly what a
 * selection ring is.
 */
const DARK_THEME_MIN_LUMINANCE = 0.16;
const LIGHT_THEME_MAX_LUMINANCE = 0.32;

export interface TenantAccent {
  /** The colour as the municipality set it, normalised; the monogram's ground. */
  base: string;
  /** Readable ink for text drawn directly on `base`. */
  ink: string;
  /** `base` projected to be visible on the dark theme's ground. */
  onDark: string;
  /** `base` projected to be visible on the light theme's ground. */
  onLight: string;
  /** Readable ink for a glyph drawn on `onDark` — not the same colour as `ink`. */
  onDarkInk: string;
  /** Readable ink for a glyph drawn on `onLight`. */
  onLightInk: string;
}

/** The projections a brand colour needs to be usable in both themes, or null when there is no colour. */
export function tenantAccent(brandColor: string | null | undefined): TenantAccent | null {
  const base = parseHexColor(brandColor);
  if (!base) return null;
  const onDark = towardLuminance(base, DARK_THEME_MIN_LUMINANCE, 'lighter');
  const onLight = towardLuminance(base, LIGHT_THEME_MAX_LUMINANCE, 'darker');
  return {
    base: toHex(base),
    ink: readableInkOn(base),
    onDark: toHex(onDark),
    onLight: toHex(onLight),
    // Measured against the *projection*, not against `base`. The two genuinely disagree: the
    // selected tile's check sits on the lightened accent, and a colour whose own ink is white
    // (`#1d4ed8`) is lightened to something that needs black instead. Assuming `ink` here would
    // put white on a pale blue disc — the one place a brand colour could still make a glyph
    // disappear after all the projection work above.
    onDarkInk: readableInkOn(onDark),
    onLightInk: readableInkOn(onLight),
  };
}

/**
 * The inline custom properties every `.lx-tenant-*` rule in tokens.css reads.
 *
 * They are emitted as variables rather than as finished `background`/`border` declarations so the
 * *rules* stay in the stylesheet where the design system can see them: this function decides what
 * a municipality's colour is, tokens.css decides where colour is allowed to land. When there is no
 * brand colour the object is empty and every rule falls back to its `--lx-*` default — which is
 * why a municipality with no branding at all still renders correctly.
 */
export function tenantAccentVariables(brandColor: string | null | undefined): CSSProperties {
  const accent = tenantAccent(brandColor);
  if (!accent) return {};
  return {
    '--lx-tenant-brand': accent.base,
    '--lx-tenant-ink': accent.ink,
    '--lx-tenant-accent-dark': accent.onDark,
    '--lx-tenant-accent-light': accent.onLight,
    '--lx-tenant-accent-dark-ink': accent.onDarkInk,
    '--lx-tenant-accent-light-ink': accent.onLightInk,
  } as CSSProperties;
}

/**
 * The initials drawn when a municipality has no emblem yet.
 *
 * Two letters from two words, one from a single word, and the grapheme-aware split matters: a name
 * beginning with an accented letter must yield "Á", not a broken half of a surrogate pair. Never a
 * substitute for the real coat of arms — that is the municipality's to upload
 * (CONTRACT.md v0.4 "El escudo es de la municipalidad").
 */
export function tenantMonogramInitials(name: string, locale?: string): string {
  const words = name
    .split(/[\s—–-]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0);
  const letters = words.length >= 2 ? [words[0]!, words[1]!] : words.slice(0, 1);
  return letters
    .map((word) => [...word][0] ?? '')
    .join('')
    .toLocaleUpperCase(locale);
}
