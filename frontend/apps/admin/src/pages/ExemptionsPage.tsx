import * as React from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequirePermission, useAuth } from '@luparx/auth';
import { formatDate, useTranslation, type TranslationKey } from '@luparx/i18n';
import { ApiError, type ExemptionStatus, type PlateExemption } from '@luparx/api-client';
import { Alert, Badge, Button, FormField, Input, Modal, Pagination, Select, Table, Textarea } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

const PAGE_SIZE = 20;

/**
 * The plates this municipality does not fine for non-payment (CONTRACT.md v0.28).
 *
 * <p>Until v0.28 a legally exempt vehicle — the council's own fleet, an ambulance, a diplomatic car —
 * was indistinguishable from one that did not pay, and the officer's app showed it "sin pago" next
 * to a button that writes a ticket. This is the register that fixes that.</p>
 *
 * <p>Three things the screen insists on, because each one is how this kind of register goes wrong:
 * the <b>reason is required and in words</b>, since "why was this car never fined" is a question
 * somebody eventually asks; <b>no expiry is shown as no expiry</b> rather than as an empty cell,
 * because an exemption nobody reviews is how a sold vehicle keeps parking free; and revoking
 * <b>keeps the row</b>, since it is what explains why the car was not fined last March.</p>
 */
export function ExemptionsPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<ExemptionStatus | ''>('ACTIVE');
  const [plate, setPlate] = useState('');
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<PlateExemption | null>(null);
  const [form, setForm] = useState({ plate: '', reason: '', documentRef: '', validTo: '' });
  const [revokeReason, setRevokeReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'exemptions', { status, plate, page }],
    queryFn: () =>
      apiClient.adminExemptions.list({
        status: status || undefined,
        plate: plate.trim() || undefined,
        page,
        size: PAGE_SIZE,
      }),
  });

  function describe(err: unknown): string {
    if (!(err instanceof ApiError)) return t('common.error.generic');
    const known: Record<string, TranslationKey> = {
      EXEMPTION_ALREADY_EXISTS: 'admin.exemptions.error.alreadyExists',
      VALIDATION_FAILED: 'admin.exemptions.error.invalid',
      EXEMPTION_NOT_ACTIVE: 'admin.exemptions.error.notActive',
    };
    const key = known[err.code];
    return key ? t(key) : t('common.error.generic');
  }
  function invalidate(message: TranslationKey): void {
    setError(null);
    setFeedback(t(message));
    void queryClient.invalidateQueries({ queryKey: ['admin', 'exemptions'] });
  }

  const grantMutation = useMutation({
    mutationFn: () =>
      apiClient.adminExemptions.grant({
        plate: form.plate.trim(),
        reason: form.reason.trim(),
        documentRef: form.documentRef.trim() || undefined,
        // A date input gives a day; the exemption ends at the start of it, which is the reading a
        // person expects from "vigente hasta el 30".
        validTo: form.validTo ? new Date(`${form.validTo}T00:00:00`).toISOString() : undefined,
      }),
    onSuccess: () => {
      setCreating(false);
      setForm({ plate: '', reason: '', documentRef: '', validTo: '' });
      invalidate('admin.exemptions.granted');
    },
    onError: (err) => {
      setFeedback(null);
      setError(describe(err));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (exemption: PlateExemption) =>
      apiClient.adminExemptions.revoke(exemption.id, { reason: revokeReason.trim() }),
    onSuccess: () => {
      setRevoking(null);
      setRevokeReason('');
      invalidate('admin.exemptions.revoked');
    },
    onError: (err) => {
      setFeedback(null);
      setError(describe(err));
    },
  });

  const data = query.data;

  return (
    <AdminShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1>{t('admin.exemptions.title')}</h1>
        <RequirePermission permission="ENFORCEMENT_MANAGE">
          <Button type="button" onClick={() => setCreating(true)}>
            {t('admin.exemptions.create')}
          </Button>
        </RequirePermission>
      </div>
      <p className="lx-text-meta">{t('admin.exemptions.description')}</p>

      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div style={{ display: 'flex', gap: 12, margin: '12px 0', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <Select
            aria-label={t('admin.exemptions.filter.status')}
            value={status}
            onChange={(value) => {
              setPage(0);
              setStatus(value as ExemptionStatus | '');
            }}
            placeholder={t('admin.exemptions.filter.all')}
            options={[
              { value: 'ACTIVE', label: t('admin.exemptions.status.ACTIVE') },
              { value: 'REVOKED', label: t('admin.exemptions.status.REVOKED') },
            ]}
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <Input
            aria-label={t('admin.exemptions.filter.plate')}
            placeholder={t('admin.exemptions.filter.plate')}
            value={plate}
            autoCapitalize="characters"
            onChange={(e) => {
              setPage(0);
              setPlate(e.target.value);
            }}
          />
        </div>
      </div>

      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.exemptions.empty')}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'plate',
            header: t('admin.exemptions.column.plate'),
            render: (row) => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{row.plate}</strong>,
          },
          {
            key: 'reason',
            header: t('admin.exemptions.column.reason'),
            render: (row) => (
              <>
                <div>{row.reason}</div>
                {row.documentRef ? <div className="lx-text-meta">{row.documentRef}</div> : null}
              </>
            ),
          },
          {
            key: 'validity',
            header: t('admin.exemptions.column.validity'),
            // "Sin vencimiento" spelled out. A blank cell would let a permanent exemption pass for a
            // missing value, and it is the permanent ones that need to be seen.
            render: (row) => (
              <>
                <div>
                  {row.validTo
                    ? t('admin.exemptions.validUntil', { date: formatDate(row.validTo, locale) })
                    : t('admin.exemptions.noEnd')}
                </div>
                <div className="lx-text-meta">
                  {t('admin.exemptions.validFrom', { date: formatDate(row.validFrom, locale) })}
                </div>
              </>
            ),
          },
          {
            key: 'state',
            header: t('admin.exemptions.column.state'),
            render: (row) => (
              <>
                <Badge tone={row.inForce ? 'success' : row.status === 'REVOKED' ? 'danger' : 'neutral'}>
                  {t(
                    row.inForce
                      ? 'admin.exemptions.state.inForce'
                      : row.status === 'REVOKED'
                        ? 'admin.exemptions.state.revoked'
                        : row.pending
                          ? 'admin.exemptions.state.pending'
                          : 'admin.exemptions.state.expired',
                  )}
                </Badge>
                {row.revokeReason ? <div className="lx-text-meta">{row.revokeReason}</div> : null}
              </>
            ),
          },
          {
            key: 'actions',
            header: t('admin.staff.column.actions'),
            render: (row) =>
              row.status === 'ACTIVE' ? (
                <RequirePermission permission="ENFORCEMENT_MANAGE">
                  <Button type="button" variant="danger" onClick={() => setRevoking(row)}>
                    {t('admin.exemptions.action.revoke')}
                  </Button>
                </RequirePermission>
              ) : null,
          },
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

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('admin.exemptions.create')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <Alert tone="info">{t('admin.exemptions.createNotice')}</Alert>
          <FormField label={t('admin.exemptions.column.plate')} hint={t('admin.exemptions.plateHint')}>
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                value={form.plate}
                autoCapitalize="characters"
                onChange={(e) => setForm((current) => ({ ...current, plate: e.target.value }))}
              />
            )}
          </FormField>
          <FormField label={t('admin.exemptions.column.reason')} hint={t('admin.exemptions.reasonHint')}>
            {({ inputId, describedBy }) => (
              <Textarea
                id={inputId}
                aria-describedby={describedBy}
                rows={3}
                maxLength={300}
                value={form.reason}
                onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))}
              />
            )}
          </FormField>
          <FormField label={t('admin.exemptions.documentRef')} hint={t('admin.exemptions.documentRefHint')}>
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                maxLength={120}
                value={form.documentRef}
                onChange={(e) => setForm((current) => ({ ...current, documentRef: e.target.value }))}
              />
            )}
          </FormField>
          <FormField label={t('admin.exemptions.validToLabel')} hint={t('admin.exemptions.validToHint')}>
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                type="date"
                value={form.validTo}
                onChange={(e) => setForm((current) => ({ ...current, validTo: e.target.value }))}
              />
            )}
          </FormField>
          {form.validTo === '' ? <Alert tone="warning">{t('admin.exemptions.noEndWarning')}</Alert> : null}
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              fullWidth
              loading={grantMutation.isPending}
              disabled={!form.plate.trim() || !form.reason.trim()}
              onClick={() => grantMutation.mutate()}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={t('admin.exemptions.revoke.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <p className="lx-text-body" style={{ margin: 0 }}>
            {t('admin.exemptions.revoke.body', { plate: revoking?.plate ?? '' })}
          </p>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('admin.exemptions.revoke.keepsRow')}
          </p>
          <FormField label={t('admin.exemptions.revoke.reasonLabel')}>
            {({ inputId }) => (
              <Textarea
                id={inputId}
                rows={3}
                maxLength={300}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
              />
            )}
          </FormField>
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setRevoking(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              fullWidth
              loading={revokeMutation.isPending}
              disabled={!revokeReason.trim()}
              onClick={() => revoking && revokeMutation.mutate(revoking)}
            >
              {t('admin.exemptions.action.revoke')}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
