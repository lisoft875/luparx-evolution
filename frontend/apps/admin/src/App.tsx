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
import { AcceptInvitationPage } from './pages/AcceptInvitationPage';
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
import { ParkingPolicyPage } from './pages/ParkingPolicyPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { AuditPage } from './pages/AuditPage';
import { ReportsPage } from './pages/ReportsPage';
import { EnforcementCitationsPage } from './pages/EnforcementCitationsPage';
import { EnforcementCitationDetailPage } from './pages/EnforcementCitationDetailPage';
import { AppealsPage } from './pages/AppealsPage';
import { EnforcementChecksPage } from './pages/EnforcementChecksPage';
import { ExemptionsPage } from './pages/ExemptionsPage';
import { SettingsInfractionTypesPage } from './pages/SettingsInfractionTypesPage';
import { BillingReconciliationPage } from './pages/BillingReconciliationPage';
import { DashboardPage } from './pages/DashboardPage';

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

/**
 * Prefijo de ruta con el que se construyó la app (`/` en desarrollo, `/admin/` y compañía cuando los
 * cuatro portales se publican en un mismo dominio). Sin esto el enrutador cree que vive en la raíz:
 * el primer clic saca al usuario del portal y un F5 en una pantalla interna devuelve un 404 del
 * servidor. No aplica a HashRouter, donde la ruta va después del `#` y el prefijo no le incumbe.
 */
const BASENAME = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
const routerProps = import.meta.env.VITE_ROUTER === 'hash' ? {} : { basename: BASENAME };

export function App(): React.JSX.Element {
  return (
    <I18nProvider storageScope={PORTAL}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider portal={PORTAL} apiBaseUrl={API_BASE_URL} fetchImpl={USE_MOCKS ? mockFetch : undefined}>
          <LocalePreferenceSync />
          {/* Municipal data is scoped to one municipality; drop the previous one's answers on a switch. */}
          <TenantCacheReset />
          <Router {...routerProps}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              {/* Aceptar una invitación: pública, y el token va en la ruta y no en la query (v0.27). */}
              <Route path="/invitation/:token" element={<AcceptInvitationPage />} />
              {/* El correo dice «/password/reset» desde v0.1 y la ruta siempre fue «/reset-password»:
                  cada enlace de restablecimiento caía en el comodín de abajo, que redirige a «/» y se
                  come el token. Los correos ya salen con la ruta buena; este alias es para los que
                  siguen en las bandejas de entrada de la gente (CONTRACT.md v0.27). */}
              <Route path="/password/reset" element={<ResetPasswordPage />} />
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
                path="/parking-policy"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <RequirePermission permission="TENANT_MANAGE" fallback={<Navigate to="/" replace />}>
                        <ParkingPolicyPage />
                      </RequirePermission>
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
              {/* The moderation queue reads defences, so `CITATION_READ` is what opens it; deciding
                  is `CITATION_VOID` and is checked on the decision itself, because a queue is
                  legitimately readable by people who may not resolve. */}
              <Route
                path="/appeals"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <RequirePermission permission="CITATION_READ" fallback={<Navigate to="/" replace />}>
                        <AppealsPage />
                      </RequirePermission>
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/enforcement/checks"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <RequirePermission permission="ENFORCEMENT_MANAGE" fallback={<Navigate to="/" replace />}>
                        <EnforcementChecksPage />
                      </RequirePermission>
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/exemptions"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <RequirePermission permission="ENFORCEMENT_MANAGE" fallback={<Navigate to="/" replace />}>
                        <ExemptionsPage />
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
              <Route
                path="/billing"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      {/* The capability the cashier and the finance role already hold: the person
                          who reconciles the money is the person who handles it. */}
                      <RequirePermission permission="WALLET_TOPUP" fallback={<Navigate to="/" replace />}>
                        <BillingReconciliationPage />
                      </RequirePermission>
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      {/* AUDIT_READ: «puede ver lo que hizo esta municipalidad». No TENANT_MANAGE —
                          leer las cifras no es la misma autoridad que cambiar la configuración, y un
                          panel que sólo abre el administrador es un panel que nadie consulta. */}
                      <RequirePermission permission="AUDIT_READ" fallback={<Navigate to="/" replace />}>
                        <DashboardPage />
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
