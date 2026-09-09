import * as React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import type { RegisteredUsersGroupBy } from '@luparx/api-client';
import { Select, Table } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

const GROUP_BY_OPTIONS: RegisteredUsersGroupBy[] = ['tenant', 'country', 'portal', 'month'];

export function ReportsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const [groupBy, setGroupBy] = useState<RegisteredUsersGroupBy>('tenant');

  const query = useQuery({
    queryKey: ['platform', 'reports', 'registered-users', groupBy],
    queryFn: () => apiClient.platformReports.registeredUsers({ groupBy }),
  });

  return (
    <PlatformShell>
      <h1>{t('admin.reports.registeredUsers.title')}</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <Select
          aria-label={t('admin.reports.registeredUsers.groupBy')}
          value={groupBy}
          onChange={(value) => setGroupBy(value as RegisteredUsersGroupBy)}
          options={GROUP_BY_OPTIONS.map((option) => ({
            value: option,
            label: t(`admin.reports.registeredUsers.groupBy.${option}` as TranslationKey),
          }))}
        />
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
    </PlatformShell>
  );
}
