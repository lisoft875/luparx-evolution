import { ApiError } from '@luparx/api-client';
import type { TranslationKey } from '@luparx/i18n';

/** Maps a stable RFC 9457 `code` (CONTRACT.md §4) to its i18n key. Unmapped/network errors fall back to a generic message. */
function lookup(error: unknown, table: Record<string, TranslationKey>): TranslationKey | undefined {
  if (!(error instanceof ApiError)) return undefined;
  return table[error.code];
}

// The keys here are the server's stable `code` values, verbatim (platform-core ErrorCode). A code
// that does not match exactly is not a typo with a small cost: it silently degrades a precise,
// actionable message into "something went wrong", which is how a duplicate plate came to look like
// a broken app. Anything not listed is genuinely unexpected and gets the generic message.
const PARKING_ERROR_KEYS: Record<string, TranslationKey> = {
  SESSION_ALREADY_ACTIVE_FOR_VEHICLE: 'citizen.parking.error.SESSION_ALREADY_ACTIVE_FOR_VEHICLE',
  SPACE_OCCUPIED: 'citizen.parking.error.SPACE_OCCUPIED',
  INVALID_INCREMENT: 'citizen.parking.error.INVALID_INCREMENT',
  INSUFFICIENT_BALANCE: 'citizen.parking.error.INSUFFICIENT_BALANCE',
  EXTENSION_DISABLED: 'citizen.parking.error.EXTENSION_DISABLED',
  EXTENSION_EXCEEDS_MAX: 'citizen.parking.error.EXTENSION_EXCEEDS_MAX',
  EARLY_FINISH_DISABLED: 'citizen.parking.error.EARLY_FINISH_DISABLED',
  VEHICLE_NOT_FOUND: 'citizen.parking.error.VEHICLE_NOT_FOUND',
  PARKING_SESSION_NOT_FOUND: 'citizen.parking.error.SESSION_NOT_FOUND',
  PARKING_SESSION_NOT_ACTIVE: 'citizen.parking.error.PARKING_SESSION_NOT_ACTIVE',
  PARKING_SPACE_NOT_FOUND: 'citizen.parking.error.PARKING_SPACE_NOT_FOUND',
  PARKING_SPACE_OUT_OF_SERVICE: 'citizen.parking.error.PARKING_SPACE_OUT_OF_SERVICE',
  PARKING_SPACE_CODE_INVALID: 'citizen.parking.error.PARKING_SPACE_CODE_INVALID',
  OUTSIDE_CHARGING_HOURS: 'citizen.parking.error.OUTSIDE_CHARGING_HOURS',
};

/** Translation key for a parking (start/extend/finish) mutation failure — global alert copy. */
export function parkingErrorKey(error: unknown): TranslationKey {
  return lookup(error, PARKING_ERROR_KEYS) ?? 'common.error.generic';
}

const VEHICLE_DELETE_ERROR_KEYS: Record<string, TranslationKey> = {
  VEHICLE_HAS_ACTIVE_SESSION: 'citizen.vehicles.delete.error.VEHICLE_HAS_ACTIVE_SESSION',
};

/** Translation key for a vehicle-deletion failure (CONTRACT.md v0.2 — "el servidor rechaza eliminar uno con sesión activa"). */
export function vehicleDeleteErrorKey(error: unknown): TranslationKey {
  return lookup(error, VEHICLE_DELETE_ERROR_KEYS) ?? 'common.error.generic';
}

/**
 * Field-level message for the vehicle form's `plate` input (never shown as a global error —
 * CONTRACT.md v0.2 "un usuario no puede repetir su propia placa... mostralo junto al campo").
 * Prefers the server's own `errors[]` message and falls back to a translated default for the
 * stable conflict code.
 */
export function vehiclePlateError(error: unknown, t: (key: TranslationKey) => string): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const fieldMessage = error.fieldError('plate');
  if (fieldMessage) return fieldMessage;
  if (error.code === 'VEHICLE_PLATE_ALREADY_REGISTERED') {
    return t('citizen.vehicles.form.error.PLATE_ALREADY_REGISTERED');
  }
  return undefined;
}
