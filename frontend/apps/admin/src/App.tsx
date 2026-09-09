import * as React from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@luparx/i18n';
import { LocalePreferenceSync, TenantCacheReset } from '@luparx/features';
import { AuthProvider, RequireAuth, RequirePermission, RequireTenant } from '@luparx/auth';
import { mockFetch } from '@luparx/api-client/mocks';
import { API_BASE_URL, PORTAL, USE_MOCKS } from './env';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { TenantSelectPage } from './pages/TenantSelectPage';
import { HomePage } from './pages/HomePage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsLocalesPage } from './pages/SettingsLocalesPage';
import { SettingsSpaceFormatPage } from './pages/SettingsSpaceFormatPage';
import { SettingsSchedulePage } from './pages/SettingsSchedulePage';
import { UsersListPage } from './pages/UsersListPage';
import { UserCreatePage } from './pages/UserCreatePage';
import { StaffPage } from './pages/StaffPage';
import { ZonesPage } from './pages/ZonesPage';
import { SpacesPage } from './pages/SpacesPage';
import { TariffsPage } from './pages/TariffsPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { AuditPage } from './pages/AuditPage';
import { ReportsPage } from './pages/ReportsPage';
import { EnforcementCitationsPage } from './pages/EnforcementCitationsPage';
import { EnforcementCitationDetailPage } from './pages/EnforcementCitationDetailPage';
import { SettingsInfractionTypesPage } from './pages/SettingsInfractionTypesPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/**
 * No `/register` route: a municipal admin account is granted from the platform back-office, never
 * opened by whoever fills in a form (CONTRACT.md v0.13). `POST /auth/admin/register` answers 403
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
              <Route
                path="/users"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <UsersListPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              {/* Creating staff is two capabilities at once — a person exists (USER_WRITE) and a
                  role is granted (ROLE_ASSIGN) — and the server checks both again. This only keeps
                  the screen off a menu where pressing it could produce nothing but a 403. */}
              {/* Operación: los sectores, sus bahías y su precio. */}
              <Route
                path="/zones"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <ZonesPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/spaces"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <SpacesPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/tariffs"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <TariffsPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/staff"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <StaffPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/users/new"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <RequirePermission permission="ROLE_ASSIGN" fallback={<Navigate to="/users" replace />}>
                        <UserCreatePage />
                      </RequirePermission>
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/users/:id"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <UserDetailPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/audit"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <AuditPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/reports"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <ReportsPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/settings/locales"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <SettingsLocalesPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/settings/space-format"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <SettingsSpaceFormatPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/settings/schedule"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <SettingsSchedulePage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              {/* Enforcement (CONTRACT.md v0.7). Reading is `CITATION_READ`, held by finance and
                  support too; annulment is `CITATION_VOID` and is checked on the detail screen
                  itself, because the list is legitimately readable by people who may not annul. */}
              <Route
                path="/enforcement/citations"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <RequirePermission permission="CITATION_READ" fallback={<Navigate to="/" replace />}>
                        <EnforcementCitationsPage />
                      </RequirePermission>
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/enforcement/citations/:id"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <RequirePermission permission="CITATION_READ" fallback={<Navigate to="/" replace />}>
                        <EnforcementCitationDetailPage />
                      </RequirePermission>
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/settings/infraction-types"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <RequirePermission permission="ENFORCEMENT_MANAGE" fallback={<Navigate to="/" replace />}>
                        <SettingsInfractionTypesPage />
                      </RequirePermission>
                    </RequireTenant>
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
