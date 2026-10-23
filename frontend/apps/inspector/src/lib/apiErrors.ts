import { ApiError, NetworkError } from '@luparx/api-client';
import type { TranslationKey, TranslationParams } from '@luparx/i18n';

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

/**
 * The server's stable `code` values, verbatim (platform-core `ErrorCode` and the enforcement codes
 * of CONTRACT.md v0.7). A code spelled wrong here does not fail loudly — it quietly degrades a
 * precise sentence into "something went wrong", which on this app means an officer standing in the
 * street with no idea whether the bay was mistyped or the connection dropped.
 */
const LOOKUP_ERROR_KEYS: Record<string, TranslationKey> = {
  PARKING_SPACE_NOT_FOUND: 'inspector.lookup.error.PARKING_SPACE_NOT_FOUND',
  VALIDATION_FAILED: 'inspector.lookup.error.VALIDATION_FAILED',
};

const MEMBERSHIP_ERROR_KEYS: Record<string, TranslationKey> = {
  NO_ACTIVE_MEMBERSHIP: 'common.error.NO_ACTIVE_MEMBERSHIP',
  TENANT_CONTEXT_REQUIRED: 'common.error.TENANT_CONTEXT_REQUIRED',
};

/**
 * What to show when nothing more specific is known: the generic sentence plus the server's own
 * stable code and trace id. A bare "try again" is the same sentence whether the plate was
 * malformed, the token expired or the server is down, and it turns a support call into a
 * reproduction session.
 */
export function apiErrorMessage(error: unknown, t: Translate, known?: Record<string, TranslationKey>): string {
  if (error instanceof NetworkError) return t('common.error.network');
  // Los códigos que produce la cola misma llegan como un Error corriente cuyo mensaje ES el código
  // (22-10-2026). Sin esto se aplanaban a «algo salió mal», que en esta aplicación significa un
  // fiscalizador en la calle sin saber si el problema es el aparato, la red o lo que escribió.
  const codigoPropio = error instanceof Error && !(error instanceof ApiError)
    ? QUEUE_ERROR_KEYS[error.message]
    : undefined;
  if (codigoPropio) return t(codigoPropio);
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

export function lookupErrorMessage(error: unknown, t: Translate): string {
  return apiErrorMessage(error, t, LOOKUP_ERROR_KEYS);
}

/**
 * The sentence for a bare error *code* the queue recorded rather than an error object it still
 * holds. A code with no copy is named rather than hidden: "no se pudo enviar" tells nobody
 * anything, and the code is at least something a support agent can look up.
 */
/**
 * Los códigos que produce la cola misma, no el servidor, y que aún así hay que explicar.
 *
 * <p>`EVIDENCE_BYTES_MISSING` es el único hasta hoy y el que más necesita una frase: la fila deja
 * de reintentar, de modo que si la pantalla sólo nombrara el código el fiscalizador no sabría que
 * lo que tiene que hacer es volver a fotografiar.</p>
 */
const QUEUE_ERROR_KEYS: Record<string, TranslationKey> = {
  EVIDENCE_BYTES_MISSING: 'inspector.queue.error.EVIDENCE_BYTES_MISSING',
  // El aparato no pudo GUARDAR la fotografía al capturar (22-10-2026). Distinto de
  // EVIDENCE_BYTES_MISSING, que es «se guardó y después desapareció»: acá la boleta no llegó a
  // encolarse, así que lo que hay que hacer es liberar espacio y volver a capturarla.
  EVIDENCE_STORE_FAILED: 'inspector.queue.error.EVIDENCE_STORE_FAILED',
};

export function codeMessage(code: string | null, t: Translate): string | undefined {
  if (!code) return undefined;
  if (code === 'NETWORK_ERROR') return t('common.error.network');
  const known = LOOKUP_ERROR_KEYS[code] ?? MEMBERSHIP_ERROR_KEYS[code] ?? QUEUE_ERROR_KEYS[code];
  return known ? t(known) : t('common.error.referenceNoTrace', { code });
}
