import * as React from 'react';
import type { CountryCatalogEntry } from '@luparx/api-client';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
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

/**
 * Country picker with the catalog-provided flag emoji prefixed to each option label — never a
 * bundled flag image (CONTRACT.md §2). The catalog gives a translation key rather than a name, so
 * the label is resolved here; a country the dictionary does not know yet falls back to its ISO
 * 3166 code, which is still a usable option rather than a blank one.
 */
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
  const { t } = useTranslation();
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
      options={countries.map((country) => {
        const name = t(country.nameKey as TranslationKey);
        return {
          value: country.code,
          label: `${country.flagEmoji} ${name === country.nameKey ? country.code : name}`.trim(),
        };
      })}
    />
  );
}
