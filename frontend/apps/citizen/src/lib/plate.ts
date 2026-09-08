/**
 * Uppercase, no spaces or dashes (CONTRACT.md v0.2 §"Vehículos") — applied only when the form is
 * submitted, so the input itself always shows exactly what the citizen typed.
 */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]+/g, '');
}
