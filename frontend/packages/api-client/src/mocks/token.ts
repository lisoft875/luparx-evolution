import type { AccessTokenClaims, Portal, Role, TokenPair } from '../types/domain';
import type { MockUserRecord } from './data';

function base64UrlEncode(json: unknown): string {
  const text = JSON.stringify(json);
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Produces a real (unsigned) JWT-shaped string so `@luparx/auth`'s claim
 * decoder exercises the exact same code path against mocks as it would
 * against a real backend. The signature segment is a mock placeholder —
 * never treat it as verified.
 */
export function mintMockAccessToken(
  user: MockUserRecord,
  portal: Portal,
  tenantId: string | null,
  roles: Role[],
): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = {
    iss: 'luparx-mock',
    sub: user.profile.id,
    aud: `luparx:portal:${portal}`,
    exp: now + 15 * 60,
    iat: now,
    jti: `mock-${now}-${Math.random().toString(36).slice(2, 8)}`,
    portal,
    tid: tenantId,
    roles,
    perms: [],
    locale: user.profile.locale,
    ver: 1,
  };
  const header = base64UrlEncode({ alg: 'none', typ: 'JWT' });
  const payload = base64UrlEncode(claims);
  return `${header}.${payload}.mock-signature`;
}

export function mintMockRefreshToken(): string {
  return `mock-refresh-${crypto.randomUUID()}`;
}

export function mintMockTokenPair(
  user: MockUserRecord,
  portal: Portal,
  tenantId: string | null,
  roles: Role[],
): TokenPair {
  return {
    accessToken: mintMockAccessToken(user, portal, tenantId, roles),
    refreshToken: mintMockRefreshToken(),
    expiresIn: 15 * 60,
  };
}
