import * as React from 'react';
import type { CountryCatalogEntry, PhoneInput } from '@luparx/api-client';
import { Select } from './Select';
import { Input } from './Input';
import { formatNationalAsYouType } from '../phone';

export interface PhoneFieldProps {
  countries: CountryCatalogEntry[];
  value: PhoneInput;
  onChange: (value: PhoneInput) => void;
  onBlur?: () => void;
  invalid?: boolean;
  inputId?: string;
  describedBy?: string;
}

/** Country-prefix selector + national number input; formats as-you-type via libphonenumber-js. The wire format is always E.164 — see `toE164`. */
export function PhoneField({
  countries,
  value,
  onChange,
  onBlur,
  invalid,
  inputId,
  describedBy,
}: PhoneFieldProps): React.JSX.Element {
  const selectedCountry = countries.find((country) => country.code === value.countryCode);

  return (
    <div className="lx-phone-field">
      <Select
        aria-label="Phone country code"
        className="lx-phone-field__country"
        value={value.countryCode}
        onChange={(event) => onChange({ ...value, countryCode: event.target.value })}
        onBlur={onBlur}
        options={countries.map((country) => ({
          value: country.code,
          label: `${country.flagEmoji} ${country.dialCode}`.trim(),
        }))}
      />
      <Input
        id={inputId}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        invalid={invalid}
        aria-describedby={describedBy}
        value={value.nationalNumber}
        onChange={(event) =>
          onChange({
            ...value,
            nationalNumber: selectedCountry
              ? formatNationalAsYouType(selectedCountry.code, event.target.value)
              : event.target.value,
          })
        }
        onBlur={onBlur}
        className="lx-phone-field__number"
      />
    </div>
  );
}
