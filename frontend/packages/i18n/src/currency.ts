/**
 * ISO 4217 minor-unit exponents. Money is always stored/transmitted as an
 * integer minor-unit amount (see CONTRACT.md §5, `amount_minor`); this table
 * is what lets us render it in major units without floating-point math.
 * Default is 2 decimal digits; only documented exceptions are listed.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

export function minorUnitExponent(currencyCode: string): number {
  const code = currencyCode.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

/** Converts an integer minor-unit amount (e.g. cents) into a major-unit decimal number for display. */
export function minorToMajor(amountMinor: number, currencyCode: string): number {
  const exponent = minorUnitExponent(currencyCode);
  return amountMinor / 10 ** exponent;
}

/** Converts a major-unit decimal amount back into an integer minor-unit amount. */
export function majorToMinor(amountMajor: number, currencyCode: string): number {
  const exponent = minorUnitExponent(currencyCode);
  return Math.round(amountMajor * 10 ** exponent);
}
