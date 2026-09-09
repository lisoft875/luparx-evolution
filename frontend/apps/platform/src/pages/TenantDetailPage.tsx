import * as React from 'react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import type { TenantStatus } from '@luparx/api-client';
import { Alert, Badge, Button, FormField, Input, Select } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

const STATUSES: TenantStatus[] = ['ACTIVE', 'SUSPENDED', 'CLOSED'];

export function TenantDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  const [nextStatus, setNextStatus] = useState<TenantStatus>('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminGivenName, setAdminGivenName] = useState('');
  const [adminFamilyName, setAdminFamilyName] = useState('');

  const tenantQuery = useQuery({
    queryKey: ['platform', 'tenants', id],
    queryFn: () => apiClient.platformTenants.get(id as string),
    enabled: !!id,
  });
  const settingsQuery = useQuery({
    queryKey: ['platform', 'tenants', id, 'settings'],
    queryFn: () => apiClient.platformTenants.getSettings(id as string),
    enabled: !!id,
  });
  const [settingsDraft, setSettingsDraft] = useState<string>('');
  React.useEffect(() => {
    if (settingsQuery.data) setSettingsDraft(JSON.stringify(settingsQuery.data, null, 2));
  }, [settingsQuery.data]);

  const statusMutation = useMutation({
    mutationFn: () => apiClient.platformTenants.setStatus(id as string, { status: nextStatus, reason: statusReason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'tenants', id] });
      setFeedback(t('admin.users.detail.actionSuccess'));
    },
  });

  const settingsMutation = useMutation({
    mutationFn: () => apiClient.platformTenants.updateSettings(id as string, JSON.parse(settingsDraft)),
    onSuccess: () => setFeedback(t('platform.tenants.detail.settingsSaved')),
  });

  const createAdminMutation = useMutation({
    mutationFn: () =>
      apiClient.platformTenants.createAdmin(id as string, {
        email: adminEmail,
        givenName: adminGivenName,
        familyName: adminFamilyName,
      }),
    onSuccess: () => {
      setFeedback(t('platform.tenants.detail.createAdminSuccess'));
      setAdminEmail('');
      setAdminGivenName('');
      setAdminFamilyName('');
    },
  });

  const tenant = tenantQuery.data;

  return (
    <PlatformShell>
      <h1>{t('platform.tenants.detail.title')}</h1>
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {tenantQuery.isLoading ? <p>{t('common.loading')}</p> : null}
      {tenant ? (
        <>
          <dl>
            <dt>{t('platform.tenants.column.name')}</dt>
            <dd>{tenant.displayName}</dd>
            <dt>{t('platform.tenants.column.slug')}</dt>
            <dd>{tenant.slug}</dd>
            <dt>{t('platform.tenants.column.country')}</dt>
            <dd>{tenant.countryCode}</dd>
            <dt>{t('platform.tenants.column.currency')}</dt>
            <dd>{tenant.currencyCode}</dd>
            <dt>{t('platform.tenants.column.status')}</dt>
            <dd>
              <Badge tone={tenant.status === 'ACTIVE' ? 'success' : tenant.status === 'SUSPENDED' ? 'warning' : 'danger'}>
                {t(`platform.tenants.status.${tenant.status}` as TranslationKey)}
              </Badge>
            </dd>
          </dl>

          <section style={{ marginTop: 24, maxWidth: 480 }}>
            <h2>{t('platform.tenants.detail.statusSectionTitle')}</h2>
            <FormField label={t('platform.tenants.column.status')}>
              <Select
                value={nextStatus}
                onChange={(value) => setNextStatus(value as TenantStatus)}
                options={STATUSES.map((s) => ({ value: s, label: t(`platform.tenants.status.${s}` as TranslationKey) }))}
              />
            </FormField>
            <FormField label={t('platform.tenants.detail.changeStatusReasonLabel')}>
              <Input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
            </FormField>
            <Button type="button" onClick={() => statusMutation.mutate()} loading={statusMutation.isPending} disabled={!statusReason}>
              {t('platform.tenants.detail.changeStatusSubmit')}
            </Button>
          </section>

          <section style={{ marginTop: 24, maxWidth: 480 }}>
            <h2>{t('platform.tenants.detail.settingsTitle')}</h2>
            <textarea
              className="lx-input"
              style={{ minHeight: 140, fontFamily: 'monospace', fontSize: 13 }}
              value={settingsDraft}
              onChange={(e) => setSettingsDraft(e.target.value)}
            />
            <div style={{ marginTop: 8 }}>
              <Button type="button" variant="secondary" onClick={() => settingsMutation.mutate()} loading={settingsMutation.isPending}>
                {t('platform.tenants.detail.settingsSave')}
              </Button>
            </div>
          </section>

          <section style={{ marginTop: 24, maxWidth: 480 }}>
            <h2>{t('platform.tenants.detail.createAdminTitle')}</h2>
            <FormField label={t('platform.tenants.detail.createAdminEmailLabel')}>
              <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
            </FormField>
            <FormField label={t('platform.tenants.detail.createAdminGivenNameLabel')}>
              <Input value={adminGivenName} onChange={(e) => setAdminGivenName(e.target.value)} />
            </FormField>
            <FormField label={t('platform.tenants.detail.createAdminFamilyNameLabel')}>
              <Input value={adminFamilyName} onChange={(e) => setAdminFamilyName(e.target.value)} />
            </FormField>
            <Button
              type="button"
              onClick={() => createAdminMutation.mutate()}
              loading={createAdminMutation.isPending}
              disabled={!adminEmail || !adminGivenName || !adminFamilyName}
            >
              {t('platform.tenants.detail.createAdminSubmit')}
            </Button>
          </section>
        </>
      ) : null}
    </PlatformShell>
  );
}
