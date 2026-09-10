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
import { MorePage } from './pages/MorePage';
import { ProfilePage } from './pages/ProfilePage';
import { ParkingPage } from './pages/ParkingPage';
import { VehiclesPage } from './pages/VehiclesPage';
import { FinesPage } from './pages/FinesPage';
import { FineDetailPage } from './pages/FineDetailPage';
import { FineAppealPage } from './pages/FineAppealPage';
import { WalletPage } from './pages/WalletPage';
import { MovementsPage } from './pages/MovementsPage';

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
          {/* Everything a citizen screen reads is scoped to one municipality; this drops the
              previous one's answers the instant the active one changes. */}
          <TenantCacheReset />
          <Router>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
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
                path="/more"
                element={
                  <RequireAuth loginPath="/login">
                    <MorePage />
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
              {/* Personal data, e-mail and password used to have a screen each, reached from an
                  index that was itself a screen. They are now all edited on /profile, in place;
                  these paths stay as redirects so a bookmarked, mailed or scripted link still
                  lands somewhere real. */}
              <Route path="/profile/personal" element={<Navigate to="/profile" replace />} />
              <Route path="/profile/email" element={<Navigate to="/profile" replace />} />
              <Route path="/profile/password" element={<Navigate to="/profile" replace />} />
              <Route
                path="/park"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <ParkingPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/vehicles"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <VehiclesPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/fines"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <FinesPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/fines/:id"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <FineDetailPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              {/* Writing the defence, and afterwards reading it and the municipality's answer. */}
              <Route
                path="/fines/:id/appeal"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <FineAppealPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/wallet"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <WalletPage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/movements"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <MovementsPage />
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
