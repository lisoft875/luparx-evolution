import { ApiError, NetworkError } from '@luparx/api-client';
import type { TranslationKey, TranslationParams } from '@luparx/i18n';

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

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

const VEHICLE_DELETE_ERROR_KEYS: Record<string, TranslationKey> = {
  VEHICLE_HAS_ACTIVE_SESSION: 'citizen.vehicles.delete.error.VEHICLE_HAS_ACTIVE_SESSION',
};

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

/**
 * What to show when nothing more specific is known.
 *
 * "Ocurrió un error. Intenta de nuevo." on its own is unactionable for the person reading it and
 * unactionable for whoever they report it to: it is the same sentence whether the plate was
 * malformed, the token had expired, or the server was down. When the server answered with a
 * Problem Details (CONTRACT.md §4) it always carries a stable `code` and usually a `traceId`, and
 * showing them turns a report into something that can be looked up in one query instead of
 * reproduced from scratch.
 *
 * A transport failure is a different fact and gets its own sentence: there is no server answer to
 * quote, and telling someone to "try again" while they are offline is the wrong instruction.
 */
/**
 * Account-level refusals that every screen can hit, so they are answered the same way everywhere:
 * an account with no usable municipality, or one that has several and has not picked one yet.
 * Both used to arrive as a bare ACCESS_DENIED, which reads as "the app is broken" when in fact
 * the person only needs to be admitted, or to choose.
 */
const MEMBERSHIP_ERROR_KEYS: Record<string, TranslationKey> = {
  NO_ACTIVE_MEMBERSHIP: 'common.error.NO_ACTIVE_MEMBERSHIP',
  TENANT_CONTEXT_REQUIRED: 'common.error.TENANT_CONTEXT_REQUIRED',
};

export function apiErrorMessage(error: unknown, t: Translate, known?: Record<string, TranslationKey>): string {
  if (error instanceof NetworkError) return t('common.error.network');
  if (!(error instanceof ApiError)) return t('common.error.generic');
  const membership = MEMBERSHIP_ERROR_KEYS[error.code];
  if (membership) return t(membership);
  const mapped = known?.[error.code];
  if (mapped) return t(mapped);
  const reference = error.traceId
    ? t('common.error.reference', { code: error.code, traceId: error.traceId })
    : t('common.error.referenceNoTrace', { code: error.code });
  return `${t('common.error.generic')} ${reference}`;
}

/** Global message for a vehicle create/update failure that is not about the plate itself. */
export function vehicleSaveErrorMessage(error: unknown, t: Translate): string {
  return apiErrorMessage(error, t);
}

/** Message for a vehicle-deletion failure, keeping the mapped copy for the one refusal the server states. */
export function vehicleDeleteErrorMessage(error: unknown, t: Translate): string {
  return apiErrorMessage(error, t, VEHICLE_DELETE_ERROR_KEYS);
}

/** Global message for a parking (start/extend/finish) failure, keeping the mapped copy where one exists. */
export function parkingErrorMessage(error: unknown, t: Translate): string {
  return apiErrorMessage(error, t, PARKING_ERROR_KEYS);
}

/**
 * The sentence for a bare refusal *code* rather than a thrown error.
 *
 * `GET /extension-options` reports why an option may not be taken with the same `ErrorCode`
 * vocabulary the exceptions use (`EXTENSION_EXCEEDS_MAX`, `INSUFFICIENT_BALANCE`), so the option
 * that is offered-but-refused and the request that is refused outright say the same thing. A code
 * this app has no copy for is named rather than hidden: "no disponible" tells nobody anything, and
 * the code is at least something a support agent can look up.
 */
export function parkingReasonMessage(code: string | null | undefined, t: Translate): string | undefined {
  if (!code) return undefined;
  const mapped = PARKING_ERROR_KEYS[code];
  return mapped ? t(mapped) : t('common.error.referenceNoTrace', { code });
}
