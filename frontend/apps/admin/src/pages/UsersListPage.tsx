import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RequirePermission, useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import type { Portal, Role, UserStatus } from '@luparx/api-client';
import { Button, Input, Pagination, Select, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

const PAGE_SIZE = 20;
const ROLES: Role[] = [
  'PLATFORM_ADMIN',
  'TENANT_ADMIN',
  'TENANT_FINANCE',
  'TENANT_SUPPORT',
  'INSPECTOR',
  'INSPECTOR_LEAD',
  'CITIZEN',
];
const STATUSES: UserStatus[] = ['ACTIVE', 'BLOCKED', 'PENDING_VERIFICATION'];
const PORTALS_FILTER: Portal[] = ['citizen', 'admin', 'inspector'];

export function UsersListPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
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

  return (
    <AdminShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1>{t('admin.users.title')}</h1>
        {/* Granting a role is what this leads to, so it is `ROLE_ASSIGN` that decides whether the
            button is there — the same permission the route and the endpoint check. */}
        <RequirePermission permission="ROLE_ASSIGN">
          <Button type="button" onClick={() => navigate('/users/new')}>
            {t('admin.users.create.cta')}
          </Button>
        </RequirePermission>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
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
          options={ROLES.map((r) => ({ value: r, label: r }))}
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
                onClick={() => navigate(`/users/${row.id}`)}
                style={{ background: 'none', border: 'none', color: 'var(--lx-primary)', cursor: 'pointer', padding: 0, font: 'inherit' }}
              >
                {row.fullName}
              </button>
            ),
          },
          { key: 'email', header: t('admin.users.column.email'), render: (row) => row.email },
          {
            key: 'status',
            header: t('admin.users.column.status'),
            render: (row) => t(`admin.users.status.${row.status}` as TranslationKey),
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
