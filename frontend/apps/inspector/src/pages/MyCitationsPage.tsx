import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { citationStatusKey, citationStatusTone } from '@luparx/features';
import { formatCurrencyMinor, formatDateTime, useTranslation } from '@luparx/i18n';
import type { CitationStatus } from '@luparx/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  DateField,
  EmptyState,
  FormField,
  IconFine,
  ListRow,
  Pagination,
  Select,
} from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import { useMyCitations, type MyCitationsFilters } from '../lib/queries';
import { apiErrorMessage } from '../lib/apiErrors';

const PAGE_SIZE = 20;

// Los ocho estados del ciclo de una boleta. El filtro los ofrece todos aunque un turno típico use
// sólo DRAFT/ISSUED: el fiscalizador también consulta qué pasó después (pagada, anulada, apelada).
// Mismo orden que el panel administrativo.
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

/**
 * The officer's own work, newest first.
 *
 * Paginated because a shift writes many and the server pages it anyway; the count is shown so an
 * officer can reconcile "what I wrote today" against what the office sees, which is the first thing
 * asked when a citation is disputed.
 *
 * Filtros por estado y rango de fechas (Fase 4): el mismo servicio que el panel administrativo
 * (`GET /inspector/citations` → `CitationService.search`), siempre acotado a este fiscalizador por
 * el servidor. Aplicar reinicia la paginación, porque un filtro nuevo cambia el total de páginas.
 */
export function MyCitationsPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<MyCitationsFilters>({});
  const [applied, setApplied] = useState<MyCitationsFilters>({});
  const query = useMyCitations(page, PAGE_SIZE, applied);
  const totalPages = query.data?.totalPages ?? 1;
  const total = query.data?.totalElements ?? 0;
  const hasFilters = Boolean(applied.status || applied.from || applied.to);

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('inspector.citations.filter.allStatuses') },
      ...STATUSES.map((status) => ({ value: status, label: t(citationStatusKey(status)) })),
    ],
    [t],
  );

  const apply = (event: React.FormEvent): void => {
    event.preventDefault();
    setApplied(draft);
    setPage(0);
  };

  const clear = (): void => {
    setDraft({});
    setApplied({});
    setPage(0);
  };

  return (
    <InspectorShell>
      <h1 className="lx-text-screen-title">{t('inspector.citations.title')}</h1>

      <Card>
        <form
          onSubmit={apply}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 'var(--lx-space-3)',
            alignItems: 'end',
          }}
        >
          <FormField label={t('inspector.citations.filter.status')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <Select
                id={inputId}
                value={draft.status ?? ''}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    status: (value || undefined) as CitationStatus | undefined,
                  }))
                }
                options={statusOptions}
                aria-label={t('inspector.citations.filter.status')}
              />
            )}
          </FormField>
          <FormField label={t('inspector.citations.filter.from')} optionalLabel={t('common.optional')}>
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
          <FormField label={t('inspector.citations.filter.to')} optionalLabel={t('common.optional')}>
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
            <Button type="submit">{t('inspector.citations.filter.apply')}</Button>
            {hasFilters ? (
              <Button type="button" variant="secondary" onClick={clear}>
                {t('inspector.citations.filter.clear')}
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      {query.isError ? (
        <Alert tone="danger">
          <div className="flex flex-col items-start gap-2">
            <span>{apiErrorMessage(query.error, t)}</span>
            <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      ) : query.isLoading ? (
        <p className="lx-text-meta">{t('common.loading')}</p>
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={<IconFine size={28} />}
            title={t(hasFilters ? 'inspector.citations.emptyFiltered' : 'inspector.citations.empty')}
          />
        </Card>
      ) : (
        <>
          <Card>
            {query.data?.items.map((citation) => (
              <ListRow
                key={citation.id}
                icon={<IconFine size={18} />}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="tabular-nums">{citation.plate}</strong>
                    <Badge tone={citationStatusTone(citation.status)}>{t(citationStatusKey(citation.status))}</Badge>
                  </span>
                }
                meta={`${citation.number ?? t('citation.field.noNumber')} · ${citation.infractionName} · ${formatDateTime(
                  citation.occurredAt,
                  locale,
                )}`}
                value={formatCurrencyMinor(citation.amountPayableMinor, citation.currencyCode, locale)}
                onClick={() => navigate(`/citations/${citation.id}`)}
              />
            ))}
          </Card>
          {totalPages > 1 ? (
            <Pagination
              page={page}
              size={PAGE_SIZE}
              totalPages={totalPages}
              totalElements={total}
              onPageChange={setPage}
              previousLabel={t('pagination.previous')}
              nextLabel={t('pagination.next')}
              pageLabel={t('pagination.page')}
              ofLabel={t('pagination.of')}
              resultCountLabel={tPlural('pagination.resultCount', total)}
            />
          ) : null}
        </>
      )}
    </InspectorShell>
  );
}
