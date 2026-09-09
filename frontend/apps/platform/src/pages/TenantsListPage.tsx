import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import type { TenantStatus } from '@luparx/api-client';
import { Badge, Button, Input, Select, Table } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

const STATUSES: TenantStatus[] = ['ACTIVE', 'SUSPENDED', 'CLOSED'];

function badgeToneFor(status: TenantStatus): 'success' | 'warning' | 'danger' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SUSPENDED') return 'warning';
  return 'danger';
}

export function TenantsListPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TenantStatus | ''>('');

  const query = useQuery({
    queryKey: ['platform', 'tenants', { q, status }],
    queryFn: () => apiClient.platformTenants.list({ q: q || undefined, status: status || undefined }),
  });

  return (
    <PlatformShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1>{t('platform.tenants.title')}</h1>
        <Button type="button" onClick={() => navigate('/tenants/new')}>
          {t('platform.tenants.createCta')}
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Input
          placeholder={t('platform.tenants.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t('common.search')}
        />
        <Select
          aria-label={t('platform.tenants.filter.status')}
          value={status}
          onChange={(value) => setStatus(value as TenantStatus | '')}
          placeholder={t('platform.tenants.filter.allStatuses')}
          options={STATUSES.map((s) => ({ value: s, label: t(`platform.tenants.status.${s}` as TranslationKey) }))}
        />
      </div>
      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('platform.tenants.empty')}
        rows={query.data ?? []}
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'name',
            header: t('platform.tenants.column.name'),
            render: (row) => (
              <button
                type="button"
                onClick={() => navigate(`/tenants/${row.id}`)}
                style={{ background: 'none', border: 'none', color: 'var(--lx-primary)', cursor: 'pointer', padding: 0, font: 'inherit' }}
              >
                {row.displayName}
              </button>
            ),
          },
          { key: 'slug', header: t('platform.tenants.column.slug'), render: (row) => row.slug },
          { key: 'country', header: t('platform.tenants.column.country'), render: (row) => row.countryCode },
          { key: 'currency', header: t('platform.tenants.column.currency'), render: (row) => row.currencyCode },
          {
            key: 'status',
            header: t('platform.tenants.column.status'),
            render: (row) => <Badge tone={badgeToneFor(row.status)}>{t(`platform.tenants.status.${row.status}` as TranslationKey)}</Badge>,
          },
        ]}
      />
    </PlatformShell>
  );
}
