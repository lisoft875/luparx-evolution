import * as React from 'react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { formatDateTime, useTranslation, type TranslationKey } from '@luparx/i18n';
import type { EnforcementCheck, PlateVerdict } from '@luparx/api-client';
import { Alert, Badge, Input, Pagination, Select, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

const PAGE_SIZE = 25;

/** The verdicts a lookup can come back with, in the order the officer meets them. */
const VERDICTS: PlateVerdict[] = ['EXEMPT', 'COVERED', 'EXPIRED', 'BAY_MISMATCH', 'NOT_COVERED', 'AMBIGUOUS'];

/**
 * The fiscalisation log: every plate an officer looked up, and what the platform answered
 * (CONTRACT.md v0.29).
 *
 * <p>This is the screen somebody opens when a citizen says "they fined me without coming to look at
 * my car", and the one a supervisor opens to see a shift. Until v0.29 neither question had an
 * answer: the citation was recorded three ways over — its own history, the platform's audit trail
 * and its evidence — and the <b>consultation</b> was recorded nowhere at all.</p>
 *
 * <p>The window is bounded and the server bounds it too. This is the largest table the platform has,
 * and a screen that opened on "everything, newest first" would get slower every day the municipality
 * operates.</p>
 */
export function EnforcementChecksPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();

  // Seeded from the query string so a figure on the dashboard opens the rows it counted, and not a
  // list the reader then has to filter by hand — which is the difference between a number somebody
  // can check and a decoration (CONTRACT.md v0.36). Read once, on purpose: after that the filters on
  // this screen belong to whoever is using them, and re-imposing the URL would fight them.
  const [params] = useSearchParams();
  const [plate, setPlate] = useState(params.get('plate') ?? '');
  const [zoneId, setZoneId] = useState(params.get('zoneId') ?? '');
  const [inspectorUserId, setInspectorUserId] = useState(params.get('inspectorUserId') ?? '');
  const [verdict, setVerdict] = useState<PlateVerdict | ''>(
    (params.get('verdict') as PlateVerdict | null) ?? '',
  );
  const [page, setPage] = useState(0);

  const zonesQuery = useQuery({
    queryKey: ['admin', 'zones'],
    queryFn: () => apiClient.adminParking.zones(),
  });
  // The staff panel is where the officers are; the filter offers exactly the people who could have
  // produced a row here rather than every user of the municipality.
  const staffQuery = useQuery({
    queryKey: ['admin', 'staff', 'for-checks'],
    queryFn: () => apiClient.adminStaff.list({ size: 100 }),
  });

  const query = useQuery({
    queryKey: ['admin', 'enforcement-checks', { plate, zoneId, inspectorUserId, verdict, page }],
    queryFn: () =>
      apiClient.adminEnforcementChecks.list({
        plate: plate.trim() || undefined,
        zoneId: zoneId || undefined,
        inspectorUserId: inspectorUserId || undefined,
        verdict: verdict || undefined,
        page,
        size: PAGE_SIZE,
      }),
  });

  function reset<T>(setter: (value: T) => void): (value: T) => void {
    return (value) => {
      setPage(0);
      setter(value);
    };
  }

  /** What the platform answered — or why it refused to, which is a result too. */
  function resultOf(check: EnforcementCheck): React.JSX.Element {
    if (check.verdict) {
      return (
        <Badge tone={check.verdict === 'COVERED' || check.verdict === 'EXEMPT' ? 'success' : 'warning'}>
          {t(`plate.verdict.${check.verdict.toLowerCase()}` as TranslationKey)}
        </Badge>
      );
    }
    return <Badge tone="neutral">{t('admin.checks.refused', { code: check.refusalCode ?? '' })}</Badge>;
  }

  const data = query.data;

  return (
    <AdminShell>
      <h1>{t('admin.checks.title')}</h1>
      <p className="lx-text-meta">{t('admin.checks.description')}</p>
      {/* Said on the screen and not only in a manual: whoever reads this is reading where an
          employee was during a shift, and the retention is part of what makes that defensible. */}
      <Alert tone="info">{t('admin.checks.retentionNotice')}</Alert>

      <div style={{ display: 'flex', gap: 12, margin: '12px 0', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 180 }}>
          <Input
            aria-label={t('admin.checks.filter.plate')}
            placeholder={t('admin.checks.filter.plate')}
            value={plate}
            autoCapitalize="characters"
            onChange={(e) => reset(setPlate)(e.target.value)}
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <Select
            aria-label={t('admin.checks.filter.inspector')}
            value={inspectorUserId}
            onChange={reset(setInspectorUserId)}
            placeholder={t('admin.checks.filter.allInspectors')}
            options={(staffQuery.data?.items ?? [])
              .filter((member) => member.portal === 'inspector')
              .map((member) => ({ value: member.userId, label: member.fullName ?? member.email ?? '' }))}
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <Select
            aria-label={t('admin.checks.filter.zone')}
            value={zoneId}
            onChange={reset(setZoneId)}
            placeholder={t('admin.checks.filter.allZones')}
            options={(zonesQuery.data ?? []).map((zone) => ({ value: zone.id, label: zone.name }))}
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <Select
            aria-label={t('admin.checks.filter.result')}
            value={verdict}
            onChange={(value) => reset(setVerdict)(value as PlateVerdict | '')}
            placeholder={t('admin.checks.filter.allResults')}
            options={VERDICTS.map((value) => ({
              value,
              label: t(`plate.verdict.${value.toLowerCase()}` as TranslationKey),
            }))}
          />
        </div>
      </div>

      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.checks.empty')}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'when',
            header: t('admin.checks.column.when'),
            render: (row) => (
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDateTime(row.occurredAt, locale)}</span>
            ),
          },
          {
            key: 'inspector',
            header: t('admin.checks.column.inspector'),
            render: (row) => row.inspectorName ?? '—',
          },
          {
            key: 'plate',
            header: t('admin.checks.column.plate'),
            render: (row) => (
              <>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{row.plate}</strong>
                {/* What the officer actually typed, when it differs. It is what an appeal argues over. */}
                {row.plateRaw && row.plateRaw !== row.plate ? (
                  <div className="lx-text-meta">{row.plateRaw}</div>
                ) : null}
              </>
            ),
          },
          {
            key: 'where',
            header: t('admin.checks.column.where'),
            render: (row) => (
              <>
                <div>{row.zoneName ?? t('admin.checks.noZone')}</div>
                {row.spaceCode ? <div className="lx-text-meta">{row.spaceCode}</div> : null}
              </>
            ),
          },
          { key: 'result', header: t('admin.checks.column.result'), render: resultOf },
          {
            key: 'action',
            header: t('admin.checks.column.action'),
            // The whole point of the link: "he looked" versus "he looked and then fined".
            render: (row) =>
              row.citationIssued ? (
                <Badge tone="danger">{t('admin.checks.action.cited')}</Badge>
              ) : (
                <span className="lx-text-meta">{t('admin.checks.action.none')}</span>
              ),
          },
          {
            key: 'location',
            header: t('admin.checks.column.location'),
            // Three states and not "has coordinates or not": until v0.29 a refusal, a timeout and a
            // phone with no signal were the same empty cell, and none could be told from the others.
            render: (row) =>
              row.locationState === 'FIX' ? (
                <span className="lx-text-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {row.latitude?.toFixed(5)}, {row.longitude?.toFixed(5)}
                </span>
              ) : (
                <span className="lx-text-meta">
                  {t(
                    row.locationState === 'NO_FIX'
                      ? 'admin.checks.location.noFix'
                      : 'admin.checks.location.notGranted',
                  )}
                </span>
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
    </AdminShell>
  );
}
