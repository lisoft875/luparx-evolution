import * as React from 'react';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import type { RegisteredUsersGroupBy } from '@luparx/api-client';
import { Button, Select, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

const GROUP_BY_OPTIONS: RegisteredUsersGroupBy[] = ['tenant', 'country', 'portal', 'month'];

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function ReportsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const [groupBy, setGroupBy] = useState<RegisteredUsersGroupBy>('tenant');
  const [from] = useState(isoDaysAgo(365));
  const [to] = useState(isoDaysAgo(0));

  const query = useQuery({
    queryKey: ['admin', 'reports', 'registered-users', { from, to, groupBy }],
    queryFn: () => apiClient.adminReports.registeredUsers({ from, to, groupBy }),
  });

  const exportMutation = useMutation({
    // TODO(extension): v0.1 exports are synchronous CSV (<=10k rows, CONTRACT.md §4); poll `exportId` once async exports ship.
    mutationFn: () => apiClient.adminExports.create({ type: 'registered-users', filters: { from, to, groupBy } }),
  });

  return (
    <AdminShell>
      <h1>{t('admin.reports.registeredUsers.title')}</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <Select
          aria-label={t('admin.reports.registeredUsers.groupBy')}
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as RegisteredUsersGroupBy)}
          options={GROUP_BY_OPTIONS.map((option) => ({
            value: option,
            label: t(`admin.reports.registeredUsers.groupBy.${option}` as TranslationKey),
          }))}
        />
        <Button type="button" variant="secondary" onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>
          {t('admin.reports.registeredUsers.export')}
        </Button>
      </div>
      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.reports.registeredUsers.empty')}
        rows={query.data ?? []}
        rowKey={(row) => row.group}
        columns={[
          { key: 'group', header: t('admin.reports.registeredUsers.column.group'), render: (row) => row.group },
          { key: 'count', header: t('admin.reports.registeredUsers.column.count'), render: (row) => row.count },
        ]}
      />
    </AdminShell>
  );
}
