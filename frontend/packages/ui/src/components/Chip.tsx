import * as React from 'react';

export interface ChipProps {
  label: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  /**
   * Offered but not choosable right now. Rendered rather than hidden on purpose: an option that
   * disappears reads as an option that does not exist, and part of what a row of choices tells
   * someone is what their municipality has ruled out.
   */
  disabled?: boolean;
  className?: string;
}

/** A single pill filter (DESIGN_SYSTEM.md §3 "Filtros"). Prefer <ChipGroup> for a mutually-exclusive filter row. */
export function Chip({ label, selected = false, onClick, icon, disabled, className }: ChipProps): React.JSX.Element {
  const classes = ['lx-chip', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} aria-pressed={selected} disabled={disabled} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

export interface ChipGroupOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface ChipGroupProps<T extends string = string> {
  options: ChipGroupOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `pill` (default): scrolling row of independent pills (filters). `segmented`: fixed-width tabs sharing one track (DESIGN_SYSTEM.md §3, e.g. Multas "Pendientes / Historial"). */
  variant?: 'pill' | 'segmented';
  'aria-label': string;
  className?: string;
}

/** Horizontally-scrolling row of pill chips, one active at a time — duration/filter selectors across the app. */
export function ChipGroup<T extends string = string>({
  options,
  value,
  onChange,
  variant = 'pill',
  className,
  ...aria
}: ChipGroupProps<T>): React.JSX.Element {
  const classes = ['lx-chip-group', variant === 'segmented' ? 'lx-chip-group--segmented' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} role="group" aria-label={aria['aria-label']}>
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          icon={option.icon}
          selected={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}
