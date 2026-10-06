import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ROLES, RequirePermission, useAuth } from '@luparx/auth';
import { roleLabel, useTranslation, type TranslationKey } from '@luparx/i18n';
import type { AdminUserListItem, Portal, Role, UserStatus } from '@luparx/api-client';
import { Badge, Button, Card, IconPlus, Input, Pagination, Select, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

const PAGE_SIZE = 20;

/*
  Los roles del filtro salen de `ROLES`, el catálogo de `@luparx/auth` (06-10-2026).

  Acá había una lista escrita a mano con SIETE roles. El tipo `Role` tiene nueve: faltaban
  `PLATFORM_SUPPORT` y `TENANT_INTEGRATION`, que existen en el servidor y por los que no se podía
  filtrar. No fallaba nada, simplemente no estaban — que es la peor forma de que falte algo.
*/
const STATUSES: UserStatus[] = ['ACTIVE', 'BLOCKED', 'PENDING_VERIFICATION'];
const PORTALS_FILTER: Portal[] = ['citizen', 'admin', 'inspector'];

/** El tono de cada estado de cuenta. Explícito y no una expresión: son tres y se leen de un golpe. */
const TONO_ESTADO: Record<UserStatus, 'success' | 'danger' | 'warning'> = {
  ACTIVE: 'success',
  BLOCKED: 'danger',
  PENDING_VERIFICATION: 'warning',
};

/**
 * Los roles que esta persona tiene, sin repetir y con nombre humano.
 *
 * <p>Sale de `memberships`, que es lo que el endpoint ya manda: no se infiere nada. Una persona
 * puede tener cargo en más de una municipalidad y con roles distintos —un fiscalizador en Escazú y
 * soporte en San José—, así que la celda lista los roles DISTINTOS y no uno elegido por azar. Sin
 * cargos no se escribe un guión: se dice que no tiene rol asignado, que es un estado real y no un
 * dato ausente.</p>
 */
function rolesDe(
  fila: AdminUserListItem,
  t: (key: TranslationKey) => string,
): string {
  const distintos = [...new Set(fila.memberships.map((m) => m.role))];
  if (distintos.length === 0) return t('admin.users.noRole');
  return distintos.map((rol) => roleLabel(t, rol)).join(' · ');
}

/**
 * Las personas registradas y sus accesos (Fase 1 del plan de Administración, 06-10-2026).
 *
 * <h2>Los códigos internos dejaron de verse, y cómo</h2>
 *
 * <p>El desplegable de Rol dibujaba `{ value: r, label: r }`: el enum crudo como etiqueta. Era el
 * único de los tres filtros que lo hacía —Estado y Portal ya traducían—, así que no fue un descuido
 * de diseño sino una línea que se quedó sin terminar en una pantalla donde el patrón correcto estaba
 * escrito dos veces al lado.</p>
 *
 * <p>La etiqueta viene de `roleLabel`, que lee las claves `role.*` de i18n: la MISMA fuente que usan
 * la pantalla de Roles y el menú de cuenta. No se creó un segundo mapa de etiquetas, que es lo que
 * la Fase 1 prohíbe y lo que hizo que INSPECTOR_LEAD fuera «Jefe de fiscalización» en un sitio y
 * «Supervisor de fiscalización» en otro.</p>
 *
 * <p>El `value` sigue siendo el código. Elegir «Jefe de fiscalización» manda `INSPECTOR_LEAD` al
 * servidor, igual que antes: lo que cambió es lo que la persona lee, no lo que viaja.</p>
 */
export function UsersListPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();

  /*
    El texto de búsqueda arranca de la URL (06-10-2026).

    El buscador de la cabecera ofrece «Buscar «x» en Usuarios» y navega a `/users?q=x`. Sin esto esa
    fila habría abierto la lista completa con el campo vacío: una acción que dice que busca y no
    busca. `useState` con valor inicial y no un `useEffect` que sincroniza: la lista tiene que salir
    ya filtrada en su PRIMERA consulta, no pedir todo y volver a pedir filtrado.

    Sigue siendo estado local después: quien escribe en el campo está refinando lo que ve, y meter
    cada letra en la URL llenaría el historial del navegador de pasos intermedios.
  */
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [portal, setPortal] = useState<Portal | ''>('');
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ['admin', 'users', { q, role, status, portal, page }],
    queryFn: () =>
      apiClient.adminUsers.list({
        q: q || undefined,
        role: role || undefined,
        status: status || undefined,
        portal: portal || undefined,
        page,
        size: PAGE_SIZE,
      }),
  });

  const data = query.data;

  // El `value` es el código y el `label` el nombre humano. Memorizado porque depende del idioma
  // activo y no de lo que la persona escriba en el buscador de al lado.
  const opcionesDeRol = useMemo(
    () => ROLES.map((rol) => ({ value: rol, label: roleLabel(t, rol) })),
    [t],
  );

  return (
    <AdminShell>
      <div className="lx-page-header">
        <div className="lx-page-header__group">
          <h1>{t('admin.users.title')}</h1>
          <p className="lx-page-header__subtitle">{t('admin.users.subtitle')}</p>
        </div>
        {/* Granting a role is what this leads to, so it is `ROLE_ASSIGN` that decides whether the
            button is there — the same permission the route and the endpoint check. */}
        <RequirePermission permission="ROLE_ASSIGN">
          <Button type="button" onClick={() => navigate('/users/new')}>
            <IconPlus size={18} />
            {t('admin.users.create.cta')}
          </Button>
        </RequirePermission>
      </div>

      {/* Búsqueda y filtros como UN bloque, que es lo que pide la Fase 1 §3.2. Eran cuatro controles
          sueltos en un `flex` con `marginBottom: 16`, así que a cualquier ancho intermedio se
          repartían en dos filas desparejas y la tabla empezaba lejos. Dentro de una tarjeta se leen
          como lo que son —la forma de acotar la lista de abajo— y el espacio hasta la tabla lo pone
          el `gap` del shell, una sola vez. */}
      <Card>
        <div className="lx-filter-row lx-filter-row--search">
          <Input
            placeholder={t('admin.users.searchPlaceholder')}
            value={q}
            onChange={(e) => {
              setPage(0);
              setQ(e.target.value);
            }}
            aria-label={t('common.search')}
          />
          <Select
            aria-label={t('admin.users.filter.role')}
            value={role}
            onChange={(value) => {
              setPage(0);
              setRole(value as Role | '');
            }}
            placeholder={t('admin.users.filter.allRoles')}
            options={opcionesDeRol}
          />
          <Select
            aria-label={t('admin.users.filter.status')}
            value={status}
            onChange={(value) => {
              setPage(0);
              setStatus(value as UserStatus | '');
            }}
            placeholder={t('admin.users.filter.allStatuses')}
            options={STATUSES.map((s) => ({ value: s, label: t(`admin.users.status.${s}` as TranslationKey) }))}
          />
          <Select
            aria-label={t('admin.users.filter.portal')}
            value={portal}
            onChange={(value) => {
              setPage(0);
              setPortal(value as Portal | '');
            }}
            placeholder={t('admin.users.filter.allPortals')}
            // La etiqueta era el slug tal cual: «citizen», «admin», «inspector». El filtro además
            // respondía 400, porque Spring convierte un enum con `valueOf` y eso distingue mayúsculas
            // (ver PortalParameterConfiguration). Arreglado el 400, ponerle nombre es lo que faltaba.
            options={PORTALS_FILTER.map((p) => ({ value: p, label: t(`portal.${p}` as TranslationKey) }))}
          />
        </div>
      </Card>

      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.users.empty')}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'name',
            header: t('admin.users.column.name'),
            render: (row) => (
              <button
                type="button"
                className="lx-link-button"
                onClick={() => navigate(`/users/${row.id}`)}
              >
                {row.fullName}
              </button>
            ),
          },
          { key: 'email', header: t('admin.users.column.email'), render: (row) => row.email },
          {
            key: 'role',
            header: t('admin.users.column.role'),
            // El dato ya venía en la respuesta; lo que no había era columna. No se infiere ni se
            // inventa: si no hay cargos, lo dice.
            render: (row) => rolesDe(row, t),
          },
          {
            key: 'status',
            // «Estado de cuenta» y no «Estado» (Fase 1 §3.4): es el estado GLOBAL de la persona en
            // LuParX, no el de su cargo en esta municipalidad. Esa distinción es la que el hallazgo
            // del 05-10 pedía dejar clara, y acá se resuelve con el nombre de la columna.
            header: t('admin.users.column.accountStatus'),
            render: (row) => (
              <Badge dot tone={TONO_ESTADO[row.status]}>
                {t(`admin.users.status.${row.status}` as TranslationKey)}
              </Badge>
            ),
          },
          {
            key: 'tenant',
            header: t('admin.users.column.tenant'),
            render: (row) => row.memberships.map((m) => m.tenantName).join(', '),
          },
        ]}
      />
      {data ? (
        <Pagination
          page={data.page}
          size={data.size}
          totalPages={data.totalPages}
          totalElements={data.totalElements}
          onPageChange={setPage}
          previousLabel={t('pagination.previous')}
          nextLabel={t('pagination.next')}
          pageLabel={t('pagination.page')}
          ofLabel={t('pagination.of')}
          resultCountLabel={t('pagination.resultCount.other', { count: data.totalElements })}
        />
      ) : null}
    </AdminShell>
  );
}
