import * as React from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@luparx/i18n';
import { LocalePreferenceSync, TenantCacheReset } from '@luparx/features';
import { AuthProvider, RequireAuth, RequireTenant } from '@luparx/auth';
import { mockFetch } from '@luparx/api-client/mocks';
import { API_BASE_URL, PORTAL, USE_MOCKS } from './env';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { TenantSelectPage } from './pages/TenantSelectPage';
import { HomePage } from './pages/HomePage';
import { ProfilePage } from './pages/ProfilePage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/**
 * Static single-file preview builds (opened from file:// or a static host) have no server
 * to rewrite deep links, so they opt into hash routing with VITE_ROUTER=hash.
 * The shipped apps keep clean paths.
 */
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;

export function App(): React.JSX.Element {
  return (
    <I18nProvider storageScope={PORTAL}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider portal={PORTAL} apiBaseUrl={API_BASE_URL} fetchImpl={USE_MOCKS ? mockFetch : undefined}>
          <LocalePreferenceSync />
          {/* Municipal data is scoped to one municipality; drop the previous one's answers on a switch. */}
          <TenantCacheReset />
          <Router>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/select-tenant" element={<TenantSelectPage />} />
              <Route
                path="/"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <HomePage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/profile"
                element={
                  <RequireAuth loginPath="/login">
                    <ProfilePage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </AuthProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
