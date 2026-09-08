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
import { AccountPersonalDataPage } from './pages/AccountPersonalDataPage';
import { AccountEmailPage } from './pages/AccountEmailPage';
import { AccountPasswordPage } from './pages/AccountPasswordPage';
import { ParkingPage } from './pages/ParkingPage';
import { VehiclesPage } from './pages/VehiclesPage';
import { FinesPage } from './pages/FinesPage';
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
                path="/profile/personal"
                element={
                  <RequireAuth loginPath="/login">
                    <AccountPersonalDataPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/profile/email"
                element={
                  <RequireAuth loginPath="/login">
                    <AccountEmailPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/profile/password"
                element={
                  <RequireAuth loginPath="/login">
                    <AccountPasswordPage />
                  </RequireAuth>
                }
              />
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
