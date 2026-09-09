import * as React from 'react';
import { useId } from 'react';

export interface RadioCardOption {
  value: string;
  label: string;
  /** Trailing text on the same row — the price, in the reference dialog. */
  trailing?: React.ReactNode;
  /** Second line under the label: why this option cannot be taken, or what it includes. */
  detail?: string;
  disabled?: boolean;
}

export interface RadioCardGroupProps {
  /** Shared radio name. One group per name, or two groups will fight over the same selection. */
  name: string;
  legend: string;
  /** Hide the legend visually when the dialog's own heading already says it. */
  hideLegend?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: RadioCardOption[];
}

/**
 * A list of mutually exclusive choices, each one a full-width row you can hit with a thumb.
 *
 * This is the shape the reference product uses for "how much more time" — one visible row per
 * option with its price on it, rather than a dropdown you have to open to compare five prices, or
 * a row of chips that cannot carry a second value at all. It is real `<input type="radio">`
 * elements inside a `<fieldset>`, so arrow keys, the label-click target, and the group's name all
 * come from the platform instead of being re-implemented.
 *
 * A disabled option stays in the list, greyed, with its reason on the second line. Dropping it
 * would leave the citizen wondering why the list is shorter than the municipality's published
 * increments.
 */
export function RadioCardGroup({
  name,
  legend,
  hideLegend,
  value,
  onChange,
  options,
}: RadioCardGroupProps): React.JSX.Element {
  const groupId = useId();
  return (
    <fieldset className="lx-radio-cards">
      <legend className={hideLegend ? 'lx-visually-hidden' : 'lx-radio-cards__legend'}>{legend}</legend>
      {options.map((option) => {
        const inputId = `${groupId}-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={inputId}
            className={[
              'lx-radio-card',
              option.value === value ? 'lx-radio-card--selected' : '',
              option.disabled ? 'lx-radio-card--disabled' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <input
              id={inputId}
              type="radio"
              className="lx-radio-card__input"
              name={name}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="lx-radio-card__text">
              <span className="lx-radio-card__label">{option.label}</span>
              {option.detail ? <span className="lx-radio-card__detail">{option.detail}</span> : null}
            </span>
            {option.trailing ? <span className="lx-radio-card__trailing">{option.trailing}</span> : null}
          </label>
        );
      })}
    </fieldset>
  );
}
