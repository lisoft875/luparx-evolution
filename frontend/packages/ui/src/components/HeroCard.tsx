import * as React from 'react';

export interface HeroCardProps {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * The single primary call-to-action of a screen (DESIGN_SYSTEM.md §2/§4.5,
 * e.g. citizen home "Estacionar ahora"): gradient surface + glow, an icon in
 * an outlined box, and a title/subtitle pair. Exactly one per screen — this
 * is the only component that carries `--lx-glow-primary` besides the
 * primary <Button>.
 */
export function HeroCard({ icon, title, subtitle, onClick, className }: HeroCardProps): React.JSX.Element {
  return (
    <button type="button" className={['lx-hero-card', className].filter(Boolean).join(' ')} onClick={onClick}>
      <span className="lx-hero-card__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="lx-hero-card__body">
        <span className="lx-hero-card__title">{title}</span>
        {subtitle ? <span className="lx-hero-card__subtitle">{subtitle}</span> : null}
      </span>
    </button>
  );
}
