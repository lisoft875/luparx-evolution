import * as React from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@luparx/i18n';
import { LocalePreferenceSync, TenantCacheReset } from '@luparx/features';
import { AuthProvider, RequireAuth, RequireTenant } from '@luparx/auth';
import { mockFetch } from '@luparx/api-client/mocks';
import { API_BASE_URL, PORTAL, USE_MOCKS } from './env';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { TenantSelectPage } from './pages/TenantSelectPage';
import { PlateLookupPage } from './pages/PlateLookupPage';
import { NewCitationPage } from './pages/NewCitationPage';
import { MyCitationsPage } from './pages/MyCitationsPage';
import { CitationDetailPage } from './pages/CitationDetailPage';
import { QueuePage } from './pages/QueuePage';
import { ProfilePage } from './pages/ProfilePage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/**
 * No `/register` route: an inspector account is granted from the platform back-office, never opened by
 * whoever fills in a form (CONTRACT.md v0.13). `POST /auth/inspector/register` answers 403
 * `SELF_REGISTRATION_DISABLED`, so a route here would only lead to a form that cannot succeed.
 * The catch-all below sends an old bookmark of it to the login screen.
 */
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
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/select-tenant" element={<TenantSelectPage />} />
              {/* Everything an officer does needs a municipality: a citation belongs to one, and a
                  plate lookup is answered inside one. Hence RequireTenant around all of it. */}
              <Route
                path="/"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <PlateLookupPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/cite"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <NewCitationPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/citations"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <MyCitationsPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/citations/:id"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <CitationDetailPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/queue"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <QueuePage />
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
