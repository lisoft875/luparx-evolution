import * as React from 'react';
import { useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ActiveTenantBadge } from '@luparx/features';
import { useAuth, usePermissions } from '@luparx/auth';
import type { Permission } from '@luparx/api-client';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import {
  Brand,
  IconAudit,
  IconBuilding,
  IconCar,
  IconCatalog,
  IconChart,
  IconClock,
  IconFine,
  IconGlobe,
  IconHome,
  IconList,
  IconPark,
  IconPin,
  IconReports,
  IconSearch,
  IconSettings,
  IconShield,
  IconTag,
  IconUsers,
  IconWallet,
  MenuButton,
  PageLayout,
  ShellSearch,
} from '@luparx/ui';

/**
 * Un destino del portal: a dónde va, cómo se llama, con qué icono y quién puede abrirlo.
 *
 * <p>`permission` ausente significa que cualquier cuenta con acceso al portal lo ve. Cuando está,
 * es el MISMO permiso que comprueba la ruta y el endpoint: una entrada de menú que sólo puede
 * producir un 403 es peor que ninguna entrada de menú.</p>
 */
interface Destino {
  to: string;
  labelKey: TranslationKey;
  icon: React.ReactNode;
  permission?: Permission;
}

interface Grupo {
  /** El encabezado del grupo. Ausente en el primero: Inicio y Panel no necesitan presentación. */
  headingKey?: TranslationKey;
  /** El permiso que hace falta para ver el grupo entero. */
  permission?: Permission;
  destinos: Destino[];
}

/**
 * Los destinos del portal, una sola vez.
 *
 * <h2>Por qué son datos y no JSX</h2>
 *
 * <p>Hasta el 06-10-2026 esta lista estaba escrita directamente como JSX dentro del menú lateral.
 * Funcionaba perfectamente para dibujar un menú y no servía para nada más, y la v1.1 pide un
 * buscador global en la cabecera: un buscador que tuviera su propia copia de los veintidós destinos
 * se habría desincronizado la primera vez que alguien añadiera una pantalla, y —peor— habría tenido
 * su propia idea de quién puede abrir cada una.</p>
 *
 * <p>Ahora el menú y el buscador se dibujan de acá, así que la pregunta «¿puede esta cuenta abrir
 * esto?» se contesta UNA vez y las dos cosas obedecen la misma respuesta. El orden y los grupos son
 * exactamente los de antes; esto no es un rediseño de la navegación.</p>
 */
const GRUPOS: Grupo[] = [
  {
    destinos: [
      { to: '/', labelKey: 'nav.home', icon: <IconHome /> },
      // Lo primero después de Inicio: es la pantalla desde la que se llega a las demás.
      { to: '/dashboard', labelKey: 'nav.dashboard', icon: <IconChart />, permission: 'AUDIT_READ' },
    ],
  },
  {
    // Operación, antes que las personas: es lo que un municipal abre todos los días.
    headingKey: 'nav.group.operation',
    permission: 'TENANT_MANAGE',
    destinos: [
      { to: '/zones', labelKey: 'nav.zones', icon: <IconPin /> },
      { to: '/spaces', labelKey: 'nav.spaces', icon: <IconPark /> },
      { to: '/tariffs', labelKey: 'nav.tariffs', icon: <IconTag /> },
      // El horario vive acá y no en Ajustes: dice CUÁNDO se cobra, que es la otra mitad de lo que
      // dicen las tarifas —cuánto—. Lo que queda en Ajustes se toca una vez al instalar; esto se
      // toca cada feriado.
      { to: '/settings/schedule', labelKey: 'admin.settings.schedule.title', icon: <IconClock /> },
      { to: '/parking-policy', labelKey: 'nav.parkingPolicy', icon: <IconCatalog /> },
    ],
  },
  {
    // Enforcement (CONTRACT.md v0.7). Sólo para quien pueda leer una boleta: finanzas y soporte
    // tienen `CITATION_READ`; el catálogo necesita además `ENFORCEMENT_MANAGE`.
    headingKey: 'nav.enforcement',
    permission: 'CITATION_READ',
    destinos: [
      { to: '/enforcement/citations', labelKey: 'nav.enforcement.citations', icon: <IconFine /> },
      { to: '/appeals', labelKey: 'nav.appeals', icon: <IconList /> },
      {
        to: '/settings/infraction-types',
        labelKey: 'nav.enforcement.types',
        icon: <IconShield />,
        permission: 'ENFORCEMENT_MANAGE',
      },
      {
        to: '/exemptions',
        labelKey: 'nav.enforcement.exemptions',
        icon: <IconCar />,
        permission: 'ENFORCEMENT_MANAGE',
      },
      {
        to: '/enforcement/checks',
        labelKey: 'nav.enforcement.checks',
        icon: <IconSearch />,
        permission: 'ENFORCEMENT_MANAGE',
      },
    ],
  },
  {
    // Administración (§10 de la especificación del 23-09-2026): una sola cabecera para lo que antes
    // eran «Personas» y «Control». El orden conserva la distinción: primero quiénes, después qué se
    // revisa.
    headingKey: 'nav.group.administration',
    destinos: [
      { to: '/users', labelKey: 'nav.users', icon: <IconUsers /> },
      // El panel de personal es su propio destino y no un filtro de Usuarios: las preguntas son
      // distintas —esa lista es sobre las personas, esta sobre los cargos que la municipalidad ha
      // otorgado—.
      { to: '/staff', labelKey: 'nav.staff', icon: <IconBuilding />, permission: 'USER_READ' },
      // Junto a Usuarios y no en Configuración: es lo que explica el rol que se ve al lado de cada
      // nombre en esa lista.
      { to: '/roles', labelKey: 'nav.roles', icon: <IconSettings />, permission: 'USER_READ' },
      { to: '/audit', labelKey: 'nav.audit', icon: <IconAudit /> },
      { to: '/reports', labelKey: 'nav.reports', icon: <IconReports /> },
      // Acá y no en Configuración: la conciliación no es algo que una municipalidad configura, es
      // algo que revisa.
      { to: '/billing', labelKey: 'nav.billing', icon: <IconWallet />, permission: 'WALLET_TOPUP' },
    ],
  },
  {
    // Lo que una municipalidad ajusta una vez y casi no vuelve a tocar (CONTRACT.md v0.3). Tras
    // `TENANT_MANAGE` como el resto: `AdminSettingsController` ya lo exige en las cuatro
    // operaciones, así que sin ese permiso estas entradas llevaban a un 403.
    headingKey: 'nav.settings',
    permission: 'TENANT_MANAGE',
    destinos: [
      { to: '/settings/locales', labelKey: 'admin.settings.locales.title', icon: <IconGlobe /> },
      { to: '/settings/space-format', labelKey: 'admin.settings.spaceFormat.title', icon: <IconSettings /> },
    ],
  },
];

/**
 * Una entrada del menú lateral.
 *
 * <p>`NavLink` y no `Link` para que la pantalla actual quede marcada: una columna de enlaces sin
 * estado activo no contesta nunca «dónde estoy», que es la primera pregunta que la navegación existe
 * para resolver. `end` en la raíz para que el resto de las rutas no la enciendan también.</p>
 */
function NavItem({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => (isActive ? 'lx-nav-link lx-nav-link--active' : 'lx-nav-link')}
    >
      {/* Discreto y del mismo juego que el resto: ayuda a encontrar, no decora (§9 de la v3). El
          tamaño lo fija la hoja de estilos, no cada llamada. */}
      <span className="lx-nav-link__icon" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </NavLink>
  );
}

export interface AdminShellProps {
  children: React.ReactNode;
  /** La línea de cierre de la página. Sólo el Inicio la trae hoy (§3F de la v3). */
  footer?: React.ReactNode;
}

/** Las iniciales de un nombre, para el botón de la cuenta. */
function iniciales(nombre: string, apellido: string): string {
  const a = nombre.trim().charAt(0);
  const b = apellido.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '·';
}

/**
 * Shared chrome for every authenticated admin screen (CONTRACT.md §4 `/api/v1/admin/**`).
 *
 * <h2>Grouped, and headed</h2>
 *
 * <p>Veintidós destinos en una sola columna plana es una lista que nadie lee hasta el final. Van
 * agrupados por la pregunta que contesta cada grupo —qué opera la municipalidad, quién trabaja en
 * ella, qué fiscaliza, cómo se configura— y con la operación primero, porque es lo que un municipal
 * abre todos los días.</p>
 *
 * <p>Los grupos que dependen de un permiso desaparecen enteros en vez de mostrarse apagados: el
 * servidor vuelve a comprobar cada uno, y una entrada de menú que sólo puede dar un 403 es peor que
 * ninguna.</p>
 *
 * <h2>La cabecera (v1.1 §3, 06-10-2026)</h2>
 *
 * <p>Tres zonas: identidad, buscador, cuenta. Antes eran dos, y la de la derecha era «Perfil» y un
 * botón de cerrar sesión al aire — que es literalmente lo que la especificación de acabado pide
 * quitar: «eliminar la sensación actual de header vacío con sólo Perfil/Cerrar sesión». Ahora las dos
 * viven dentro del menú de la cuenta, que además dice quién sos y con qué rol entraste.</p>
 *
 * <p>Lo que NO lleva es campana de notificaciones, y no es un olvido: no existe ningún endpoint de
 * notificaciones para el portal administrativo —sólo para el ciudadano— y la propia especificación
 * prohíbe «modificar contratos de API sólo para conseguir el look». Una campana que nunca se
 * enciende es un adorno que enseña a la gente a ignorarla.</p>
 */
export function AdminShell({ children, footer }: AdminShellProps): React.JSX.Element {
  const { t } = useTranslation();
  const { logout, me, activeTenant, memberships } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  /** Los grupos que esta cuenta ve, con sus destinos ya filtrados. */
  const visibles = useMemo(
    () =>
      GRUPOS.filter((grupo) => !grupo.permission || permissions.has(grupo.permission))
        .map((grupo) => ({
          ...grupo,
          destinos: grupo.destinos.filter((destino) => !destino.permission || permissions.has(destino.permission)),
        }))
        .filter((grupo) => grupo.destinos.length > 0),
    [permissions],
  );

  /** Los mismos destinos, planos, para el buscador. Con el nombre del grupo como contexto. */
  const destinosBuscables = useMemo(
    () =>
      visibles.flatMap((grupo) =>
        grupo.destinos.map((destino) => ({
          to: destino.to,
          label: t(destino.labelKey),
          icon: destino.icon,
          group: grupo.headingKey ? t(grupo.headingKey) : undefined,
        })),
      ),
    [visibles, t],
  );

  const usuario = me?.user;
  // El rol con el que esta cuenta entró A ESTA municipalidad. Buscado y no asumido: una cuenta puede
  // tener cargos en varias, y mostrar el de otra sería decirle a alguien que es algo que no es acá.
  const cargo = memberships.find(
    (m) => m.tenantId === activeTenant?.id && String(m.portal).toLowerCase() === 'admin',
  );

  return (
    <PageLayout
      footer={footer}
      header={
        <div className="lx-shell-header-row lx-shell-header-row--console">
          <div className="lx-shell-header__identity">
            <Brand name={t('app.name')} />
            {/* Which of the shells you are in, beside the product mark. The mark stays LuParX's;
                this word says whose console this is. */}
            <span className="lx-brand-suffix">{t('nav.portal.admin')}</span>
            {/* The municipality being administered (CONTRACT.md v0.4) — its emblem and short name,
                and the way back to the picker when there is a choice. */}
            <ActiveTenantBadge onOpenSelector={() => navigate('/select-tenant')} />
          </div>

          <div className="lx-shell-header__search">
            <ShellSearch
              placeholder={t('admin.search.placeholder')}
              label={t('common.search')}
              destinationsLabel={t('admin.search.destinations')}
              emptyLabel={t('admin.search.empty')}
              destinations={destinosBuscables}
              onNavigate={(to) => navigate(to)}
              // La búsqueda de datos que de verdad existe: el campo `q` de la lista de usuarios, que
              // ya consulta al servidor. Sólo si la cuenta puede ver esa pantalla.
              freeText={
                permissions.has('USER_READ')
                  ? {
                      label: t('admin.search.inUsers'),
                      onSubmit: (consulta) => navigate(`/users?q=${encodeURIComponent(consulta)}`),
                    }
                  : undefined
              }
            />
          </div>

          <div className="lx-shell-header__account">
            <span className="lx-shell-header__divider" aria-hidden="true" />
            <MenuButton
              label={t('admin.header.account')}
              items={[
                { label: t('nav.profile'), onSelect: () => navigate('/profile') },
                { label: t('auth.logout.action'), onSelect: () => void logout() },
              ]}
            >
              {usuario ? (
                <>
                  <span className="lx-account__initials" aria-hidden="true">
                    {iniciales(usuario.givenName, usuario.familyName)}
                  </span>
                  <span className="lx-account">
                    <span className="lx-account__name">
                      {usuario.givenName} {usuario.familyName}
                    </span>
                    {/* El rol real, traducido con las mismas claves que el resto de la aplicación.
                        Sin cargo en esta municipalidad no se escribe nada: inventar «Administrador»
                        sería afirmar un permiso que el servidor no concedió. */}
                    {cargo ? (
                      <span className="lx-account__role">{t(`role.${cargo.role}` as TranslationKey)}</span>
                    ) : null}
                  </span>
                </>
              ) : (
                <span className="lx-account__name">{t('nav.profile')}</span>
              )}
            </MenuButton>
          </div>
        </div>
      }
      sidebar={
        <div className="lx-nav">
          {visibles.map((grupo, indice) =>
            grupo.headingKey ? (
              <div className="lx-nav-group" key={grupo.headingKey}>
                <strong className="lx-nav-heading">{t(grupo.headingKey)}</strong>
                {grupo.destinos.map((destino) => (
                  <NavItem key={destino.to} to={destino.to} icon={destino.icon}>
                    {t(destino.labelKey)}
                  </NavItem>
                ))}
              </div>
            ) : (
              <React.Fragment key={`grupo-${indice}`}>
                {grupo.destinos.map((destino) => (
                  <NavItem key={destino.to} to={destino.to} icon={destino.icon}>
                    {t(destino.labelKey)}
                  </NavItem>
                ))}
              </React.Fragment>
            ),
          )}
        </div>
      }
    >
      {children}
    </PageLayout>
  );
}
