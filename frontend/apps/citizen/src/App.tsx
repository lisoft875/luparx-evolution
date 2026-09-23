import * as React from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@luparx/i18n';
import { LocalePreferenceSync, TenantCacheReset, PortalErrorBoundary } from '@luparx/features';
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
import { NotificationsPage } from './pages/NotificationsPage';
import { FinesPage } from './pages/FinesPage';
import { FineDetailPage } from './pages/FineDetailPage';
import { FineAppealPage } from './pages/FineAppealPage';
import { WalletPage } from './pages/WalletPage';
import { MovementsPage } from './pages/MovementsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      /*
        `true`, y es deliberado aunque antes estuviera apagado.
        El contador de una estadía activa se dibuja con el reloj del TELÉFONO contra el `expiresAt`
        del servidor. Mientras la pestaña está en background el `refetchInterval` de React Query no
        corre, así que al volver el número seguía bajando desde `Date.now()` sin haber preguntado
        nada: el teléfono podía mostrar tiempo que ya no existía —o, con el reloj corrido, tiempo
        que nunca existió—. La guía de auditoría lo pone como criterio de aceptación: cerrar y
        reabrir la pestaña, o bloquear el teléfono, no debe desincronizar una sesión activa.

        El costo es una tanda de refetches al volver al frente. Se acota abajo con `staleTime`: sólo
        se vuelve a pedir lo que ya está viejo, y lo que se acaba de leer no se pide de nuevo.
      */
      refetchOnWindowFocus: true,
      /*
        Diez segundos. Corto porque acá casi todo es dinero o tiempo que corre, y largo como para
        que volver a la aplicación no dispare la lista completa de consultas de una pantalla.
        Las consultas que necesitan estar siempre frescas ya lo dicen por su cuenta
        (`extension-options` usa `staleTime: 0`).
      */
      staleTime: 10_000,
    },
  },
});

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
      {/* Lo primero adentro del idioma y lo último antes de todo lo demás: un fallo de
          render en cualquier pantalla se detiene acá en vez de vaciar el portal entero
          (23-09-2026). */}
      <PortalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider portal={PORTAL} apiBaseUrl={API_BASE_URL} fetchImpl={USE_MOCKS ? mockFetch : undefined}>
          <LocalePreferenceSync />
          {/* Everything a citizen screen reads is scoped to one municipality; this drops the
              previous one's answers the instant the active one changes. */}
          <TenantCacheReset />
          <Router {...routerProps}>
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
                path="/notifications"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <NotificationsPage />
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
      </PortalErrorBoundary>
    </I18nProvider>
  );
}
