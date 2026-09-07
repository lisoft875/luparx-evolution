import type { AccessTokenClaims } from '@luparx/api-client';

/**
 * Decodes the access token's payload for immediate UI hints (active tenant,
 * roles, mfa flag) without a network round-trip. This performs NO signature
 * verification — it must never be treated as an authorization decision.
 * The server independently validates `aud`/`portal`/signature on every
 * request (CONTRACT.md §3); this is UX only.
 */
export function decodeAccessTokenClaims(token: string): AccessTokenClaims | null {
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) return null;
  try {
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const binary = atob(padded);
    const percentEncoded = Array.from(binary, (char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0')).join(
      '',
    );
    const json = decodeURIComponent(percentEncoded);
    return JSON.parse(json) as AccessTokenClaims;
  } catch {
    return null;
  }
}

export function isTokenExpired(expiresAt: number, skewMs = 5_000): boolean {
  return Date.now() + skewMs >= expiresAt;
}
