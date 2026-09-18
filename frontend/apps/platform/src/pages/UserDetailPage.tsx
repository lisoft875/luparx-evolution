import * as React from 'react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDate, type TranslationKey } from '@luparx/i18n';
import { PORTALS, type Portal, type Role } from '@luparx/api-client';
import { Alert, Badge, Button, FormField, Input, Select } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

const ROLES: Role[] = [
  'PLATFORM_ADMIN',
  'PLATFORM_SUPPORT',
  'TENANT_ADMIN',
  'TENANT_FINANCE',
  'TENANT_SUPPORT',
  'INSPECTOR',
  'INSPECTOR_LEAD',
  'CITIZEN',
];

export function UserDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  const [blockReason, setBlockReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showGrant, setShowGrant] = useState(false);
  const [grantTenantId, setGrantTenantId] = useState('');
  const [grantPortal, setGrantPortal] = useState<Portal>('admin');
  const [grantRole, setGrantRole] = useState<Role>('TENANT_ADMIN');

  const userQuery = useQuery({
    queryKey: ['platform', 'users', id],
    queryFn: () => apiClient.platformUsers.get(id as string),
    enabled: !!id,
  });
  const tenantsQuery = useQuery({
    queryKey: ['platform', 'tenants', 'all'],
    queryFn: () => apiClient.platformTenants.list({}),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['platform', 'users', id] });
    setFeedback(t('platform.users.detail.actionSuccess'));
  }

  const blockMutation = useMutation({
    mutationFn: () => apiClient.platformUsers.block(id as string, { reason: blockReason }),
    onSuccess: invalidate,
  });
  const unblockMutation = useMutation({
    mutationFn: () => apiClient.platformUsers.unblock(id as string),
    onSuccess: invalidate,
  });
  const forcePasswordResetMutation = useMutation({
    mutationFn: () => apiClient.platformUsers.forcePasswordReset(id as string),
    onSuccess: invalidate,
  });
  const grantMembershipMutation = useMutation({
    mutationFn: () =>
      apiClient.platformMemberships.create({ userId: id as string, tenantId: grantTenantId, portal: grantPortal, role: grantRole }),
    onSuccess: () => {
      invalidate();
      setShowGrant(false);
    },
  });

  const user = userQuery.data;

  return (
    <PlatformShell>
      <h1>{t('platform.users.detail.title')}</h1>
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {userQuery.isLoading ? <p>{t('common.loading')}</p> : null}
      {user ? (
        <>
          <dl>
            <dt>{t('user.field.givenName')}</dt>
            <dd>
              {user.givenName} {user.familyName} {user.secondFamilyName}
            </dd>
            <dt>{t('user.field.email')}</dt>
            <dd>{user.email}</dd>
            <dt>{t('common.status')}</dt>
            <dd>
              <Badge tone={user.status === 'ACTIVE' ? 'success' : user.status === 'BLOCKED' ? 'danger' : 'warning'}>
                {t(`admin.users.status.${user.status}` as TranslationKey)}
              </Badge>
            </dd>
            <dt>{t('user.field.birthDate')}</dt>
            <dd>{formatDate(user.birthDate, locale)}</dd>
          </dl>

          <section style={{ marginTop: 16 }}>
            {user.status === 'BLOCKED' ? (
              <Button type="button" variant="secondary" onClick={() => unblockMutation.mutate()} loading={unblockMutation.isPending}>
                {t('admin.users.detail.actions.unblock')}
              </Button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <Input
                  placeholder={t('admin.users.detail.blockReasonLabel')}
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  aria-label={t('admin.users.detail.blockReasonLabel')}
                />
                <Button type="button" variant="danger" onClick={() => blockMutation.mutate()} loading={blockMutation.isPending} disabled={!blockReason}>
                  {t('admin.users.detail.actions.block')}
                </Button>
              </div>
            )}
          </section>

          <section style={{ marginTop: 16 }}>
            <Button type="button" variant="secondary" onClick={() => forcePasswordResetMutation.mutate()} loading={forcePasswordResetMutation.isPending}>
              {t('admin.users.detail.actions.forcePasswordReset')}
            </Button>
          </section>

          <section style={{ marginTop: 24 }}>
            <h2>{t('platform.users.detail.membershipsTitle')}</h2>
            {user.memberships.length === 0 ? (
              <p className="lx-text-meta">{t('platform.users.detail.noMemberships')}</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {user.memberships.map((membership) => (
                  <li key={membership.id ?? `${membership.tenantId}-${membership.portal}`} style={{ marginBottom: 8 }}>
                    {membership.tenantName} — {membership.portal} — {membership.role} —{' '}
                    {t(`tenant.membership.status.${membership.status}` as TranslationKey)}
                  </li>
                ))}
              </ul>
            )}

            {showGrant ? (
              <div style={{ maxWidth: 420, marginTop: 8 }}>
                <FormField label={t('platform.users.detail.createMembership.tenantLabel')}>
                  <Select
                    value={grantTenantId}
                    onChange={(value) => setGrantTenantId(value)}
                    placeholder={t('common.select.placeholder')}
                    options={(tenantsQuery.data?.items ?? []).map((tenant) => ({ value: tenant.id, label: tenant.displayName }))}
                  />
                </FormField>
                <FormField label={t('platform.users.detail.createMembership.portalLabel')}>
                  <Select
                    value={grantPortal}
                    onChange={(value) => setGrantPortal(value as Portal)}
                    options={PORTALS.filter((p) => p !== 'platform').map((p) => ({ value: p, label: p }))}
                  />
                </FormField>
                <FormField label={t('platform.users.detail.createMembership.roleLabel')}>
                  <Select value={grantRole} onChange={(value) => setGrantRole(value as Role)} options={ROLES.map((r) => ({ value: r, label: r }))} />
                </FormField>
                <Button
                  type="button"
                  onClick={() => grantMembershipMutation.mutate()}
                  loading={grantMembershipMutation.isPending}
                  disabled={!grantTenantId}
                >
                  {t('platform.users.detail.createMembership.submit')}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setShowGrant(true)} style={{ marginTop: 8 }}>
                {t('platform.users.detail.createMembershipCta')}
              </Button>
            )}
          </section>
        </>
      ) : null}
    </PlatformShell>
  );
}
