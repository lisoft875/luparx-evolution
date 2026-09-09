import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequirePermission, useAuth } from '@luparx/auth';
import { useTranslation, formatDateTime, type TranslationKey } from '@luparx/i18n';
import type { MembershipStatus, StaffMember } from '@luparx/api-client';
import { Alert, Badge, Button, Input, Modal, Pagination, Select, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

const PAGE_SIZE = 20;

/** The colour of a post's state. Never the only signal — the label beside it says the same thing. */
const STATUS_TONE: Record<MembershipStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  PENDING_APPROVAL: 'neutral',
  REJECTED: 'danger',
  REVOKED: 'danger',
};

/**
 * The staff administration panel of a municipality (CONTRACT.md v0.15).
 *
 * <p>One row per <em>post</em> and not per person: the same person can be an inspector here and
 * something else elsewhere, and each post answers the same four questions — who holds it, what it
 * lets them do, which sectors it covers, and whether the account is still being used.</p>
 *
 * <p>Suspended and revoked posts stay on the list. This is where a suspension is lifted, and where
 * somebody looks up months later who held a post in March; a list that dropped them would answer
 * neither. What is never dropped is what they did: deactivating an officer does not touch a single
 * citation, and the panel says so where the action is taken rather than in a manual.</p>
 */
export function StaffPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<MembershipStatus | ''>('');
  const [page, setPage] = useState(0);
  const [suspending, setSuspending] = useState<StaffMember | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [zoning, setZoning] = useState<StaffMember | null>(null);
  const [zoneSelection, setZoneSelection] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'staff', { status, page }],
    queryFn: () => apiClient.adminStaff.list({ status: status || undefined, page, size: PAGE_SIZE }),
  });

  // The municipality's own sectors, for the assignment dialog. The same list the inspector app is
  // offered, so an administrator cannot assign something that does not exist to work in.
  const zonesQuery = useQuery({
    queryKey: ['admin', 'zones'],
    queryFn: () => apiClient.adminParking.zones(),
  });

  function afterChange(message: TranslationKey): () => void {
    return () => {
      setError(null);
      setFeedback(t(message));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
    };
  }
  function onFailure(): void {
    setFeedback(null);
    setError(t('admin.staff.error'));
  }

  const suspendMutation = useMutation({
    mutationFn: (member: StaffMember) =>
      apiClient.adminStaff.suspend(member.membershipId, { reason: suspendReason.trim() || undefined }),
    onSuccess: () => {
      setSuspending(null);
      setSuspendReason('');
      afterChange('admin.staff.suspended')();
    },
    onError: onFailure,
  });
  const reactivateMutation = useMutation({
    mutationFn: (member: StaffMember) => apiClient.adminStaff.reactivate(member.membershipId),
    onSuccess: afterChange('admin.staff.reactivated'),
    onError: onFailure,
  });
  const revokeMutation = useMutation({
    mutationFn: (member: StaffMember) => apiClient.adminMemberships.remove(member.membershipId),
    onSuccess: afterChange('admin.staff.revoked'),
    onError: onFailure,
  });
  const resetMutation = useMutation({
    mutationFn: (member: StaffMember) => apiClient.adminUsers.forcePasswordReset(member.userId),
    onSuccess: afterChange('admin.staff.resetSent'),
    onError: onFailure,
  });
  const zonesMutation = useMutation({
    mutationFn: (member: StaffMember) =>
      apiClient.adminStaff.assignZones(member.membershipId, { zoneIds: zoneSelection }),
    onSuccess: () => {
      setZoning(null);
      afterChange('admin.staff.zonesAssigned')();
    },
    onError: onFailure,
  });

  const data = query.data;

  return (
    <AdminShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1>{t('admin.staff.title')}</h1>
        <RequirePermission permission="ROLE_ASSIGN">
          <Button type="button" onClick={() => navigate('/users/new')}>
            {t('admin.users.create.cta')}
          </Button>
        </RequirePermission>
      </div>
      <p className="lx-text-meta">{t('admin.staff.description')}</p>

      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div style={{ maxWidth: 260, margin: '12px 0' }}>
        <Select
          aria-label={t('admin.staff.filter.status')}
          value={status}
          onChange={(value) => {
            setPage(0);
            setStatus(value as MembershipStatus | '');
          }}
          placeholder={t('admin.staff.filter.all')}
          options={(['ACTIVE', 'SUSPENDED', 'REVOKED', 'PENDING_APPROVAL'] as MembershipStatus[]).map((s) => ({
            value: s,
            label: t(`tenant.membership.status.${s}` as TranslationKey),
          }))}
        />
      </div>

      {query.isLoading ? <p>{t('common.loading')}</p> : null}
      {data ? (
        <>
          <Table
            loading={query.isLoading}
            loadingLabel={t('common.loading')}
            emptyLabel={t('admin.staff.empty')}
            rows={data.items}
            rowKey={(row) => row.membershipId}
            columns={[
              {
                key: 'name',
                header: t('admin.staff.column.person'),
                render: (member) => (
                  <>
                    <div>{member.fullName ?? '\u2014'}</div>
                    <div className="lx-text-meta">{member.email}</div>
                  </>
                ),
              },
              {
                key: 'role',
                header: t('admin.staff.column.role'),
                render: (member) => t(`role.${member.role}` as TranslationKey),
              },
              {
                key: 'status',
                header: t('admin.staff.column.status'),
                render: (member) => (
                  <>
                    <Badge tone={STATUS_TONE[member.status]}>
                      {t(`tenant.membership.status.${member.status}` as TranslationKey)}
                    </Badge>
                    {member.statusReason ? <div className="lx-text-meta">{member.statusReason}</div> : null}
                  </>
                ),
              },
              {
                key: 'zones',
                header: t('admin.staff.column.zones'),
                // "Todas" is the honest reading of an empty assignment and the one the server acts
                // on — a blank cell would let an administrator believe somebody is restricted when
                // they are not.
                render: (member) =>
                  member.zones.length === 0
                    ? t('admin.staff.zones.all')
                    : member.zones.map((zone) => zone.name).join(', '),
              },
              {
                key: 'lastLogin',
                header: t('admin.staff.column.lastLogin'),
                render: (member) =>
                  member.lastLoginAt ? formatDateTime(member.lastLoginAt, locale) : t('admin.staff.lastLogin.never'),
              },
              {
                key: 'actions',
                header: t('admin.staff.column.actions'),
                render: (member) => (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <RequirePermission permission="ZONE_ASSIGN">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setZoning(member);
                          setZoneSelection(member.zones.map((zone) => zone.zoneId));
                        }}
                      >
                        {t('admin.staff.action.zones')}
                      </Button>
                    </RequirePermission>
                    <RequirePermission permission="ROLE_ASSIGN">
                      {member.status === 'SUSPENDED' ? (
                        <Button type="button" variant="secondary" onClick={() => reactivateMutation.mutate(member)}>
                          {t('admin.staff.action.reactivate')}
                        </Button>
                      ) : member.status === 'ACTIVE' ? (
                        <Button type="button" variant="secondary" onClick={() => setSuspending(member)}>
                          {t('admin.staff.action.suspend')}
                        </Button>
                      ) : null}
                      {member.status !== 'REVOKED' ? (
                        <Button type="button" variant="danger" onClick={() => revokeMutation.mutate(member)}>
                          {t('admin.staff.action.revoke')}
                        </Button>
                      ) : null}
                    </RequirePermission>
                    <RequirePermission permission="USER_WRITE">
                      <Button type="button" variant="ghost" onClick={() => resetMutation.mutate(member)}>
                        {t('admin.staff.action.resetAccess')}
                      </Button>
                    </RequirePermission>
                  </div>
                ),
              },
            ]}
          />
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
        </>
      ) : null}

      {/* Suspending says out loud what it does and what it does not: the account survives, and so
          does everything the officer did. That sentence belongs where the button is. */}
      <Modal
        open={suspending !== null}
        onClose={() => setSuspending(null)}
        title={t('admin.staff.suspend.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          <p className="lx-text-body" style={{ margin: 0 }}>
            {t('admin.staff.suspend.body', { name: suspending?.fullName ?? '' })}
          </p>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('admin.staff.suspend.keepsHistory')}
          </p>
          <Input
            aria-label={t('admin.staff.suspend.reasonLabel')}
            placeholder={t('admin.staff.suspend.reasonPlaceholder')}
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
          />
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setSuspending(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              fullWidth
              loading={suspendMutation.isPending}
              onClick={() => suspending && suspendMutation.mutate(suspending)}
            >
              {t('admin.staff.action.suspend')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={zoning !== null}
        onClose={() => setZoning(null)}
        title={t('admin.staff.zones.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('admin.staff.zones.help')}
          </p>
          {(zonesQuery.data ?? []).map((zone) => (
            <label key={zone.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={zoneSelection.includes(zone.id)}
                onChange={(e) =>
                  setZoneSelection((current) =>
                    e.target.checked ? [...current, zone.id] : current.filter((id) => id !== zone.id),
                  )
                }
              />
              <span>
                {zone.name} <span className="lx-text-meta">{zone.code}</span>
              </span>
            </label>
          ))}
          {zoneSelection.length === 0 ? <Alert tone="info">{t('admin.staff.zones.noneMeansAll')}</Alert> : null}
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setZoning(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              fullWidth
              loading={zonesMutation.isPending}
              onClick={() => zoning && zonesMutation.mutate(zoning)}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
