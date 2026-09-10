import * as React from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@luparx/i18n';
import { LocalePreferenceSync } from '@luparx/features';
import { AuthProvider, RequireAuth } from '@luparx/auth';
import { mockFetch } from '@luparx/api-client/mocks';
import { API_BASE_URL, PORTAL, USE_MOCKS } from './env';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ProfilePage } from './pages/ProfilePage';
import { TenantsListPage } from './pages/TenantsListPage';
import { TenantCreatePage } from './pages/TenantCreatePage';
import { TenantDetailPage } from './pages/TenantDetailPage';
import { UsersListPage } from './pages/UsersListPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { AuditPage } from './pages/AuditPage';
import { ReportsPage } from './pages/ReportsPage';
import { CatalogsPage } from './pages/CatalogsPage';
import { SystemPage } from './pages/SystemPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/**
 * `platform` has no `/register` route at all (CONTRACT.md §0/§4 — 403
 * `SELF_REGISTRATION_DISABLED`, accounts are created from inside the
 * back-office by another PLATFORM_ADMIN) and no `/select-tenant` route
 * (platform-scope roles aren't tenant memberships — see mocks/data.ts).
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
          <Router>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              {/* El correo dice «/password/reset» desde v0.1 y la ruta siempre fue «/reset-password»:
                  cada enlace de restablecimiento caía en el comodín de abajo, que redirige a «/» y se
                  come el token. Los correos ya salen con la ruta buena; este alias es para los que
                  siguen en las bandejas de entrada de la gente (CONTRACT.md v0.27). */}
              <Route path="/password/reset" element={<ResetPasswordPage />} />
              <Route
                path="/"
                element={
                  <RequireAuth loginPath="/login">
                    <Navigate to="/tenants" replace />
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
              <Route
                path="/tenants"
                element={
                  <RequireAuth loginPath="/login">
                    <TenantsListPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/tenants/new"
                element={
                  <RequireAuth loginPath="/login">
                    <TenantCreatePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/tenants/:id"
                element={
                  <RequireAuth loginPath="/login">
                    <TenantDetailPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/users"
                element={
                  <RequireAuth loginPath="/login">
                    <UsersListPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/users/:id"
                element={
                  <RequireAuth loginPath="/login">
                    <UserDetailPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/audit"
                element={
                  <RequireAuth loginPath="/login">
                    <AuditPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/reports"
                element={
                  <RequireAuth loginPath="/login">
                    <ReportsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/catalogs"
                element={
                  <RequireAuth loginPath="/login">
                    <CatalogsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/system"
                element={
                  <RequireAuth loginPath="/login">
                    <SystemPage />
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
