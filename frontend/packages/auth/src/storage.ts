import type { Portal } from '@luparx/api-client';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds; derived from the login/refresh response's `expiresIn`. */
  expiresAt: number;
  tenantId: string | null;
}

/**
 * Storage abstraction so the persistence mechanism can be swapped per
 * platform without touching AuthProvider: web uses namespaced localStorage
 * below; a Capacitor build can later inject an adapter backed by
 * `@capacitor/preferences` or platform Keychain/Keystore without changing
 * any call site.
 *
 * SECURITY NOTE: tokens are the only sensitive material ever written here.
 * The access token is short-lived (15 min per CONTRACT.md §3), which bounds
 * exposure if it leaks via an XSS vector; the refresh token is opaque,
 * rotated on every use, and reuse is detected server-side. Never store
 * passwords, MFA secrets, or personal data through this abstraction.
 */
export interface TokenStorage {
  getTokens(): StoredTokens | null;
  setTokens(tokens: StoredTokens): void;
  clear(): void;
}

function storageKeyFor(portal: Portal): string {
  // One key per portal: a citizen session must never be readable as an admin or inspector session.
  return `luparx.auth.${portal}.v1`;
}

class LocalStorageTokenStorage implements TokenStorage {
  constructor(private readonly key: string) {}

  getTokens(): StoredTokens | null {
    try {
      const raw = window.localStorage.getItem(this.key);
      if (!raw) return null;
      return JSON.parse(raw) as StoredTokens;
    } catch {
      return null;
    }
  }

  setTokens(tokens: StoredTokens): void {
    try {
      window.localStorage.setItem(this.key, JSON.stringify(tokens));
    } catch {
      // Storage unavailable (private mode / quota) — session simply won't persist across reloads.
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(this.key);
    } catch {
      // Nothing to do if storage is unavailable.
    }
  }
}

/** Creates the default (localStorage-backed) token storage isolated to one portal. */
export function createTokenStorage(portal: Portal): TokenStorage {
  return new LocalStorageTokenStorage(storageKeyFor(portal));
}

/**
 * Remembers which municipality this browser last chose, per portal.
 *
 * Kept apart from the token record on purpose. Tokens are cleared on every sign-out and rotated on
 * every refresh; the choice of municipality is a *preference* that should survive both, so that
 * signing back in does not put the picker in front of someone who already answered that question.
 *
 * It is a hint and nothing more. What it stores is an identifier the account was a member of at
 * some point, which says nothing about whether it still is — a membership can be revoked between
 * two sessions. AuthProvider therefore re-checks it against the memberships the server sends on
 * every bootstrap and drops it when it no longer matches an ACTIVE one; authority stays with the
 * server, which refuses `POST /session/tenant` for a membership that is not active anyway. Nothing
 * sensitive is written here: an opaque tenant id, no token, no personal data.
 */
export interface TenantPreferenceStorage {
  get(): string | null;
  set(tenantId: string): void;
  clear(): void;
}

function tenantPreferenceKeyFor(portal: Portal): string {
  return `luparx.tenant.${portal}.v1`;
}

class LocalStorageTenantPreference implements TenantPreferenceStorage {
  constructor(private readonly key: string) {}

  get(): string | null {
    try {
      const value = window.localStorage.getItem(this.key);
      return value && value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }

  set(tenantId: string): void {
    try {
      window.localStorage.setItem(this.key, tenantId);
    } catch {
      // Storage unavailable (private mode / quota) — the choice simply is not remembered.
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(this.key);
    } catch {
      // Nothing to do if storage is unavailable.
    }
  }
}

export function createTenantPreferenceStorage(portal: Portal): TenantPreferenceStorage {
  return new LocalStorageTenantPreference(tenantPreferenceKeyFor(portal));
}
