import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { citationStatusKey, citationStatusTone } from '@luparx/features';
import { formatCurrencyMinor, formatDateTime, useTranslation } from '@luparx/i18n';
import { Alert, Badge, Button, Card, EmptyState, IconFine, ListRow, Pagination } from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import { useMyCitations } from '../lib/queries';
import { apiErrorMessage } from '../lib/apiErrors';

const PAGE_SIZE = 20;

/**
 * The officer's own work, newest first.
 *
 * Paginated because a shift writes many and the server pages it anyway; the count is shown so an
 * officer can reconcile "what I wrote today" against what the office sees, which is the first thing
 * asked when a citation is disputed.
 */
export function MyCitationsPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const query = useMyCitations(page, PAGE_SIZE);
  const totalPages = query.data?.totalPages ?? 1;
  const total = query.data?.totalElements ?? 0;

  return (
    <InspectorShell>
      <h1 className="lx-text-screen-title">{t('inspector.citations.title')}</h1>

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
          <EmptyState icon={<IconFine size={28} />} title={t('inspector.citations.empty')} />
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
