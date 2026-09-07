import * as React from 'react';
import type { CountryCatalogEntry } from '@luparx/api-client';
import { Select } from './Select';

export interface CountrySelectProps {
  id?: string;
  countries: CountryCatalogEntry[];
  value: string;
  onChange: (countryCode: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  name?: string;
  onBlur?: () => void;
}

/** Country picker with the catalog-provided flag emoji prefixed to each option label — never a bundled flag image (CONTRACT.md §2). */
export function CountrySelect({
  id,
  countries,
  value,
  onChange,
  placeholder,
  invalid,
  disabled,
  name,
  onBlur,
  ...aria
}: CountrySelectProps): React.JSX.Element {
  return (
    <Select
      id={id}
      name={name}
      invalid={invalid}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      aria-describedby={aria['aria-describedby']}
      options={countries.map((country) => ({
        value: country.code,
        label: `${country.flagEmoji} ${country.name}`.trim(),
      }))}
    />
  );
}
