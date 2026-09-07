import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDateTime } from '@luparx/i18n';
import { Badge, Card, Table } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

/**
 * TODO(extension): CONTRACT.md §4 marks `/api/v1/platform/system/**` as
 * "preparado, no cerrado" — health/feature-flags/jobs are read-only here on
 * purpose; what else this screen controls (billing, plans, usage limits,
 * payment-integration toggles) is defined later, as new resources under this
 * same prefix, without breaking the routes already wired below.
 */
export function SystemPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();

  const healthQuery = useQuery({ queryKey: ['platform', 'system', 'health'], queryFn: () => apiClient.platformSystem.health() });
  const flagsQuery = useQuery({ queryKey: ['platform', 'system', 'feature-flags'], queryFn: () => apiClient.platformSystem.featureFlags() });
  const jobsQuery = useQuery({ queryKey: ['platform', 'system', 'jobs'], queryFn: () => apiClient.platformSystem.jobs() });

  return (
    <PlatformShell>
      <h1>{t('platform.system.title')}</h1>
      <p className="lx-field__hint">{t('platform.system.extensionNotice')}</p>

      <Card>
        <p className="lx-text-card-title" style={{ margin: '0 0 var(--lx-space-3) 0' }}>
          {t('platform.system.health.title')}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone={healthQuery.data?.status === 'UP' ? 'success' : 'danger'}>{healthQuery.data?.status ?? '…'}</Badge>
          {(healthQuery.data?.components ?? []).map((component) => (
            <Badge key={component.name} tone={component.status === 'UP' ? 'success' : component.status === 'DEGRADED' ? 'warning' : 'danger'}>
              {component.name}: {component.status}
            </Badge>
          ))}
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <p className="lx-text-card-title" style={{ margin: '0 0 var(--lx-space-3) 0' }}>
          {t('platform.system.featureFlags.title')}
        </p>
        <Table
          loading={flagsQuery.isLoading}
          loadingLabel={t('common.loading')}
          emptyLabel={t('common.empty')}
          rows={flagsQuery.data ?? []}
          rowKey={(row) => row.key}
          columns={[
            { key: 'key', header: t('platform.catalogs.adminLevels.column.labelKey'), render: (row) => row.key },
            { key: 'enabled', header: t('common.status'), render: (row) => <Badge tone={row.enabled ? 'success' : 'neutral'}>{row.enabled ? t('common.yes') : t('common.no')}</Badge> },
            { key: 'description', header: t('common.actions'), render: (row) => row.description ?? '' },
          ]}
        />
      </Card>

      <Card style={{ marginTop: 16 }}>
        <p className="lx-text-card-title" style={{ margin: '0 0 var(--lx-space-3) 0' }}>
          {t('platform.system.jobs.title')}
        </p>
        <Table
          loading={jobsQuery.isLoading}
          loadingLabel={t('common.loading')}
          emptyLabel={t('common.empty')}
          rows={jobsQuery.data ?? []}
          rowKey={(row) => row.name}
          columns={[
            { key: 'name', header: t('admin.audit.column.action'), render: (row) => row.name },
            { key: 'status', header: t('common.status'), render: (row) => row.status },
            { key: 'lastRunAt', header: t('admin.audit.column.occurredAt'), render: (row) => (row.lastRunAt ? formatDateTime(row.lastRunAt, locale) : '—') },
          ]}
        />
      </Card>
    </PlatformShell>
  );
}
