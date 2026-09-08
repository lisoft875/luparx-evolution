import * as React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiClient,
  HttpClient,
  type AccessTokenClaims,
  type LoginRequest,
  type MeResponse,
  type MembershipSummary,
  type Portal,
  type RegisterRequest,
  type RegisterResponse,
  type TenantCatalogEntry,
  type TokenProvider,
} from '@luparx/api-client';
import {
  createTenantPreferenceStorage,
  createTokenStorage,
  type StoredTokens,
  type TenantPreferenceStorage,
  type TokenStorage,
} from './storage';
import { decodeAccessTokenClaims, isTokenExpired } from './claims';

export type AuthStatus = 'loading' | 'unauthenticated' | 'mfa_required' | 'authenticated';

export interface LoginResult {
  mfaRequired: boolean;
}

export interface AuthContextValue {
  status: AuthStatus;
  portal: Portal;
  me: MeResponse | null;
  claims: AccessTokenClaims | null;
  memberships: MembershipSummary[];
  /** Only the memberships this portal can actually act on — the picker's source of truth. */
  activeMemberships: MembershipSummary[];
  /**
   * The municipality this session is scoped to, branding included (CONTRACT.md v0.4), or null
   * when none has been chosen yet.
   */
  activeTenant: TenantCatalogEntry | null;
  /**
   * True when the account must choose before it can do anything: authenticated, no active
   * municipality, and more than one to choose from. Deliberately false for exactly one membership
   * — the server already scoped the session to it, and asking someone to click the only option is
   * a step that answers itself.
   */
  requiresTenantSelection: boolean;
  apiClient: ApiClient;
  login: (payload: LoginRequest) => Promise<LoginResult>;
  verifyMfa: (code: string) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  /**
   * Notifies when the active municipality changes, so tenant-scoped caches can be dropped before
   * anything from the previous one is shown again (zones, tariffs, bay-code format and balance are
   * all per municipality). Returns an unsubscribe function.
   */
  subscribeToTenantChange: (listener: (tenantId: string | null) => void) => () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Whether a membership belongs to the portal this session is for.
 *
 * Compared case-insensitively because the two sides genuinely disagree today: `Portal` is the
 * lowercase route segment the client builds URLs from (`/api/v1/citizen/...`), while a membership
 * arrives carrying the server's enum constant (`"CITIZEN"`). A strict `===` silently matches
 * nothing, which does not fail loudly — it empties the municipality picker and strands an account
 * that has memberships on a screen saying it has none. Normalising here rather than everywhere a
 * membership is read keeps the workaround in one documented place; the real fix is for the wire
 * shape and `Portal` to agree, and this survives that fix either way.
 */
function belongsToPortal(membership: MembershipSummary, portal: Portal): boolean {
  return String(membership.portal).toLowerCase() === portal.toLowerCase();
}

export interface AuthProviderProps {
  children: React.ReactNode;
  portal: Portal;
  apiBaseUrl: string;
  /** Injects the mock transport (see @luparx/api-client/mocks) when VITE_USE_MOCKS=true; omit to use the real network. */
  fetchImpl?: typeof fetch;
  /** Overrides token persistence — defaults to portal-namespaced localStorage. Inject a Capacitor-backed adapter for native builds. */
  tokenStorage?: TokenStorage;
  /** Overrides where the remembered municipality lives; defaults to portal-namespaced localStorage. */
  tenantPreferenceStorage?: TenantPreferenceStorage;
}

export function AuthProvider({
  children,
  portal,
  apiBaseUrl,
  fetchImpl,
  tokenStorage,
  tenantPreferenceStorage,
}: AuthProviderProps): React.JSX.Element {
  const storage = useMemo(() => tokenStorage ?? createTokenStorage(portal), [tokenStorage, portal]);
  const tenantPreference = useMemo(
    () => tenantPreferenceStorage ?? createTenantPreferenceStorage(portal),
    [tenantPreferenceStorage, portal],
  );
  const storedTokensRef = useRef<StoredTokens | null>(storage.getTokens());
  const mfaTokenRef = useRef<string | null>(null);

  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [claims, setClaims] = useState<AccessTokenClaims | null>(null);

  // Standalone client for the refresh call itself — deliberately built without a
  // TokenProvider to avoid a circular dependency (the provider below needs to
  // call refresh; the ApiClient the app uses needs the provider).
  const refreshHttp = useMemo(() => new HttpClient({ baseUrl: apiBaseUrl, fetchImpl }), [apiBaseUrl, fetchImpl]);

  const applyTokens = useCallback(
    (tokens: { accessToken: string; refreshToken: string; expiresIn: number }, tenantId: string | null) => {
      const stored: StoredTokens = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        tenantId,
      };
      storedTokensRef.current = stored;
      storage.setTokens(stored);
      setClaims(decodeAccessTokenClaims(tokens.accessToken));
    },
    [storage],
  );

  const clearSession = useCallback(() => {
    storedTokensRef.current = null;
    storage.clear();
    setClaims(null);
    setMe(null);
    setStatus('unauthenticated');
  }, [storage]);

  // Tenant-change listeners. A Set in a ref rather than state: subscribing must not re-render the
  // whole tree, and a listener registered during a render must be callable in the same tick.
  const tenantListenersRef = useRef(new Set<(tenantId: string | null) => void>());
  const subscribeToTenantChange = useCallback((listener: (tenantId: string | null) => void) => {
    const listeners = tenantListenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const notifyTenantChanged = useCallback((tenantId: string | null) => {
    for (const listener of tenantListenersRef.current) listener(tenantId);
  }, []);

  const tokenProvider = useMemo<TokenProvider>(
    () => ({
      getAccessToken: () => storedTokensRef.current?.accessToken ?? null,
      refreshTokens: async () => {
        const current = storedTokensRef.current;
        if (!current) return null;
        try {
          const response = await refreshHttp.request<{ tokens: { accessToken: string; refreshToken: string; expiresIn: number } }>(
            'POST',
            `/api/v1/auth/${portal}/refresh`,
            { auth: false, body: { refreshToken: current.refreshToken } },
          );
          applyTokens(response.tokens, current.tenantId);
          return response.tokens;
        } catch {
          return null;
        }
      },
      onSessionExpired: () => clearSession(),
    }),
    [applyTokens, clearSession, portal, refreshHttp],
  );

  const apiClient = useMemo(
    () => new ApiClient(portal, { baseUrl: apiBaseUrl, fetchImpl, tokenProvider }),
    [portal, apiBaseUrl, fetchImpl, tokenProvider],
  );

  const refreshProfile = useCallback(async () => {
    const response = await apiClient.session.me();
    setMe(response);
  }, [apiClient]);

  /**
   * Re-enters the municipality this browser last chose, or forgets it.
   *
   * The remembered id is a hint from a previous session and is never trusted on its own: it is
   * checked against the memberships the server has just sent, so a municipality the account was
   * removed from cannot stay selected — it is dropped and the person is asked again. When the
   * server has already scoped the session (a single membership resolves itself), the preference is
   * simply brought in line with what actually happened, so the two can never drift apart.
   *
   * Failure here is never fatal: whatever goes wrong, the account lands on the picker, which is
   * the honest answer to "we could not put you back where you were".
   */
  const adoptRememberedTenant = useCallback(
    async (profile: MeResponse): Promise<MeResponse> => {
      if (profile.activeTenant) {
        tenantPreference.set(profile.activeTenant.id);
        return profile;
      }
      const remembered = tenantPreference.get();
      if (!remembered) return profile;
      const stillActive = profile.memberships.some(
        (membership) =>
          membership.tenantId === remembered && membership.status === 'ACTIVE' && belongsToPortal(membership, portal),
      );
      if (!stillActive) {
        tenantPreference.clear();
        return profile;
      }
      try {
        const response = await apiClient.session.switchTenant({ tenantId: remembered });
        applyTokens(response.tokens, remembered);
        notifyTenantChanged(remembered);
        return { ...profile, activeTenant: response.activeTenant };
      } catch {
        // The server is the authority: if it refuses, the membership is not usable and the
        // preference is stale whatever the list said.
        tenantPreference.clear();
        return profile;
      }
    },
    [apiClient, applyTokens, notifyTenantChanged, portal, tenantPreference],
  );

  useEffect(() => {
    let cancelled = false;
    async function bootstrap(): Promise<void> {
      const stored = storedTokensRef.current;
      if (!stored) {
        setStatus('unauthenticated');
        return;
      }
      if (isTokenExpired(stored.expiresAt)) {
        const refreshed = await tokenProvider.refreshTokens();
        if (!refreshed) {
          clearSession();
          return;
        }
      } else {
        setClaims(decodeAccessTokenClaims(stored.accessToken));
      }
      try {
        const response = await apiClient.session.me();
        // Restored before the tree is told it is authenticated, so a reload lands straight back in
        // the municipality the person was already in instead of flashing the picker on the way.
        const resolved = await adoptRememberedTenant(response);
        if (!cancelled) {
          setMe(resolved);
          setStatus('authenticated');
        }
      } catch {
        if (!cancelled) clearSession();
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
    // Runs once per portal/client identity; refreshing deps would re-run bootstrap unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient]);

  const login = useCallback(
    async (payload: LoginRequest): Promise<LoginResult> => {
      const response = await apiClient.auth.login(payload);
      if (response.mfaRequired) {
        mfaTokenRef.current = response.mfaToken ?? null;
        setStatus('mfa_required');
        return { mfaRequired: true };
      }
      if (response.accessToken && response.refreshToken && response.expiresIn) {
        applyTokens(
          { accessToken: response.accessToken, refreshToken: response.refreshToken, expiresIn: response.expiresIn },
          null,
        );
        setMe(await adoptRememberedTenant(await apiClient.session.me()));
        setStatus('authenticated');
      }
      return { mfaRequired: false };
    },
    [adoptRememberedTenant, apiClient, applyTokens],
  );

  const verifyMfa = useCallback(
    async (code: string): Promise<void> => {
      if (!mfaTokenRef.current) throw new Error('No pending MFA challenge');
      const response = await apiClient.auth.mfaVerify({ mfaToken: mfaTokenRef.current, code });
      mfaTokenRef.current = null;
      applyTokens(response.tokens, null);
      setMe(await adoptRememberedTenant(await apiClient.session.me()));
      setStatus('authenticated');
    },
    [adoptRememberedTenant, apiClient, applyTokens],
  );

  const register = useCallback(
    (payload: RegisterRequest): Promise<RegisterResponse> => apiClient.auth.register(payload),
    [apiClient],
  );

  const logout = useCallback(async (): Promise<void> => {
    const current = storedTokensRef.current;
    if (current) {
      try {
        await apiClient.auth.logout({ refreshToken: current.refreshToken });
      } catch {
        // Best-effort server-side revocation; local session is cleared regardless.
      }
    }
    clearSession();
  }, [apiClient, clearSession]);

  const switchTenant = useCallback(
    async (tenantId: string): Promise<void> => {
      const response = await apiClient.session.switchTenant({ tenantId });
      applyTokens(response.tokens, tenantId);
      tenantPreference.set(tenantId);
      // The switch answer already carries the municipality's branding (CONTRACT.md v0.4), so the
      // badge can repaint from it immediately; `/me` is refreshed straight after to bring the rest
      // of the profile in line, and both agree because both come from the server.
      setMe((current) => (current ? { ...current, activeTenant: response.activeTenant } : current));
      // Announced BEFORE the profile round-trip: anything cached for the previous municipality
      // (zones, tariffs, bay-code format, balance) has to be dropped before a screen can re-read it.
      notifyTenantChanged(tenantId);
      await refreshProfile();
    },
    [apiClient, applyTokens, notifyTenantChanged, refreshProfile, tenantPreference],
  );

  const memberships = useMemo(() => me?.memberships ?? [], [me]);
  const activeMemberships = useMemo(
    () => memberships.filter((membership) => membership.status === 'ACTIVE' && belongsToPortal(membership, portal)),
    [memberships, portal],
  );
  const activeTenant = me?.activeTenant ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      portal,
      me,
      claims,
      memberships,
      activeMemberships,
      activeTenant,
      requiresTenantSelection: status === 'authenticated' && !activeTenant && activeMemberships.length > 1,
      apiClient,
      login,
      verifyMfa,
      register,
      logout,
      switchTenant,
      refreshProfile,
      subscribeToTenantChange,
    }),
    [
      status,
      portal,
      me,
      claims,
      memberships,
      activeMemberships,
      activeTenant,
      apiClient,
      login,
      verifyMfa,
      register,
      logout,
      switchTenant,
      refreshProfile,
      subscribeToTenantChange,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
