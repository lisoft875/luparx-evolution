import * as React from 'react';
import { BRAND_ASSETS } from '../brandAssets';

export interface LogoProps {
  size?: number;
  className?: string;
  title: string;
}

/**
 * The real LuParx mark (`brandAssets.markTransparent`) — the pack's one genuinely transparent
 * asset, so it is the only logo safe on any background (any theme, any surface). This is the
 * single sanctioned way to render just the icon; never a hand-drawn substitute and never a
 * different file.
 */
export function Logo({ size = 32, className, title }: LogoProps): React.JSX.Element {
  return (
    <img
      src={BRAND_ASSETS.markTransparent}
      width={size}
      height={size}
      alt={title}
      className={className}
      style={{ objectFit: 'contain', flexShrink: 0 }}
    />
  );
}

export interface BrandProps {
  /** Already-translated product name (t('app.name')) — this package never hardcodes user-visible text. */
  name: string;
  tagline?: string;
  size?: number;
  className?: string;
  /**
   * 'icon' (default): mark + text wordmark — safe anywhere (app bars, shells, any background).
   * 'lockup': the supplied opaque wordmark artwork — DARK BRAND SURFACES ONLY (login/auth hero,
   * onboarding). It is composed on near-black and is not safe on a light or busy background.
   */
  variant?: 'icon' | 'lockup';
}

/** Logo + wordmark (+ optional tagline) — the only sanctioned way to render the LuParx mark. */
export function Brand({ name, tagline, size = 28, className, variant = 'icon' }: BrandProps): React.JSX.Element {
  if (variant === 'lockup') {
    return (
      <span className={['lx-brand', 'lx-brand--lockup', className].filter(Boolean).join(' ')}>
        <img
          src={BRAND_ASSETS.wordmarkDark}
          alt={name}
          style={{ height: size * 1.6, width: 'auto', display: 'block' }}
        />
        {tagline ? <span className="lx-brand__tagline">{tagline}</span> : null}
      </span>
    );
  }
  return (
    <span className={['lx-brand', className].filter(Boolean).join(' ')}>
      <Logo size={size} title={name} />
      <span>
        <span className="lx-brand__wordmark">{name}</span>
        {tagline ? <span className="lx-brand__tagline"> · {tagline}</span> : null}
      </span>
    </span>
  );
}
