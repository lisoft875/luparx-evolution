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

/**
 * Lo mismo, pero sin esconder los minutos: «12 horas (720 min)».
 *
 * `formatDurationLabel` convierte a horas EN VEZ de minutos, y eso está bien donde la persona
 * elige —«2 horas» se lee mejor que «120 minutos»—. Pero donde el número se EDITA, esconder la
 * unidad real obliga a adivinar: el techo total de una estadía se guarda en minutos, y quien
 * escribe «720» tiene que poder comprobar que eso son doce horas sin hacer la cuenta (auditoría
 * del 22-09-2026, P0 de unidades).
 *
 * Con menos de una hora, o con horas no exactas, no se duplica nada: «45 minutos» ya es claro y
 * «(45 min)» sería ruido.
 */
export function formatDurationWithMinutes(
  minutes: number,
  tPlural: (baseKey: string, count: number, params?: TranslationParams) => string,
  // Se pide la clave CONCRETA y no `(key: string) => string`: el `t` de la aplicación tipa sus
  // claves, y un parámetro más laxo no lo acepta. Así además queda escrito qué texto usa.
  t: (key: 'common.duration.hoursWithMinutes', params?: TranslationParams) => string,
): string {
  if (minutes > 0 && minutes % 60 === 0) {
    return t('common.duration.hoursWithMinutes', {
      hours: tPlural('citizen.parking.durationHours', minutes / 60),
      minutes: String(minutes),
    });
  }
  return tPlural('citizen.parking.durationMinutes', minutes);
}
