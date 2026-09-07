import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import type { UserStatus } from '@luparx/api-client';
import { Input, Pagination, Select, Table } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

const PAGE_SIZE = 20;
const STATUSES: UserStatus[] = ['ACTIVE', 'BLOCKED', 'PENDING_VERIFICATION'];

export function UsersListPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ['platform', 'users', { q, status, page }],
    queryFn: () =>
      apiClient.platformUsers.list({
        q: q || undefined,
        status: status || undefined,
        page,
        size: PAGE_SIZE,
      }),
  });

  const data = query.data;

  return (
    <PlatformShell>
      <h1>{t('platform.users.title')}</h1>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Input
          placeholder={t('platform.users.searchPlaceholder')}
          value={q}
          onChange={(e) => {
            setPage(0);
            setQ(e.target.value);
          }}
          aria-label={t('common.search')}
        />
        <Select
          aria-label={t('platform.users.filter.status')}
          value={status}
          onChange={(e) => {
            setPage(0);
            setStatus(e.target.value as UserStatus | '');
          }}
          placeholder={t('platform.users.filter.allStatuses')}
          options={STATUSES.map((s) => ({ value: s, label: t(`admin.users.status.${s}` as TranslationKey) }))}
        />
      </div>
      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('platform.users.empty')}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'name',
            header: t('platform.users.column.name'),
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
          { key: 'email', header: t('platform.users.column.email'), render: (row) => row.email },
          {
            key: 'status',
            header: t('platform.users.column.status'),
            render: (row) => t(`admin.users.status.${row.status}` as TranslationKey),
          },
          {
            key: 'memberships',
            header: t('platform.users.column.memberships'),
            render: (row) => row.memberships.map((m) => `${m.tenantName} (${m.portal})`).join(', '),
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
    </PlatformShell>
  );
}
