import * as React from 'react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, RequirePermission } from '@luparx/auth';
import { useTranslation, formatDate, type TranslationKey } from '@luparx/i18n';
import { ApiError, TENANT_GRANTABLE_ROLES, type Role } from '@luparx/api-client';
import { Alert, Badge, Button, Card, Input, SectionHeader, Select, SummaryList, SummaryRow } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

export function UserDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useTranslation();
  const { apiClient, activeTenant, me } = useAuth();
  const queryClient = useQueryClient();
  const [blockReason, setBlockReason] = useState('');
  const [grantRole, setGrantRole] = useState<Role | ''>('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const userQuery = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => apiClient.adminUsers.get(id as string),
    enabled: !!id,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users', id] });
    setActionError(null);
    setFeedback(t('admin.users.detail.actionSuccess'));
  }

  /**
   * Lo que pasa cuando el servidor dice no.
   *
   * <p>Hasta hoy, nada: estas mutaciones sólo tenían `onSuccess`, así que un rechazo del servidor
   * dejaba la pantalla exactamente igual. El caso concreto es el P0 del informe: desde el
   * 02-10-2026 el servidor rechaza con 403 SELF_ACTION_DENIED que un administrador se fuerce el
   * cambio de contraseña a sí mismo —antes le cerraba la sesión, que es la expulsión que se
   * reportó—, y esta pantalla se tragaba ese 403. El resultado para quien lo pulsa es el mismo
   * «pulsé y no pasó nada» de siempre, sólo que ahora sin consecuencias.</p>
   */
  function explicar(error: unknown): void {
    setFeedback(null);
    if (error instanceof ApiError && error.code === 'SELF_ACTION_DENIED') {
      setActionError(t('admin.users.detail.actions.forcePasswordReset.self'));
      return;
    }
    setActionError(t('admin.users.detail.actions.failed'));
  }

  /** Mi propia cuenta: no se ofrece lo que el servidor sólo puede rechazar. */
  const esMiCuenta = Boolean(me?.user?.id) && me?.user?.id === id;

  const blockMutation = useMutation({
    mutationFn: () => apiClient.adminUsers.block(id as string, { reason: blockReason }),
    onSuccess: invalidate,
    onError: explicar,
  });
  const unblockMutation = useMutation({
    mutationFn: () => apiClient.adminUsers.unblock(id as string),
    onSuccess: invalidate,
    onError: explicar,
  });
  const forcePasswordResetMutation = useMutation({
    mutationFn: () => apiClient.adminUsers.forcePasswordReset(id as string),
    onSuccess: invalidate,
    onError: explicar,
  });
  const approveMembershipMutation = useMutation({
    mutationFn: (membershipId: string) => apiClient.adminMemberships.approve(membershipId),
    onSuccess: invalidate,
  });
  // The other half of "the admin creates inspectors" (CONTRACT.md v0.14): most inspectors already
  // exist as people — they registered as citizens like everyone else — and for them the account is
  // not created, only the access is granted. Without this the administrator hit
  // EMAIL_ALREADY_REGISTERED on the create form and had nowhere to go.
  const grantMembershipMutation = useMutation({
    mutationFn: (role: Role) =>
      apiClient.adminMemberships.create({
        userId: id as string,
        tenantId: activeTenant?.id as string,
        // Decided by the role, never asked separately: the server refuses a pair that disagrees.
        portal: role === 'INSPECTOR' || role === 'INSPECTOR_LEAD' ? 'inspector' : 'admin',
        role,
      }),
    onSuccess: () => {
      setGrantError(null);
      setGrantRole('');
      invalidate();
    },
    onError: () => setGrantError(t('admin.users.detail.grant.error')),
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
      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
      {userQuery.isLoading ? <p>{t('common.loading')}</p> : null}
      {user ? (
        <>
          {/*
            «Estado de la cuenta» y no «Estado» (05-10-2026).

            El informe lo llama presentación confusa y acierta: esta pantalla mostraba un «Estado:
            Activo» que es el de la CUENTA de LuParX, mientras abajo el acceso a Escazú decía
            Desactivado. Los dos datos eran correctos y juntos parecían una contradicción, porque
            nada decía que fueran dos cosas distintas.

            Son dos cosas distintas y la lógica depende de que lo sean: desactivar un puesto no
            bloquea la cuenta —la persona sigue entrando como ciudadano— y bloquear la cuenta no
            revoca ningún puesto. El modelo de datos no se toca; lo que cambia es que la pantalla
            dice en voz alta cuál es cuál.
          */}
          <Card>
            <SectionHeader
              title={t('admin.users.detail.account.title')}
              description={t('admin.users.detail.account.description')}
            />
            <SummaryList>
              <SummaryRow
                label={t('user.field.givenName')}
                value={[user.givenName, user.familyName, user.secondFamilyName].filter(Boolean).join(' ')}
              />
              <SummaryRow label={t('user.field.email')} value={user.email} />
              <SummaryRow
                label={t('admin.users.detail.account.title')}
                value={
                  <Badge tone={user.status === 'ACTIVE' ? 'success' : 'danger'}>
                    {t(`admin.users.status.${user.status}` as TranslationKey)}
                  </Badge>
                }
              />
              <SummaryRow label={t('user.field.birthDate')} value={formatDate(user.birthDate, locale)} />
            </SummaryList>
          </Card>

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
              {esMiCuenta ? (
                <p className="lx-text-meta" style={{ margin: 0 }}>
                  {t('admin.users.detail.actions.forcePasswordReset.self')}
                </p>
              ) : (
                <Button type="button" variant="secondary" onClick={() => forcePasswordResetMutation.mutate()} loading={forcePasswordResetMutation.isPending}>
                  {t('admin.users.detail.actions.forcePasswordReset')}
                </Button>
              )}
            </section>
          </RequirePermission>

          <RequirePermission permission="ROLE_ASSIGN">
            <section style={{ marginTop: 16 }}>
              <h2>{t('admin.users.detail.grant.title')}</h2>
              <p className="lx-text-meta">{t('admin.users.detail.grant.description')}</p>
              {grantError ? <Alert tone="danger">{grantError}</Alert> : null}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 220 }}>
                  <Select
                    aria-label={t('admin.users.detail.grant.roleLabel')}
                    value={grantRole}
                    onChange={(value) => setGrantRole(value as Role)}
                    placeholder={t('common.select.placeholder')}
                    options={TENANT_GRANTABLE_ROLES.map((role) => ({
                      value: role,
                      label: t(`role.${role}` as TranslationKey),
                      detail: t(`role.${role}.detail` as TranslationKey),
                    }))}
                  />
                </div>
                <Button
                  type="button"
                  disabled={!grantRole || !activeTenant}
                  loading={grantMembershipMutation.isPending}
                  onClick={() => grantRole && grantMembershipMutation.mutate(grantRole as Role)}
                >
                  {t('admin.users.detail.grant.submit')}
                </Button>
              </div>
            </section>
          </RequirePermission>

          <RequirePermission permission="MEMBERSHIP_APPROVE">
            {/* Un bloque por municipalidad, con su rol y su estado dichos por su nombre. El rol
                salía como el enum crudo —«INSPECTOR_LEAD»— en la única pantalla donde no estaba
                traducido. */}
            <Card>
              <SectionHeader
                title={t('admin.users.detail.access.title')}
                description={t('admin.users.detail.access.description')}
              />
              {user.memberships.length === 0 ? (
                <p className="lx-text-meta">{t('admin.users.detail.access.none')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
                  {user.memberships.map((membership) => (
                    <div key={membership.id ?? `${membership.tenantId}-${membership.portal}`}>
                      <SummaryList>
                        <SummaryRow label={t('user.field.tenant')} value={membership.tenantName} />
                        <SummaryRow
                          label={t('admin.users.detail.access.role')}
                          value={t(`role.${membership.role}` as TranslationKey)}
                        />
                        <SummaryRow
                          label={t('admin.users.detail.access.status')}
                          value={
                            <Badge tone={membership.status === 'ACTIVE' ? 'success' : 'warning'}>
                              {t(`tenant.membership.status.${membership.status}` as TranslationKey)}
                            </Badge>
                          }
                        />
                      </SummaryList>
                      {membership.status === 'PENDING_APPROVAL' && membership.id ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 'var(--lx-space-2)' }}>
                          <Button type="button" onClick={() => approveMembershipMutation.mutate(membership.id as string)}>
                            {t('admin.users.detail.actions.approveMembership')}
                          </Button>
                          <Button type="button" variant="danger" onClick={() => rejectMembershipMutation.mutate(membership.id as string)}>
                            {t('admin.users.detail.actions.rejectMembership')}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </RequirePermission>
        </>
      ) : null}
    </AdminShell>
  );
}
