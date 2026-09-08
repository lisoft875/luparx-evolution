import * as React from 'react';
import { tenantAccentVariables } from '../tenantBrand';
import { TenantMark } from './TenantMark';

export interface TenantBadgeProps {
  /** Full name — used as the accessible name and the tooltip, whatever the badge has room to print. */
  name: string;
  /** What the badge prints; falls back to `name`. The server sends "M. de Oca" for "Montes de Oca". */
  shortName?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  /** Omit to render a static badge — a portal where the account has only one municipality cannot switch. */
  onClick?: () => void;
  /** Translated action description for the pressable form, e.g. t('tenant.badge.changeAction'). */
  actionLabel?: string;
  className?: string;
  locale?: string;
}

/**
 * The active municipality, sitting beside the LuParX mark in the top bar.
 *
 * It has to survive a 320 px bar with a brand, a bell and a notification count already in it, so
 * the name truncates and the emblem never does: at that width the emblem is what identifies the
 * municipality at a glance, and half a shrunken logo identifies nothing. The full name is always
 * on the element's accessible name and `title`, so the truncation costs no information.
 */
export function TenantBadge({
  name,
  shortName,
  logoUrl,
  brandColor,
  onClick,
  actionLabel,
  className,
  locale,
}: TenantBadgeProps): React.JSX.Element {
  const label = shortName?.trim() || name;
  const classes = ['lx-tenant-badge', className].filter(Boolean).join(' ');
  const style = tenantAccentVariables(brandColor);
  const content = (
    <>
      <TenantMark name={name} logoUrl={logoUrl} brandColor={brandColor} size="badge" decorative locale={locale} />
      <span className="lx-tenant-badge__label">{label}</span>
    </>
  );

  if (!onClick) {
    return (
      <span className={classes} style={style} title={name} aria-label={name}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`${classes} lx-tenant-badge--interactive`}
      style={style}
      onClick={onClick}
      title={name}
      aria-label={actionLabel ? `${name} — ${actionLabel}` : name}
    >
      {content}
    </button>
  );
}
