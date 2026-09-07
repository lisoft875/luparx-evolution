import * as React from 'react';

export interface LogoProps {
  size?: number;
  className?: string;
  title: string;
}

/** LK monogram, SVG, colored only by tokens (never recolored ad hoc or stretched — DESIGN_SYSTEM.md §2 rule 6). */
export function Logo({ size = 32, className, title }: LogoProps): React.JSX.Element {
  const gradientId = React.useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--lx-primary)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--lx-primary-strong)' }} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path
        d="M9 8v16h6.5v-2.6H11.9V8H9zm10.4 0v16h2.6v-6.4l1-1.1L26.4 24H29.8l-6.1-8.9L29.4 8h-3.4l-6.6 7.7V8h-2.6z"
        fill="var(--lx-primary-contrast)"
      />
    </svg>
  );
}

export interface BrandProps {
  /** Already-translated product name (t('app.name')) — this package never hardcodes user-visible text. */
  name: string;
  tagline?: string;
  size?: number;
  className?: string;
}

/** Logo + wordmark (+ optional tagline) — the only sanctioned way to render the LupaRX mark in an app bar or splash. */
export function Brand({ name, tagline, size = 28, className }: BrandProps): React.JSX.Element {
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
