import * as React from 'react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, RequirePermission } from '@luparx/auth';
import { useTranslation, formatDate, type TranslationKey } from '@luparx/i18n';
import { Alert, Button, Input } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

export function UserDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const [blockReason, setBlockReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const userQuery = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => apiClient.adminUsers.get(id as string),
    enabled: !!id,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users', id] });
    setFeedback(t('admin.users.detail.actionSuccess'));
  }

  const blockMutation = useMutation({
    mutationFn: () => apiClient.adminUsers.block(id as string, { reason: blockReason }),
    onSuccess: invalidate,
  });
  const unblockMutation = useMutation({
    mutationFn: () => apiClient.adminUsers.unblock(id as string),
    onSuccess: invalidate,
  });
  const forcePasswordResetMutation = useMutation({
    mutationFn: () => apiClient.adminUsers.forcePasswordReset(id as string),
    onSuccess: invalidate,
  });
  const requireMfaMutation = useMutation({
    mutationFn: (required: boolean) => apiClient.adminUsers.requireMfa(id as string, { required }),
    onSuccess: invalidate,
  });
  const approveMembershipMutation = useMutation({
    mutationFn: (membershipId: string) => apiClient.adminMemberships.approve(membershipId),
    onSuccess: invalidate,
  });
  const rejectMembershipMutation = useMutation({
    mutationFn: (membershipId: string) => apiClient.adminMemberships.reject(membershipId, { reason: t('admin.users.detail.rejectReasonLabel') }),
    onSuccess: invalidate,
  });

  const user = userQuery.data;

  return (
    <AdminShell>
      <h1>{t('admin.users.detail.title')}</h1>
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
            <dd>{t(`admin.users.status.${user.status}` as TranslationKey)}</dd>
            <dt>{t('user.field.birthDate')}</dt>
            <dd>{formatDate(user.birthDate, locale)}</dd>
          </dl>

          <RequirePermission permission="USER_BLOCK">
            <section>
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
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => blockMutation.mutate()}
                    loading={blockMutation.isPending}
                    disabled={!blockReason}
                  >
                    {t('admin.users.detail.actions.block')}
                  </Button>
                </div>
              )}
            </section>
          </RequirePermission>

          <RequirePermission permission="USER_WRITE">
            <section style={{ marginTop: 16 }}>
              <Button type="button" variant="secondary" onClick={() => forcePasswordResetMutation.mutate()} loading={forcePasswordResetMutation.isPending}>
                {t('admin.users.detail.actions.forcePasswordReset')}
              </Button>{' '}
              <Button
                type="button"
                variant="secondary"
                onClick={() => requireMfaMutation.mutate(!user.mfaRequired)}
                loading={requireMfaMutation.isPending}
              >
                {t('admin.users.detail.actions.requireMfa')} ({user.mfaRequired ? t('common.yes') : t('common.no')})
              </Button>
              {/* TODO(extension): role assignment UI — needs a role picker wired to POST /admin/memberships once zones/scopes are defined. */}
            </section>
          </RequirePermission>

          <RequirePermission permission="MEMBERSHIP_APPROVE">
            <section style={{ marginTop: 16 }}>
              <h2>{t('user.field.tenant')}</h2>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {user.memberships.map((membership) => (
                  <li key={membership.id ?? `${membership.tenantId}-${membership.portal}`} style={{ marginBottom: 8 }}>
                    {membership.tenantName} — {membership.role} — {t(`tenant.membership.status.${membership.status}` as TranslationKey)}
                    {membership.status === 'PENDING_APPROVAL' && membership.id ? (
                      <>
                        {' '}
                        <Button type="button" onClick={() => approveMembershipMutation.mutate(membership.id as string)}>
                          {t('admin.users.detail.actions.approveMembership')}
                        </Button>{' '}
                        <Button type="button" variant="danger" onClick={() => rejectMembershipMutation.mutate(membership.id as string)}>
                          {t('admin.users.detail.actions.rejectMembership')}
                        </Button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </RequirePermission>
        </>
      ) : null}
    </AdminShell>
  );
}
