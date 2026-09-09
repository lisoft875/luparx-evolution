import type { TranslationParams } from '@luparx/i18n';

/**
 * Formats a minute count from `ParkingPolicy` for display — never a fixed string in code
 * (CONTRACT.md v0.2 §"Política de parqueo"). Whole hours read as "1 hora" / "2 horas"; anything
 * else falls back to a plain minute count, both fully plural-aware.
 *
 * <p>Shared rather than owned by the citizen app since v0.18: the administrator's policy screen
 * previews the ladder the citizen will be offered, and a preview drawn by a second implementation
 * is a preview that can disagree with the thing it previews.</p>
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
