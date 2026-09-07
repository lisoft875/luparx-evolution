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
  type TokenProvider,
} from '@luparx/api-client';
import { createTokenStorage, type StoredTokens, type TokenStorage } from './storage';
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
  apiClient: ApiClient;
  login: (payload: LoginRequest) => Promise<LoginResult>;
  verifyMfa: (code: string) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: React.ReactNode;
  portal: Portal;
  apiBaseUrl: string;
  /** Injects the mock transport (see @luparx/api-client/mocks) when VITE_USE_MOCKS=true; omit to use the real network. */
  fetchImpl?: typeof fetch;
  /** Overrides token persistence — defaults to portal-namespaced localStorage. Inject a Capacitor-backed adapter for native builds. */
  tokenStorage?: TokenStorage;
}

export function AuthProvider({
  children,
  portal,
  apiBaseUrl,
  fetchImpl,
  tokenStorage,
}: AuthProviderProps): React.JSX.Element {
  const storage = useMemo(() => tokenStorage ?? createTokenStorage(portal), [tokenStorage, portal]);
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
        if (!cancelled) {
          setMe(response);
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
        await refreshProfile();
        setStatus('authenticated');
      }
      return { mfaRequired: false };
    },
    [apiClient, applyTokens, refreshProfile],
  );

  const verifyMfa = useCallback(
    async (code: string): Promise<void> => {
      if (!mfaTokenRef.current) throw new Error('No pending MFA challenge');
      const response = await apiClient.auth.mfaVerify({ mfaToken: mfaTokenRef.current, code });
      mfaTokenRef.current = null;
      applyTokens(response.tokens, null);
      await refreshProfile();
      setStatus('authenticated');
    },
    [apiClient, applyTokens, refreshProfile],
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
      await refreshProfile();
    },
    [apiClient, applyTokens, refreshProfile],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      portal,
      me,
      claims,
      memberships: me?.memberships ?? [],
      apiClient,
      login,
      verifyMfa,
      register,
      logout,
      switchTenant,
      refreshProfile,
    }),
    [status, portal, me, claims, apiClient, login, verifyMfa, register, logout, switchTenant, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
