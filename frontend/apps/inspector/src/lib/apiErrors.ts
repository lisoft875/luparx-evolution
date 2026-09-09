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
export function codeMessage(code: string | null, t: Translate): string | undefined {
  if (!code) return undefined;
  if (code === 'NETWORK_ERROR') return t('common.error.network');
  const known = LOOKUP_ERROR_KEYS[code] ?? MEMBERSHIP_ERROR_KEYS[code];
  return known ? t(known) : t('common.error.referenceNoTrace', { code });
}
