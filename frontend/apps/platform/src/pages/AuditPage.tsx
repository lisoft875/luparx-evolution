import * as React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDateTime } from '@luparx/i18n';
import { Input, Pagination, Select, Table } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

const PAGE_SIZE = 20;

export function AuditPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const [action, setAction] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [page, setPage] = useState(0);

  const tenantsQuery = useQuery({
    queryKey: ['platform', 'tenants', 'all'],
    queryFn: () => apiClient.platformTenants.list({}),
  });

  const query = useQuery({
    queryKey: ['platform', 'audit-events', { action, tenantId, page }],
    queryFn: () => apiClient.platformAudit.list({ action: action || undefined, tenantId: tenantId || undefined, page, size: PAGE_SIZE }),
  });
  const data = query.data;

  return (
    <PlatformShell>
      <h1>{t('admin.audit.title')}</h1>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Input
          placeholder={t('admin.audit.filter.action')}
          value={action}
          onChange={(e) => {
            setPage(0);
            setAction(e.target.value);
          }}
          aria-label={t('admin.audit.filter.action')}
        />
        <Select
          aria-label={t('platform.audit.filter.tenant')}
          value={tenantId}
          onChange={(value) => {
            setPage(0);
            setTenantId(value);
          }}
          placeholder={t('platform.audit.filter.allTenants')}
          options={(tenantsQuery.data?.items ?? []).map((tenant) => ({ value: tenant.id, label: tenant.displayName }))}
        />
      </div>
      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.audit.empty')}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'actor',
            header: t('admin.audit.column.actor'),
            // Named here too (v0.33). This is the screen that reads across municipalities, so "who"
            // is the whole question: an operator's own crossings into a council's data are in here.
            render: (row) =>
              row.actorUserId
                ? (row.actorName ?? row.actorUserId.slice(0, 8))
                : t('admin.audit.actor.system'),
          },
          { key: 'action', header: t('admin.audit.column.action'), render: (row) => row.action },
          {
            key: 'resource',
            header: t('admin.audit.column.resource'),
            render: (row) => (row.resourceId ? `${row.resourceType}/${row.resourceId}` : row.resourceType),
          },
          {
            key: 'origin',
            header: t('admin.audit.column.origin'),
            render: (row) => row.device ?? t('admin.audit.origin.system'),
          },
          { key: 'tenant', header: t('platform.audit.filter.tenant'), render: (row) => row.tenantId ?? '—' },
          { key: 'occurredAt', header: t('admin.audit.column.occurredAt'), render: (row) => formatDateTime(row.occurredAt, locale) },
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
