import * as React from 'react';
import { useEffect, useState } from 'react';
import { tenantAccentVariables, tenantMonogramInitials } from '../tenantBrand';

export type TenantMarkSize = 'badge' | 'tile' | 'hero';

export interface TenantMarkProps {
  /** The municipality's full name — also the image's alt text, so it must be the real name. */
  name: string;
  /** Already resolved by the server and absolutised by @luparx/api-client; null means "no emblem yet". */
  logoUrl?: string | null;
  brandColor?: string | null;
  size?: TenantMarkSize;
  /**
   * True when the mark sits inside something that already names the municipality (a tile with the
   * name underneath, a badge with the short name beside it). The image is then decorative and is
   * hidden from assistive technology, so a screen reader does not read the name twice.
   */
  decorative?: boolean;
  className?: string;
  /** BCP 47 tag, so the monogram's initials are upper-cased by the reader's own language rules. */
  locale?: string;
}

/**
 * A municipality's emblem: the image the server resolved, or the monogram when there is none.
 *
 * The platform never invents a coat of arms (CONTRACT.md v0.4 "El escudo es de la municipalidad").
 * There are only two things this may draw: the `logoUrl` the server sent — which for a municipality
 * that has not uploaded anything is the server's *own* generated monogram — and, if that image
 * cannot be loaded at all, initials over the brand colour. The second is a fallback for a broken
 * or absent URL, not a second design: it exists so a failed request degrades to something readable
 * instead of an empty box.
 */
export function TenantMark({
  name,
  logoUrl,
  brandColor,
  size = 'tile',
  decorative = false,
  className,
  locale,
}: TenantMarkProps): React.JSX.Element {
  // A logo that 404s or is blocked must not leave a hole in the grid. Reset on url change so a
  // municipality whose logo was fixed stops being remembered as broken.
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [logoUrl]);

  const classes = ['lx-tenant-mark', `lx-tenant-mark--${size}`, className].filter(Boolean).join(' ');
  const style = tenantAccentVariables(brandColor);

  if (logoUrl && !imageFailed) {
    return (
      <span className={classes} style={style}>
        <img
          className="lx-tenant-mark__image"
          src={logoUrl}
          alt={decorative ? '' : name}
          aria-hidden={decorative || undefined}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  const initials = tenantMonogramInitials(name, locale);
  return (
    <span
      className={`${classes} lx-tenant-mark--monogram`}
      style={style}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
    >
      <span className="lx-tenant-mark__initials" aria-hidden="true">
        {initials}
      </span>
    </span>
  );
}
