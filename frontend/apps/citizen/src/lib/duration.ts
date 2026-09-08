import type { TranslationParams } from '@luparx/i18n';

/**
 * Formats a minute count from `ParkingPolicy`/`extensionIncrementsMinutes` for display — never a
 * fixed string in code (CONTRACT.md v0.2 §"Política de parqueo"). Whole hours read as "1 hora" /
 * "2 horas"; anything else falls back to a plain minute count, both fully plural-aware.
 */
export function formatDurationLabel(
  minutes: number,
  tPlural: (baseKey: string, count: number, params?: TranslationParams) => string,
): string {
  if (minutes > 0 && minutes % 60 === 0) {
    return tPlural('citizen.parking.durationHours', minutes / 60);
  }
  return tPlural('citizen.parking.durationMinutes', minutes);
}
