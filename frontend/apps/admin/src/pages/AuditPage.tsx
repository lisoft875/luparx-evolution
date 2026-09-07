import * as React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDateTime } from '@luparx/i18n';
import { Input, Pagination, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

const PAGE_SIZE = 20;

export function AuditPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const [action, setAction] = useState('');
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ['admin', 'audit-events', { action, page }],
    queryFn: () => apiClient.adminAudit.list({ action: action || undefined, page, size: PAGE_SIZE }),
  });
  const data = query.data;

  return (
    <AdminShell>
      <h1>{t('admin.audit.title')}</h1>
      <Input
        placeholder={t('admin.audit.filter.action')}
        value={action}
        onChange={(e) => {
          setPage(0);
          setAction(e.target.value);
        }}
        aria-label={t('admin.audit.filter.action')}
        style={{ marginBottom: 16 }}
      />
      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.audit.empty')}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        columns={[
          { key: 'actor', header: t('admin.audit.column.actor'), render: (row) => row.actorUserId },
          { key: 'action', header: t('admin.audit.column.action'), render: (row) => row.action },
          { key: 'resource', header: t('admin.audit.column.resource'), render: (row) => `${row.resourceType}/${row.resourceId}` },
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
    </AdminShell>
  );
}
