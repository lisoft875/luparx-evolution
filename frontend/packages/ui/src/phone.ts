import { AsYouType, isValidPhoneNumber, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import type { PhoneInput } from '@luparx/api-client';

/** Formats the national number as the user types it, for the given ISO alpha-2 country. */
export function formatNationalAsYouType(countryCode: string, nationalNumber: string): string {
  try {
    return new AsYouType(countryCode as CountryCode).input(nationalNumber);
  } catch {
    return nationalNumber;
  }
}

/** Validates a {countryCode, nationalNumber} pair using libphonenumber-js — the same library the backend contract expects for parity (CONTRACT.md §2). */
export function isValidPhoneInput(phone: PhoneInput): boolean {
  if (!phone.countryCode || !phone.nationalNumber) return false;
  try {
    return isValidPhoneNumber(phone.nationalNumber, phone.countryCode as CountryCode);
  } catch {
    return false;
  }
}

/** Converts a {countryCode, nationalNumber} pair to E.164 for the wire (`phone_e164` — CONTRACT.md §2/§5), or null if invalid. */
export function toE164(phone: PhoneInput): string | null {
  try {
    const parsed = parsePhoneNumberFromString(phone.nationalNumber, phone.countryCode as CountryCode);
    return parsed && parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}
