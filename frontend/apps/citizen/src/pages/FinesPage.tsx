import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { citationStatusKey, citationStatusTone } from '@luparx/features';
import { formatDate, useTranslation } from '@luparx/i18n';
import { AmountText, Badge, Card, ChipGroup, EmptyState, IconCheck, IconFine, ListRow, Pagination } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { QueryBoundary } from '../components/QueryBoundary';
import { useFines } from '../lib/queries';

type FinesTab = 'pending' | 'history';

const PAGE_SIZE = 20;

/**
 * The citizen's fines, as the server actually holds them.
 *
 * The two tabs split on **whether the matter is still open for this person** — the server's payable
 * set (`ISSUED`, `UPHELD`, `EXPIRED`) plus `APPEALED`. The addition is not a widening of "owed": a
 * fine under appeal owes nothing today. It is there because "Historial" is where a person stops
 * looking, and a defence waiting for an answer is the one thing on this screen they will come back
 * to check (CONTRACT.md v0.17). An annulled fine, which needs nothing from anybody, stays in
 * history where it belongs.
 *
 * The filtering is done on the page the server returned rather than by asking for two filtered
 * pages: `GET /citizen/fines` takes one `status`, not a set, and paging two lists that must agree
 * on a total is a worse problem than a short client-side partition of twenty rows.
 */
const OPEN_STATUSES = new Set(['ISSUED', 'UPHELD', 'EXPIRED', 'APPEALED']);

export function FinesPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<FinesTab>('pending');
  const [page, setPage] = useState(0);
  const query = useFines(page, PAGE_SIZE);
  const totalPages = query.data?.totalPages ?? 1;
  const total = query.data?.totalElements ?? 0;

  const rows = useMemo(() => {
    const items = query.data?.items ?? [];
    return items.filter((fine) =>
      tab === 'pending' ? OPEN_STATUSES.has(fine.status) : !OPEN_STATUSES.has(fine.status),
    );
  }, [query.data, tab]);

  return (
    <CitizenShell bare heading={<h1 className="lx-text-screen-title">{t('citizen.fines.title')}</h1>}>
      <ChipGroup
        variant="segmented"
        aria-label={t('citizen.fines.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: t('citizen.fines.tab.pending') },
          { value: 'history', label: t('citizen.fines.tab.history') },
        ]}
      />
      <QueryBoundary query={query} errorTitle={t('citizen.fines.title')}>
        {() =>
          rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={<IconCheck size={28} />}
                tone="success"
                title={t('citizen.fines.empty.title')}
                description={
                  tab === 'pending' ? t('citizen.fines.empty.description') : t('citizen.fines.empty.history')
                }
              />
            </Card>
          ) : (
            <>
              <Card>
                {rows.map((fine) => (
                  <ListRow
                    key={fine.id}
                    icon={<IconFine size={18} />}
                    title={
                      <span
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}
                      >
                        <span>{fine.infractionName}</span>
                        <Badge tone={citationStatusTone(fine.status)}>{t(citationStatusKey(fine.status))}</Badge>
                      </span>
                    }
                    meta={[
                      fine.plate,
                      fine.zoneName,
                      fine.spaceCode,
                      fine.dueAt ? `${t('citizen.fines.dueLabel')} ${formatDate(fine.dueAt, locale)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    value={
                      <AmountText
                        amountMinor={-fine.amountPayableMinor}
                        currencyCode={fine.currencyCode}
                        locale={locale}
                        showSignPrefix={false}
                      />
                    }
                    onClick={() => navigate(`/fines/${fine.id}`)}
                  />
                ))}
              </Card>
              {/* A control that can only be pressed to no effect is noise; on a phone it is noise
                  that costs a whole row of screen. */}
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
          )
        }
      </QueryBoundary>
    </CitizenShell>
  );
}
