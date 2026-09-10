import * as React from 'react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { citationStatusKey, citationStatusTone } from '@luparx/features';
import { formatCurrencyMinor, formatDateTime, useTranslation } from '@luparx/i18n';
import type { AdminCitationsQuery, CitationStatus } from '@luparx/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  DateField,
  FormField,
  Input,
  Pagination,
  SectionHeader,
  Select,
  Table,
} from '@luparx/ui';
import type { TableColumn } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useAdminZones, useEnforcementCitations } from '../lib/queries';

const PAGE_SIZE = 20;

const STATUSES: CitationStatus[] = [
  'DRAFT',
  'ISSUED',
  'PAID',
  'APPEALED',
  'UPHELD',
  'DISMISSED',
  'CANCELLED',
  'EXPIRED',
];

interface Row {
  id: string;
  number: string | null;
  plate: string;
  infractionName: string;
  zoneName: string | null;
  spaceCode: string | null;
  issuedAt: string | null;
  occurredAt: string;
  status: CitationStatus;
  amountPayableMinor: number;
  currencyCode: string;
}

/**
 * The municipality's citations, filtered.
 *
 * Filters are **applied on submit and carried in state**, not fired on every keystroke: each one is
 * a database query on a table that grows without bound, and a plate typed character by character
 * would be six of them. The dates go to the server as instants; the server evaluates the
 * municipality's own day boundaries, which is why nothing here converts anything.
 */
export function EnforcementCitationsPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const zones = useAdminZones();

  // Seeded from the query string, so a count on the dashboard opens exactly the citations it counted
  // (CONTRACT.md v0.36).
  const [params] = useSearchParams();
  const fromUrl: AdminCitationsQuery = {
    status: (params.get('status') as AdminCitationsQuery['status']) ?? undefined,
    zoneId: params.get('zoneId') ?? undefined,
    inspectorUserId: params.get('inspectorUserId') ?? undefined,
  };
  const [draft, setDraft] = useState<AdminCitationsQuery>(fromUrl);
  const [applied, setApplied] = useState<AdminCitationsQuery>(fromUrl);
  const [page, setPage] = useState(0);

  const query = useEnforcementCitations({ ...applied, page, size: PAGE_SIZE });
  const total = query.data?.totalElements ?? 0;

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('admin.enforcement.citations.filter.all') },
      ...STATUSES.map((status) => ({ value: status, label: t(citationStatusKey(status)) })),
    ],
    [t],
  );

  const zoneOptions = useMemo(
    () => [
      { value: '', label: t('admin.enforcement.citations.filter.all') },
      ...(zones.data ?? []).map((zone) => ({ value: zone.id, label: zone.name, detail: zone.code })),
    ],
    [t, zones.data],
  );

  const columns: TableColumn<Row>[] = [
    {
      key: 'number',
      header: t('admin.enforcement.citations.column.number'),
      // The number is the handle: making it the link is what lets this table drop a whole
      // "actions" column and still fit a 1440-wide screen without horizontal scrolling.
      render: (row) => (
        <button
          type="button"
          className="lx-link-button"
          style={{ fontVariantNumeric: 'tabular-nums' }}
          onClick={() => navigate(`/enforcement/citations/${row.id}`)}
          aria-label={`${t('admin.enforcement.citations.open')} ${row.number ?? row.plate}`}
        >
          {row.number ?? t('citation.field.noNumber')}
        </button>
      ),
    },
    { key: 'plate', header: t('admin.enforcement.citations.column.plate'), render: (row) => row.plate },
    {
      key: 'infraction',
      header: t('admin.enforcement.citations.column.infraction'),
      render: (row) => row.infractionName,
    },
    {
      key: 'zone',
      header: t('admin.enforcement.citations.column.zone'),
      render: (row) => [row.zoneName, row.spaceCode].filter(Boolean).join(' · ') || '—',
    },
    {
      key: 'issuedAt',
      header: t('admin.enforcement.citations.column.issuedAt'),
      // Short date in a table, medium everywhere else: eight columns have to share 1440 px next to
      // a sidebar, and "9 sept 2026" costs more width here than it buys in legibility.
      render: (row) =>
        formatDateTime(row.issuedAt ?? row.occurredAt, locale, { dateStyle: 'short', timeStyle: 'short' }),
    },
    {
      key: 'status',
      header: t('admin.enforcement.citations.column.status'),
      // Word first, tone second: the table is read by people who filter by status and by people
      // who cannot tell the tones apart.
      render: (row) => <Badge tone={citationStatusTone(row.status)}>{t(citationStatusKey(row.status))}</Badge>,
    },
    {
      key: 'amount',
      header: t('admin.enforcement.citations.column.amount'),
      render: (row) => formatCurrencyMinor(row.amountPayableMinor, row.currencyCode, locale),
    },
  ];

  function apply(event: React.FormEvent): void {
    event.preventDefault();
    setPage(0);
    setApplied(draft);
  }

  return (
    <AdminShell>
      <h1>{t('admin.enforcement.citations.title')}</h1>
      <Card>
        <SectionHeader
          title={t('admin.enforcement.citations.title')}
          description={t('admin.enforcement.citations.description')}
        />
        <form
          onSubmit={apply}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--lx-space-3)',
            alignItems: 'end',
          }}
        >
          <FormField label={t('admin.enforcement.citations.filter.status')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <Select
                id={inputId}
                value={draft.status ?? ''}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, status: (value || undefined) as CitationStatus | undefined }))
                }
                options={statusOptions}
                aria-label={t('admin.enforcement.citations.filter.status')}
              />
            )}
          </FormField>
          <FormField label={t('admin.enforcement.citations.filter.zone')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <Select
                id={inputId}
                value={draft.zoneId ?? ''}
                onChange={(value) => setDraft((current) => ({ ...current, zoneId: value || undefined }))}
                options={zoneOptions}
                aria-label={t('admin.enforcement.citations.filter.zone')}
              />
            )}
          </FormField>
          <FormField label={t('admin.enforcement.citations.filter.plate')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <Input
                id={inputId}
                name="plate"
                value={draft.plate ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, plate: event.target.value || undefined }))}
                // Matched on the normalised form server-side, so `sjp-123` finds `SJP123`.
                placeholder="SJP123"
              />
            )}
          </FormField>
          <FormField label={t('admin.enforcement.citations.filter.inspector')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <Input
                id={inputId}
                name="inspectorUserId"
                value={draft.inspectorUserId ?? ''}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, inspectorUserId: event.target.value || undefined }))
                }
                placeholder="UUID"
              />
            )}
          </FormField>
          <FormField label={t('admin.enforcement.citations.filter.from')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <DateField
                id={inputId}
                value={draft.from ? draft.from.slice(0, 10) : ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    from: event.target.value ? `${event.target.value}T00:00:00Z` : undefined,
                  }))
                }
              />
            )}
          </FormField>
          <FormField label={t('admin.enforcement.citations.filter.to')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <DateField
                id={inputId}
                value={draft.to ? draft.to.slice(0, 10) : ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    to: event.target.value ? `${event.target.value}T23:59:59Z` : undefined,
                  }))
                }
              />
            )}
          </FormField>
          <div style={{ display: 'flex', gap: 'var(--lx-space-2)' }}>
            <Button type="submit">{t('admin.enforcement.citations.filter.apply')}</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft({});
                setApplied({});
                setPage(0);
              }}
            >
              {t('admin.enforcement.citations.filter.clear')}
            </Button>
          </div>
        </form>
      </Card>

      {query.isError ? (
        <Alert tone="danger">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)', alignItems: 'flex-start' }}>
            <span>{t('common.error.generic')}</span>
            <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      ) : (
        <Card>
          <Table<Row>
            columns={columns}
            rows={(query.data?.items ?? []) as Row[]}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            loadingLabel={t('common.loading')}
            emptyLabel={t('admin.enforcement.citations.empty')}
          />
          <Pagination
            page={page}
            size={PAGE_SIZE}
            totalPages={query.data?.totalPages ?? 1}
            totalElements={total}
            onPageChange={setPage}
            previousLabel={t('pagination.previous')}
            nextLabel={t('pagination.next')}
            pageLabel={t('pagination.page')}
            ofLabel={t('pagination.of')}
            resultCountLabel={tPlural('pagination.resultCount', total)}
          />
        </Card>
      )}
    </AdminShell>
  );
}
