import * as React from 'react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequirePermission, useAuth } from '@luparx/auth';
import { formatDate, formatDateTime, useTranslation, type TranslationKey } from '@luparx/i18n';
import {
  ApiError,
  type BeneficiaryKind,
  type ExemptionStatus,
  type PlateExemption,
} from '@luparx/api-client';
import {
  Alert,
  Badge,
  Button,
  FormField,
  Input,
  Modal,
  Pagination,
  Select,
  Table,
  Textarea,
} from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

const PAGE_SIZE = 20;

/** As many plates as one permit may cover. Beyond this it is a fleet policy, not a permit. */
const MAX_PLATES = 10;

const EMPTY_FORM = {
  exemptionTypeId: '',
  plates: [] as string[],
  plateDraft: '',
  beneficiaryKind: '' as BeneficiaryKind | '',
  beneficiaryName: '',
  beneficiaryDocument: '',
  reason: '',
  documentRef: '',
  validTo: '',
};

/**
 * Permits and exemptions: the vehicles this municipality does not fine for non-payment
 * (CONTRACT.md v0.30).
 *
 * <p>Until v0.28 a legally exempt vehicle — the council's own fleet, an ambulance, a car carrying a
 * person with a disability — was indistinguishable from one that did not pay, and the officer's app
 * showed it "sin pago" next to a button that writes a ticket. v0.28 fixed that with one plate and a
 * written reason; this is the rest of the permit.</p>
 *
 * <p>Four things the screen insists on, because each one is how this kind of register goes wrong. The
 * <b>reason is required and in words</b>, since "why was this car never fined" is a question somebody
 * eventually asks and the category alone does not answer it. <b>No expiry is shown as no expiry</b>
 * rather than as an empty cell, because a permit nobody reviews is how a sold vehicle keeps parking
 * free. Refusing and revoking <b>keep the row</b>, since it is what explains why the car was not fined
 * last March. And when the same person asked and decided, the screen <b>says so</b> — that is allowed,
 * because a municipality with one administrator would otherwise do this work on paper where nobody can
 * audit it at all, but it must not be something you only notice by comparing two names.</p>
 */
export function ExemptionsPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  // Seeded from the query string (CONTRACT.md v0.36): «Pendientes: 1» on the dashboard has to open
  // that one pending permit, not the whole register.
  const [params] = useSearchParams();
  const [status, setStatus] = useState<ExemptionStatus | ''>(
    (params.get('status') as ExemptionStatus | null) ?? '',
  );
  const [exemptionTypeId, setExemptionTypeId] = useState('');
  const [plate, setPlate] = useState('');
  const [page, setPage] = useState(0);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [detail, setDetail] = useState<PlateExemption | null>(null);
  const [plateDraft, setPlateDraft] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [decision, setDecision] = useState<{ exemption: PlateExemption; kind: 'reject' | 'revoke' } | null>(
    null,
  );
  const [decisionReason, setDecisionReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const typesQuery = useQuery({
    queryKey: ['admin', 'exemption-types'],
    queryFn: () => apiClient.adminExemptionTypes.list(),
  });
  const types = typesQuery.data ?? [];
  const selectedType = types.find((type) => type.id === form.exemptionTypeId) ?? null;

  const query = useQuery({
    queryKey: ['admin', 'exemptions', { status, exemptionTypeId, plate, page }],
    queryFn: () =>
      apiClient.adminExemptions.list({
        status: status || undefined,
        exemptionTypeId: exemptionTypeId || undefined,
        plate: plate.trim() || undefined,
        page,
        size: PAGE_SIZE,
      }),
  });

  const documentsQuery = useQuery({
    queryKey: ['admin', 'exemptions', detail?.id, 'documents'],
    queryFn: () => apiClient.adminExemptions.documents(detail!.id),
    enabled: detail !== null,
  });

  function describe(err: unknown): string {
    if (!(err instanceof ApiError)) return t('common.error.generic');
    const known: Record<string, TranslationKey> = {
      EXEMPTION_ALREADY_EXISTS: 'admin.exemptions.error.alreadyExists',
      VALIDATION_FAILED: 'admin.exemptions.error.invalid',
      EXEMPTION_NOT_ACTIVE: 'admin.exemptions.error.notActive',
      EXEMPTION_NOT_PENDING: 'admin.exemptions.error.notPending',
      EXEMPTION_NOT_EDITABLE: 'admin.exemptions.error.notEditable',
      EXEMPTION_LAST_PLATE: 'admin.exemptions.error.lastPlate',
      EXEMPTION_PLATE_LIMIT: 'admin.exemptions.error.plateLimit',
      EXEMPTION_DOCUMENT_LIMIT: 'admin.exemptions.error.documentLimit',
      EXEMPTION_TYPE_INACTIVE: 'admin.exemptions.error.typeInactive',
      EVIDENCE_TOO_LARGE: 'admin.exemptions.error.documentTooLarge',
      EVIDENCE_TYPE_NOT_ALLOWED: 'admin.exemptions.error.documentType',
    };
    const key = known[err.code];
    return key ? t(key) : t('common.error.generic');
  }
  function succeeded(message: TranslationKey): void {
    setError(null);
    setFeedback(t(message));
    void queryClient.invalidateQueries({ queryKey: ['admin', 'exemptions'] });
  }
  function failed(err: unknown): void {
    setFeedback(null);
    setError(describe(err));
  }

  const requestMutation = useMutation({
    mutationFn: () =>
      apiClient.adminExemptions.request({
        exemptionTypeId: form.exemptionTypeId,
        plates: form.plates,
        beneficiaryKind: form.beneficiaryKind || undefined,
        beneficiaryName: form.beneficiaryName.trim() || undefined,
        beneficiaryDocument: form.beneficiaryDocument.trim() || undefined,
        reason: form.reason.trim(),
        documentRef: form.documentRef.trim() || undefined,
        // A date input gives a day; the permit ends at the start of it, which is the reading a
        // person expects from "vigente hasta el 30".
        validTo: form.validTo ? new Date(`${form.validTo}T00:00:00`).toISOString() : undefined,
      }),
    onSuccess: (created) => {
      setCreating(false);
      setForm(EMPTY_FORM);
      succeeded('admin.exemptions.requested');
      setDetail(created);
    },
    onError: failed,
  });

  const approveMutation = useMutation({
    mutationFn: (exemption: PlateExemption) => apiClient.adminExemptions.approve(exemption.id),
    onSuccess: (updated) => {
      setDetail(updated);
      succeeded('admin.exemptions.approved');
    },
    onError: failed,
  });

  const decideMutation = useMutation({
    mutationFn: () =>
      decision!.kind === 'reject'
        ? apiClient.adminExemptions.reject(decision!.exemption.id, { reason: decisionReason.trim() })
        : apiClient.adminExemptions.revoke(decision!.exemption.id, { reason: decisionReason.trim() }),
    onSuccess: (updated) => {
      const kind = decision?.kind;
      setDecision(null);
      setDecisionReason('');
      setDetail(updated);
      succeeded(kind === 'reject' ? 'admin.exemptions.rejected' : 'admin.exemptions.revoked');
    },
    onError: failed,
  });

  const addPlateMutation = useMutation({
    mutationFn: (value: string) => apiClient.adminExemptions.addPlate(detail!.id, { plate: value }),
    onSuccess: (updated) => {
      setPlateDraft('');
      setDetail(updated);
      succeeded('admin.exemptions.plateAdded');
    },
    onError: failed,
  });

  const removePlateMutation = useMutation({
    mutationFn: (value: string) => apiClient.adminExemptions.removePlate(detail!.id, value),
    onSuccess: (updated) => {
      setDetail(updated);
      succeeded('admin.exemptions.plateRemoved');
    },
    onError: failed,
  });

  const attachMutation = useMutation({
    mutationFn: (file: File) =>
      apiClient.adminExemptions.attachDocument(detail!.id, documentTitle.trim(), file),
    onSuccess: () => {
      setDocumentTitle('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'exemptions', detail?.id, 'documents'] });
      succeeded('admin.exemptions.documentAttached');
    },
    onError: failed,
  });

  /**
   * The bytes never come through a plain link: the document needs a bearer token and is served
   * `no-store`, so an `<a href>` would fetch it without the header and hand the person a broken file.
   */
  async function openDocument(documentId: string): Promise<void> {
    try {
      const blob = await apiClient.adminExemptions.document(detail!.id, documentId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      // Revoked on the next tick: the new tab has already taken its own reference to the bytes.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      failed(err);
    }
  }

  function addPlateToForm(): void {
    const value = form.plateDraft.trim();
    if (!value || form.plates.length >= MAX_PLATES) return;
    setForm((current) =>
      // Compared the way the server compares — without dashes, spaces or case. "HB-9911" and
      // "hb9911" are one vehicle, and a chip list that showed both would promise two plates on a
      // permit the server registers with one.
      current.plates.some((existing) => comparablePlate(existing) === comparablePlate(value))
        ? { ...current, plateDraft: '' }
        : { ...current, plates: [...current.plates, value], plateDraft: '' },
    );
  }

  const data = query.data;
  const beneficiaryRequired = selectedType?.requiresBeneficiary ?? false;
  const canSubmit =
    form.exemptionTypeId !== '' &&
    form.plates.length > 0 &&
    form.reason.trim() !== '' &&
    (!beneficiaryRequired || (form.beneficiaryName.trim() !== '' && form.beneficiaryKind !== ''));

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
              { value: 'PENDING', label: t('admin.exemptions.status.PENDING') },
              { value: 'APPROVED', label: t('admin.exemptions.status.APPROVED') },
              { value: 'REJECTED', label: t('admin.exemptions.status.REJECTED') },
              { value: 'REVOKED', label: t('admin.exemptions.status.REVOKED') },
            ]}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <Select
            aria-label={t('admin.exemptions.filter.type')}
            value={exemptionTypeId}
            onChange={(value) => {
              setPage(0);
              setExemptionTypeId(value);
            }}
            placeholder={t('admin.exemptions.filter.allTypes')}
            options={types.map((type) => ({ value: type.id, label: type.name }))}
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
            header: t('admin.exemptions.column.plates'),
            // Every plate the permit covers, not only the first: one permit and several vehicles is
            // the whole point of v0.30, and a column showing one of them would hide the rest.
            render: (row) => (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(row.plates.length ? row.plates.map((p) => p.plate) : [row.plate]).map((value) => (
                  <strong key={value} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {value}
                  </strong>
                ))}
              </div>
            ),
          },
          {
            key: 'type',
            header: t('admin.exemptions.column.type'),
            render: (row) => (
              <>
                <div>{row.exemptionTypeName ?? '—'}</div>
                {row.beneficiaryName ? <div className="lx-text-meta">{row.beneficiaryName}</div> : null}
              </>
            ),
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
            // "Sin vencimiento" spelled out. A blank cell would let a permanent permit pass for a
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
                <Badge tone={stateTone(row)}>{t(stateKey(row))}</Badge>
                {row.decisionReason ? <div className="lx-text-meta">{row.decisionReason}</div> : null}
                {row.revokeReason ? <div className="lx-text-meta">{row.revokeReason}</div> : null}
              </>
            ),
          },
          {
            key: 'decision',
            header: t('admin.exemptions.column.decision'),
            // Who asked and who decided, side by side. Naming only the second would answer half the
            // question an auditor asks, and naming only the first would answer the wrong half.
            render: (row) => (
              <>
                <div className="lx-text-meta">
                  {t('admin.exemptions.requestedBy', { name: row.requestedByName ?? '—' })}
                </div>
                <div className="lx-text-meta">
                  {t('admin.exemptions.decidedBy', { name: row.decidedByName ?? '—' })}
                </div>
                {row.selfApproved ? (
                  <Badge tone="warning">{t('admin.exemptions.selfApproved')}</Badge>
                ) : null}
              </>
            ),
          },
          {
            key: 'actions',
            header: t('admin.staff.column.actions'),
            render: (row) => (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button type="button" variant="secondary" onClick={() => setDetail(row)}>
                  {t('admin.exemptions.action.detail')}
                </Button>
                <RequirePermission permission="ENFORCEMENT_MANAGE">
                  {row.status === 'PENDING' ? (
                    <Button
                      type="button"
                      loading={approveMutation.isPending}
                      onClick={() => approveMutation.mutate(row)}
                    >
                      {t('admin.exemptions.action.approve')}
                    </Button>
                  ) : null}
                </RequirePermission>
                <RequirePermission permission="ENFORCEMENT_MANAGE">
                  {row.status === 'PENDING' ? (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => setDecision({ exemption: row, kind: 'reject' })}
                    >
                      {t('admin.exemptions.action.reject')}
                    </Button>
                  ) : null}
                </RequirePermission>
                <RequirePermission permission="ENFORCEMENT_MANAGE">
                  {row.status === 'APPROVED' || row.status === 'ACTIVE' ? (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => setDecision({ exemption: row, kind: 'revoke' })}
                    >
                      {t('admin.exemptions.action.revoke')}
                    </Button>
                  ) : null}
                </RequirePermission>
              </div>
            ),
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

      {/* --- the request ------------------------------------------------------------------------ */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('admin.exemptions.create')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <Alert tone="info">{t('admin.exemptions.createNotice')}</Alert>
          <FormField label={t('admin.exemptions.column.type')} hint={t('admin.exemptions.typeHint')}>
            {({ inputId, describedBy }) => (
              <Select
                id={inputId}
                aria-describedby={describedBy}
                value={form.exemptionTypeId}
                onChange={(value) => setForm((current) => ({ ...current, exemptionTypeId: value }))}
                placeholder={t('admin.exemptions.typePlaceholder')}
                options={types
                  .filter((type) => type.active)
                  .map((type) => ({ value: type.id, label: type.name }))}
              />
            )}
          </FormField>
          {selectedType?.description ? (
            <p className="lx-text-meta" style={{ margin: 0 }}>
              {selectedType.description}
            </p>
          ) : null}

          <FormField label={t('admin.exemptions.column.plates')} hint={t('admin.exemptions.plateHint')}>
            {({ inputId, describedBy }) => (
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  id={inputId}
                  aria-describedby={describedBy}
                  value={form.plateDraft}
                  autoCapitalize="characters"
                  onChange={(e) => setForm((current) => ({ ...current, plateDraft: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addPlateToForm();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!form.plateDraft.trim() || form.plates.length >= MAX_PLATES}
                  onClick={addPlateToForm}
                >
                  {t('admin.exemptions.action.addPlate')}
                </Button>
              </div>
            )}
          </FormField>
          {form.plates.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {form.plates.map((value) => (
                <PlatePill
                  key={value}
                  plate={value.toUpperCase()}
                  removeLabel={t('admin.exemptions.action.removePlate')}
                  onRemove={() =>
                    setForm((current) => ({
                      ...current,
                      plates: current.plates.filter((existing) => existing !== value),
                    }))
                  }
                />
              ))}
            </div>
          ) : null}

          {beneficiaryRequired ? (
            <>
              <FormField label={t('admin.exemptions.beneficiaryKind')}>
                {({ inputId }) => (
                  <Select
                    id={inputId}
                    value={form.beneficiaryKind}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, beneficiaryKind: value as BeneficiaryKind | '' }))
                    }
                    placeholder={t('admin.exemptions.beneficiaryKindPlaceholder')}
                    options={[
                      { value: 'PERSON', label: t('admin.exemptions.beneficiary.PERSON') },
                      { value: 'ORGANISATION', label: t('admin.exemptions.beneficiary.ORGANISATION') },
                    ]}
                  />
                )}
              </FormField>
              <FormField label={t('admin.exemptions.beneficiaryName')}>
                {({ inputId }) => (
                  <Input
                    id={inputId}
                    maxLength={200}
                    value={form.beneficiaryName}
                    onChange={(e) => setForm((current) => ({ ...current, beneficiaryName: e.target.value }))}
                  />
                )}
              </FormField>
              <FormField
                label={t('admin.exemptions.beneficiaryDocument')}
                hint={t('admin.exemptions.beneficiaryDocumentHint')}
              >
                {({ inputId, describedBy }) => (
                  <Input
                    id={inputId}
                    aria-describedby={describedBy}
                    maxLength={64}
                    value={form.beneficiaryDocument}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, beneficiaryDocument: e.target.value }))
                    }
                  />
                )}
              </FormField>
            </>
          ) : null}

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
              loading={requestMutation.isPending}
              disabled={!canSubmit}
              onClick={() => requestMutation.mutate()}
            >
              {t('admin.exemptions.action.submitRequest')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* --- the detail: plates and paperwork ---------------------------------------------------- */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={t('admin.exemptions.detail.title')}
        closeLabel={t('common.close')}
      >
        {detail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
            <div>
              <Badge tone={stateTone(detail)}>{t(stateKey(detail))}</Badge>{' '}
              {detail.exemptionTypeName ? <span>{detail.exemptionTypeName}</span> : null}
            </div>
            <p className="lx-text-body" style={{ margin: 0 }}>
              {detail.reason}
            </p>
            {detail.beneficiaryName ? (
              <p className="lx-text-meta" style={{ margin: 0 }}>
                {t(
                  detail.beneficiaryKind === 'ORGANISATION'
                    ? 'admin.exemptions.beneficiary.ORGANISATION'
                    : 'admin.exemptions.beneficiary.PERSON',
                )}
                : {detail.beneficiaryName}
                {detail.beneficiaryDocument ? ` · ${detail.beneficiaryDocument}` : ''}
              </p>
            ) : null}
            {detail.selfApproved ? <Alert tone="warning">{t('admin.exemptions.selfApprovedNotice')}</Alert> : null}

            <h2 className="lx-text-body" style={{ margin: 0 }}>
              {t('admin.exemptions.detail.plates')}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detail.plates.map((covered) => (
                <PlatePill
                  key={covered.plate}
                  plate={covered.plate}
                  removeLabel={t('admin.exemptions.action.removePlate')}
                  // The last one is not removable, and the button is absent rather than disabled: a
                  // permit covering nothing is a municipality having decided something about no
                  // vehicle at all, and revoking is the act that was meant.
                  onRemove={
                    detail.plates.length > 1 && (detail.status === 'PENDING' || detail.status === 'APPROVED')
                      ? () => removePlateMutation.mutate(covered.plate)
                      : undefined
                  }
                />
              ))}
            </div>
            {detail.status === 'PENDING' || detail.status === 'APPROVED' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  aria-label={t('admin.exemptions.action.addPlate')}
                  placeholder={t('admin.exemptions.filter.plate')}
                  value={plateDraft}
                  autoCapitalize="characters"
                  onChange={(e) => setPlateDraft(e.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  loading={addPlateMutation.isPending}
                  disabled={!plateDraft.trim() || detail.plates.length >= MAX_PLATES}
                  onClick={() => addPlateMutation.mutate(plateDraft.trim())}
                >
                  {t('admin.exemptions.action.addPlate')}
                </Button>
              </div>
            ) : null}

            <h2 className="lx-text-body" style={{ margin: 0 }}>
              {t('admin.exemptions.detail.documents')}
            </h2>
            <p className="lx-text-meta" style={{ margin: 0 }}>
              {t('admin.exemptions.detail.documentsNotice')}
            </p>
            {(documentsQuery.data ?? []).map((document) => (
              <div key={document.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div>{document.title}</div>
                  <div className="lx-text-meta">
                    {formatDateTime(document.createdAt, locale)}
                    {document.uploadedByName ? ` · ${document.uploadedByName}` : ''}
                  </div>
                </div>
                <Button type="button" variant="secondary" onClick={() => void openDocument(document.id)}>
                  {t('admin.exemptions.action.openDocument')}
                </Button>
              </div>
            ))}
            <FormField label={t('admin.exemptions.documentTitle')}>
              {({ inputId }) => (
                <Input
                  id={inputId}
                  maxLength={200}
                  value={documentTitle}
                  onChange={(e) => setDocumentTitle(e.target.value)}
                />
              )}
            </FormField>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) attachMutation.mutate(file);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              fullWidth
              loading={attachMutation.isPending}
              disabled={!documentTitle.trim()}
              onClick={() => fileInputRef.current?.click()}
            >
              {t('admin.exemptions.action.attachDocument')}
            </Button>
          </div>
        ) : null}
      </Modal>

      {/* --- refusing and revoking, both with a reason ------------------------------------------- */}
      <Modal
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={t(decision?.kind === 'reject' ? 'admin.exemptions.reject.title' : 'admin.exemptions.revoke.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <p className="lx-text-body" style={{ margin: 0 }}>
            {t(decision?.kind === 'reject' ? 'admin.exemptions.reject.body' : 'admin.exemptions.revoke.body', {
              plate: (decision?.exemption.plates ?? []).map((p) => p.plate).join(', '),
            })}
          </p>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t(
              decision?.kind === 'reject'
                ? 'admin.exemptions.reject.keepsRow'
                : 'admin.exemptions.revoke.keepsRow',
            )}
          </p>
          <FormField
            label={t(
              decision?.kind === 'reject'
                ? 'admin.exemptions.reject.reasonLabel'
                : 'admin.exemptions.revoke.reasonLabel',
            )}
          >
            {({ inputId }) => (
              <Textarea
                id={inputId}
                rows={3}
                maxLength={300}
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
              />
            )}
          </FormField>
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setDecision(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              fullWidth
              loading={decideMutation.isPending}
              disabled={!decisionReason.trim()}
              onClick={() => decision && decideMutation.mutate()}
            >
              {t(
                decision?.kind === 'reject'
                  ? 'admin.exemptions.action.reject'
                  : 'admin.exemptions.action.revoke',
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}

/**
 * The plate as the platform compares it: no dashes, no spaces, upper case.
 *
 * <p>A convenience for the form alone. The normaliser that decides anything is the server's, which is
 * the same one the officer's lookup uses — comparing anything else would be comparing nothing.</p>
 */
function comparablePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * One plate of a permit, with the cross that takes it off.
 *
 * <p>Local to this screen rather than a change to the shared {@code Chip}: that component is a filter
 * pill — one button, pressed or not — and giving it a second, destructive button would change what it
 * means everywhere it is already used.</p>
 */
function PlatePill({
  plate,
  onRemove,
  removeLabel,
}: {
  plate: string;
  onRemove?: () => void;
  removeLabel: string;
}): React.JSX.Element {
  return (
    <span
      className="lx-chip"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}
    >
      {plate}
      {onRemove ? (
        <button
          type="button"
          aria-label={`${removeLabel} ${plate}`}
          onClick={onRemove}
          style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit', lineHeight: 1 }}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

/**
 * What a row reads as, in one place.
 *
 * <p>Six states shown from four stored ones plus the clock: "vigente", "aún no empieza" and "vencido"
 * are all the same {@code APPROVED} row read against now, because running out is a fact about the
 * clock and not a decision anybody took.</p>
 */
function stateKey(row: PlateExemption): TranslationKey {
  if (row.status === 'PENDING') return 'admin.exemptions.state.awaiting';
  if (row.status === 'REJECTED') return 'admin.exemptions.state.rejected';
  if (row.status === 'REVOKED') return 'admin.exemptions.state.revoked';
  if (row.inForce) return 'admin.exemptions.state.inForce';
  return row.pending ? 'admin.exemptions.state.pending' : 'admin.exemptions.state.expired';
}

function stateTone(row: PlateExemption): 'success' | 'danger' | 'warning' | 'neutral' {
  if (row.inForce) return 'success';
  if (row.status === 'REVOKED' || row.status === 'REJECTED') return 'danger';
  if (row.status === 'PENDING') return 'warning';
  return 'neutral';
}
