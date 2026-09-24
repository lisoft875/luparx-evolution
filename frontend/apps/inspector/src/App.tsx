import * as React from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@luparx/i18n';
import { LocalePreferenceSync, TenantCacheReset, PortalErrorBoundary } from '@luparx/features';
import { AuthProvider, RequireAuth, RequireTenant } from '@luparx/auth';
import { mockFetch } from '@luparx/api-client/mocks';
import { API_BASE_URL, PORTAL, USE_MOCKS } from './env';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AcceptInvitationPage } from './pages/AcceptInvitationPage';
import { TenantSelectPage } from './pages/TenantSelectPage';
import { PlateLookupPage } from './pages/PlateLookupPage';
import { NewCitationPage } from './pages/NewCitationPage';
import { MyCitationsPage } from './pages/MyCitationsPage';
import { CitationDetailPage } from './pages/CitationDetailPage';
import { QueuePage } from './pages/QueuePage';
import { HelpPage } from './pages/HelpPage';
import { MorePage } from './pages/MorePage';
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
              {/* El menú de herramientas. Bajo RequireTenant como el resto del módulo: muestra la
                  municipalidad activa y el estado de la cola, que no existen sin ella. */}
              <Route
                path="/more"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <MorePage />
                    </RequireTenant>
                  </RequireAuth>
                }
              />
              <Route
                path="/help"
                element={
                  <RequireAuth loginPath="/login">
                    <RequireTenant selectTenantPath="/select-tenant">
                      <HelpPage />
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
