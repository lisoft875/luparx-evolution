import * as React from 'react';
import { useCallback, useRef } from 'react';
import { tenantAccentVariables } from '../tenantBrand';
import { TenantMark } from './TenantMark';

export interface TenantTileProps {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  selected?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  /** Translated label for the busy state, announced while the switch is in flight. */
  busyLabel?: string;
  locale?: string;
}

/**
 * One municipality in the picker: its emblem, large, with its name underneath.
 *
 * A `<button>` and not a card with a click handler — it must be reachable by Tab, activated by
 * Enter and Space, and announced as something that can be pressed, none of which a `<div>` gets.
 * The brand colour is confined to the ring and a wash behind the mark (see `.lx-tenant-tile` in
 * tokens.css); the tile's surface, its text and its focus ring stay on `--lx-*`.
 */
export function TenantTile({
  name,
  logoUrl,
  brandColor,
  selected = false,
  busy = false,
  disabled = false,
  onSelect,
  busyLabel,
  locale,
}: TenantTileProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={['lx-tenant-tile', selected ? 'lx-tenant-tile--selected' : '', busy ? 'lx-tenant-tile--busy' : '']
        .filter(Boolean)
        .join(' ')}
      style={tenantAccentVariables(brandColor)}
      aria-pressed={selected}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={onSelect}
    >
      {/* The ring is its own element rather than a border on the emblem: it has to stand *off*
          the logo the way the reference draws it, and a border on the mark itself would crop the
          artwork instead of circling it. */}
      <span className="lx-tenant-tile__ring">
        <TenantMark name={name} logoUrl={logoUrl} brandColor={brandColor} size="tile" decorative locale={locale} />
        {selected ? (
          <span className="lx-tenant-tile__check" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" focusable="false">
              <path d="M3 7.4l2.8 2.8L11 4.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}
      </span>
      <span className="lx-tenant-tile__name">{name}</span>
      {busy && busyLabel ? <span className="lx-visually-hidden">{busyLabel}</span> : null}
    </button>
  );
}

export interface TenantGridProps {
  children: React.ReactNode;
  /** Accessible name for the group of choices, e.g. t('tenant.selector.title'). */
  label: string;
  className?: string;
}

/**
 * The grid itself: two columns at 320 px, growing to four on a wide screen, driven by
 * `auto-fit`/`minmax` rather than breakpoints so it also fits the widths between them.
 *
 * Arrow keys move focus between tiles the way a person expects a grid to behave, with the column
 * count read from the laid-out DOM instead of guessed from the viewport — the CSS decides how many
 * columns there are, so the CSS is what gets asked. Tab still steps through every tile: this adds
 * a faster path, it does not replace the one keyboard users already have.
 */
export function TenantGrid({ children, label, className }: TenantGridProps): React.JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const grid = gridRef.current;
    if (!grid) return;
    const tiles = [...grid.querySelectorAll<HTMLButtonElement>('.lx-tenant-tile:not([disabled])')];
    const current = tiles.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;

    // Columns, measured: tiles that share the first tile's `offsetTop` are its row.
    const firstTop = tiles[0]!.offsetTop;
    const columns = Math.max(1, tiles.filter((tile) => tile.offsetTop === firstTop).length);

    let next = current;
    if (event.key === 'ArrowRight') next = current + 1;
    else if (event.key === 'ArrowLeft') next = current - 1;
    else if (event.key === 'ArrowDown') next = current + columns;
    else if (event.key === 'ArrowUp') next = current - columns;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tiles.length - 1;

    if (next < 0 || next >= tiles.length) return;
    event.preventDefault();
    tiles[next]!.focus();
  }, []);

  return (
    <div
      ref={gridRef}
      className={['lx-tenant-grid', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={label}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

/** A tile-shaped placeholder, so the grid keeps its geometry while the memberships load. */
export function TenantTileSkeleton(): React.JSX.Element {
  return (
    <div className="lx-tenant-tile lx-tenant-tile--skeleton" aria-hidden="true">
      <span className="lx-tenant-tile__ring">
        <span className="lx-tenant-mark lx-tenant-mark--tile lx-tenant-mark--skeleton" />
      </span>
      <span className="lx-tenant-tile__name lx-tenant-tile__name--skeleton" />
    </div>
  );
}
