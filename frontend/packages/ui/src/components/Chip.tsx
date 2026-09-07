import * as React from 'react';

export interface ChipProps {
  label: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

/** A single pill filter (DESIGN_SYSTEM.md §3 "Filtros"). Prefer <ChipGroup> for a mutually-exclusive filter row. */
export function Chip({ label, selected = false, onClick, icon, className }: ChipProps): React.JSX.Element {
  const classes = ['lx-chip', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} aria-pressed={selected} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

export interface ChipGroupOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface ChipGroupProps<T extends string = string> {
  options: ChipGroupOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  className?: string;
}

/** Horizontally-scrolling row of pill chips, one active at a time — duration/filter selectors across the app. */
export function ChipGroup<T extends string = string>({
  options,
  value,
  onChange,
  className,
  ...aria
}: ChipGroupProps<T>): React.JSX.Element {
  return (
    <div
      className={['lx-chip-group', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={aria['aria-label']}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          icon={option.icon}
          selected={option.value === value}
          onClick={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}
