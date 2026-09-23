import * as React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ActiveTenantBadge } from '@luparx/features';
import { useAuth, usePermissions } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Button, Brand, PageLayout } from '@luparx/ui';

/**
 * One destination in the side navigation.
 *
 * <p>`NavLink` rather than `Link` so the current screen is marked: a column of links with no
 * active state never answers "where am I", which is the first question navigation exists to
 * settle. `end` on the root so every other route does not light it up as well.</p>
 */
function NavItem({ to, children }: { to: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => (isActive ? 'lx-nav-link lx-nav-link--active' : 'lx-nav-link')}
    >
      {children}
    </NavLink>
  );
}

export interface AdminShellProps {
  children: React.ReactNode;
}

/**
 * Shared chrome for every authenticated admin screen (CONTRACT.md §4 `/api/v1/admin/**`).
 *
 * <h2>Grouped, and headed</h2>
 *
 * <p>Fourteen destinations in one flat column is a list nobody reads to the end. They are grouped
 * by the question each group answers — what the municipality operates, who works for it, what it
 * enforces, how it is configured — with the operation first, because that is what a municipal
 * officer opens every day.</p>
 *
 * <p>The groups gated by a capability disappear entirely rather than showing disabled entries: the
 * server checks every one of these again, and a menu item that can only ever produce a 403 is
 * worse than no menu item.</p>
 */
export function AdminShell({ children }: AdminShellProps): React.JSX.Element {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  return (
    <PageLayout
      header={
        <div className="lx-shell-header-row">
          <div style={{ display: 'flex', gap: 'var(--lx-space-3)', alignItems: 'center', minWidth: 0 }}>
            <Brand name={t('app.name')} />
            {/* Which of the shells you are in, beside the product mark. The mark stays LuParX's;
                this word says whose console this is. */}
            <span className="lx-brand-suffix">{t('nav.portal.admin')}</span>
            {/* The municipality being administered (CONTRACT.md v0.4) — its emblem and short name,
                and the way back to the picker when there is a choice. */}
            <ActiveTenantBadge onOpenSelector={() => navigate('/select-tenant')} />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <NavLink to="/profile" className="lx-nav-link">
              {t('nav.profile')}
            </NavLink>
            <Button type="button" variant="ghost" onClick={() => logout()}>
              {t('auth.logout.action')}
            </Button>
          </div>
        </div>
      }
      sidebar={
        <div className="lx-nav">
          <NavItem to="/">{t('nav.home')}</NavItem>
          {/* Lo primero después de Inicio: es la pantalla desde la que se llega a las demás. */}
          {permissions.has('AUDIT_READ') ? <NavItem to="/dashboard">{t('nav.dashboard')}</NavItem> : null}

          {/* Operación, antes que las personas: es lo que un municipal abre todos los días. */}
          {permissions.has('TENANT_MANAGE') ? (
            <div className="lx-nav-group">
              <strong className="lx-nav-heading">{t('nav.group.operation')}</strong>
              <NavItem to="/zones">{t('nav.zones')}</NavItem>
              <NavItem to="/spaces">{t('nav.spaces')}</NavItem>
              <NavItem to="/tariffs">{t('nav.tariffs')}</NavItem>
              {/* El horario vive acá y no en Ajustes: dice CUÁNDO se cobra, que es la otra mitad de
                  lo que dicen las tarifas —cuánto—. Buscarlo en Ajustes obligaba a salir de
                  Operación a mitad de una tarea que es una sola. Lo que queda en Ajustes se toca
                  una vez al instalar; esto se toca cada feriado. */}
              <NavItem to="/settings/schedule">{t('admin.settings.schedule.title')}</NavItem>
              <NavItem to="/parking-policy">{t('nav.parkingPolicy')}</NavItem>
            </div>
          ) : null}

          {/* Enforcement (CONTRACT.md v0.7). Shown only to whoever may read a citation: finance and
              support hold `CITATION_READ`; the catalogue additionally needs `ENFORCEMENT_MANAGE`. */}
          {permissions.has('CITATION_READ') ? (
            <div className="lx-nav-group">
              <strong className="lx-nav-heading">{t('nav.enforcement')}</strong>
              <NavItem to="/enforcement/citations">{t('nav.enforcement.citations')}</NavItem>
              <NavItem to="/appeals">{t('nav.appeals')}</NavItem>
              {permissions.has('ENFORCEMENT_MANAGE') ? (
                <>
                  <NavItem to="/settings/infraction-types">{t('nav.enforcement.types')}</NavItem>
                  <NavItem to="/exemptions">{t('nav.enforcement.exemptions')}</NavItem>
                  <NavItem to="/enforcement/checks">{t('nav.enforcement.checks')}</NavItem>
                </>
              ) : null}
            </div>
          ) : null}

          {/* Administración (§10 de la especificación del 23-09-2026): una sola cabecera para lo
              que antes eran «Personas» y «Control».

              Los dos grupos separados tenían sentido leídos de arriba abajo —quiénes son y qué se
              vigila— pero producían dos encabezados de dos y tres entradas cada uno, y dejaban a
              Usuarios, Auditoría y Reportes lo bastante dispersos como para que el Inicio sintiera
              que tenía que repetirlos como enlaces sueltos. Ahora el Inicio es una portada y estos
              viven en un solo lugar, que es el que la persona ya buscaba. El orden conserva la
              distinción: primero quiénes, después qué se revisa. */}
          <div className="lx-nav-group">
            <strong className="lx-nav-heading">{t('nav.group.administration')}</strong>
            <NavItem to="/users">{t('nav.users')}</NavItem>
            {/* El panel de personal es su propio destino y no un filtro de Usuarios: las preguntas
                son distintas —esa lista es sobre las personas de la municipalidad, esta sobre los
                cargos que ha otorgado—. */}
            {permissions.has('USER_READ') ? <NavItem to="/staff">{t('nav.staff')}</NavItem> : null}
            <NavItem to="/audit">{t('nav.audit')}</NavItem>
            <NavItem to="/reports">{t('nav.reports')}</NavItem>
            {/* Acá y no en Configuración: la conciliación no es algo que una municipalidad
                configura, es algo que revisa. */}
            {permissions.has('WALLET_TOPUP') ? <NavItem to="/billing">{t('nav.billing')}</NavItem> : null}
          </div>

          {/* Municipal operation settings (CONTRACT.md v0.3) — lo que una municipalidad ajusta una
              vez y casi no vuelve a tocar: los idiomas de sus portales y cómo se numera una bahía.
              El horario de cobro se mudó a Operación, que es donde se usa.

              Tras `TENANT_MANAGE` como el resto: `AdminSettingsController` ya exige
              `PERM_TENANT_MANAGE` en las cuatro operaciones, así que sin ese permiso estas entradas
              llevaban a un 403. Un menú que ofrece lo que no se puede abrir es peor que uno corto. */}
          {permissions.has('TENANT_MANAGE') ? (
            <div className="lx-nav-group">
              <strong className="lx-nav-heading">{t('nav.settings')}</strong>
              <NavItem to="/settings/locales">{t('admin.settings.locales.title')}</NavItem>
              <NavItem to="/settings/space-format">{t('admin.settings.spaceFormat.title')}</NavItem>
            </div>
          ) : null}
        </div>
      }
    >
      {children}
    </PageLayout>
  );
}
