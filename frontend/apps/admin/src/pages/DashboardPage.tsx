import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import {
  useTranslation,
  formatCurrencyMinor,
  formatDateTime,
  formatNumber,
  type SupportedLocale,
  type TranslationKey,
} from '@luparx/i18n';
import { Alert, Badge, Card, Input, SectionHeader, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

/**
 * The municipal dashboard (CONTRACT.md v0.36).
 *
 * <h2>«No solamente estadísticas bonitas»</h2>
 *
 * <p>Every figure on this screen is a count of rows, and every figure is a <b>link to those rows</b>,
 * already filtered. Nothing here is a score, an index or a trend through three points — the kind of
 * number that looks like insight and cannot be checked by anybody. If a municipality reads 47 here
 * and cannot get to the 47, the number is decoration.</p>
 *
 * <h2>Dos relojes, dichos en voz alta</h2>
 *
 * <p>Occupancy and running stays are <b>now</b>; everything else covers the window. The screen says
 * which is which next to each block, because a live count sitting beside a monthly total with no
 * label is how somebody reads one as the other.</p>
 */
export function DashboardPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'dashboard', { from, to }],
    queryFn: () =>
      apiClient.adminDashboard.get({
        from: from ? startOfDay(from) : undefined,
        to: to ? startOfNextDay(to) : undefined,
      }),
    // Live figures go stale while somebody reads them. Thirty seconds is often enough that the
    // occupancy is current and rare enough that a municipality on a slow connection is not
    // re-rendering the page under its own hands.
    refetchInterval: 30_000,
  });

  const data = query.data;
  const currency = data?.currencyCode ?? 'CRC';

  /** Every figure goes somewhere. This is the whole difference between consulting and looking. */
  function open(path: string, params: Record<string, string | undefined> = {}): void {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    // The window travels with the link, so the list opens showing the same period the number counted.
    if (from) search.set('from', from);
    if (to) search.set('to', to);
    const qs = search.toString();
    navigate(qs ? `${path}?${qs}` : path);
  }

  return (
    <AdminShell>
      <h1>{t('admin.dashboard.title')}</h1>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', margin: '12px 0' }}>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('admin.audit.filter.from')} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('admin.audit.filter.to')} />
      </div>

      {query.isError ? <Alert tone="danger">{t('common.error.generic')}</Alert> : null}
      {!data ? (
        <p className="lx-text-meta">{t('common.loading')}</p>
      ) : (
        <>
          <p className="lx-text-meta">
            {t('admin.dashboard.window', {
              from: formatDateTime(data.from, locale),
              to: formatDateTime(data.to, locale),
            })}
          </p>

          {/* --- 1. recaudación ------------------------------------------------------------- */}
          <Card>
            <SectionHeader
              title={t('admin.dashboard.revenue.title')}
              description={t('admin.dashboard.revenue.description')}
            />
            <div style={{ display: 'flex', gap: 'var(--lx-space-4)', flexWrap: 'wrap' }}>
              <Figure
                label={t('admin.dashboard.revenue.captured')}
                value={formatCurrencyMinor(data.revenue.capturedGrossMinor, currency, locale)}
                meta={t('admin.dashboard.revenue.capturedCount', { count: data.revenue.capturedCount })}
                onOpen={() => open('/billing')}
              />
              <Figure
                label={t('admin.dashboard.revenue.net')}
                value={formatCurrencyMinor(data.revenue.capturedNetMinor, currency, locale)}
                meta={t('admin.billing.totals.netHint')}
              />
              <Figure
                label={t('admin.dashboard.revenue.unsettled')}
                value={formatCurrencyMinor(data.revenue.unsettledGrossMinor, currency, locale)}
                tone={data.revenue.unsettledGrossMinor > 0 ? 'danger' : 'success'}
                onOpen={() => open('/billing')}
              />
            </div>
          </Card>

          {/* --- 2 y 3. transacciones y estacionamientos ------------------------------------- */}
          <Card>
            <SectionHeader
              title={t('admin.dashboard.transactions.title')}
              description={t('admin.dashboard.transactions.description')}
            />
            <GroupRow
              rows={data.transactions.map((row) => ({
                key: row.type ?? row.labelKey,
                label: t(row.labelKey as TranslationKey),
                count: row.count,
                // Signed on purpose: a charge is negative in this ledger.
                money: formatCurrencyMinor(row.totalMinor, currency, locale),
              }))}
              emptyLabel={t('admin.dashboard.empty')}
              onOpen={() => open('/billing')}
              locale={locale}
            />
          </Card>

          <Card>
            <SectionHeader
              title={t('admin.dashboard.parking.title')}
              description={t('admin.dashboard.parking.description')}
            />
            <GroupRow
              rows={data.parking.map((row) => ({
                key: row.paymentStatus ?? row.labelKey,
                label: t(row.labelKey as TranslationKey),
                count: row.count,
                money: formatCurrencyMinor(row.totalMinor, currency, locale),
              }))}
              emptyLabel={t('admin.dashboard.empty')}
              locale={locale}
            />
          </Card>

          {/* --- 4. ocupación, que es AHORA -------------------------------------------------- */}
          <Card>
            <SectionHeader
              title={t('admin.dashboard.occupancy.title')}
              description={t('admin.dashboard.occupancy.description')}
            />
            {/* Said out loud, because this block does not cover the window above it. */}
            <p className="lx-text-meta">
              {t('admin.dashboard.occupancy.asOf', { time: formatDateTime(data.now, locale) })}
            </p>
            <p style={{ fontSize: 26, fontWeight: 700, margin: '0 0 8px 0', fontVariantNumeric: 'tabular-nums' }}>
              {formatNumber(data.occupancy.activeSessions, locale)}{' '}
              <span className="lx-text-meta" style={{ fontSize: 14, fontWeight: 400 }}>
                {t('admin.dashboard.occupancy.active')}
              </span>
            </p>
            {data.occupancy.unzonedActive > 0 ? (
              // Reported, never folded away: a car parked somewhere is still a car parked somewhere.
              <p className="lx-text-meta">
                {t('admin.dashboard.occupancy.unzoned', { count: data.occupancy.unzonedActive })}
              </p>
            ) : null}
            <Table
              loadingLabel={t('common.loading')}
              emptyLabel={t('admin.dashboard.occupancy.noZones')}
              rows={data.occupancy.zones}
              rowKey={(row) => row.zoneId}
              columns={[
                {
                  key: 'zone',
                  header: t('admin.dashboard.column.zone'),
                  render: (row) => (
                    <button type="button" className="lx-linklike" onClick={() => open('/zones')}>
                      {row.name} ({row.code})
                    </button>
                  ),
                },
                {
                  key: 'active',
                  header: t('admin.dashboard.column.active'),
                  render: (row) => formatNumber(row.activeSessions, locale),
                },
                {
                  key: 'bays',
                  header: t('admin.dashboard.column.bays'),
                  render: (row) => formatNumber(row.baysInService, locale),
                },
                {
                  key: 'percent',
                  header: t('admin.dashboard.column.occupancy'),
                  // Absent is not zero. A zone with no numbered bays gets a dash and an explanation
                  // on hover, never "0%", which would be a figure that is wrong rather than missing.
                  render: (row) =>
                    row.percent === null ? (
                      <span className="lx-text-meta" title={t('admin.dashboard.occupancy.noBays')}>
                        —
                      </span>
                    ) : (
                      <Badge tone={row.percent >= 90 ? 'danger' : row.percent >= 70 ? 'warning' : 'neutral'}>
                        {row.percent}%
                      </Badge>
                    ),
                },
              ]}
            />
          </Card>

          {/* --- 5, 6 y 7. fiscalizaciones, infracciones, exoneraciones ---------------------- */}
          <Card>
            <SectionHeader
              title={t('admin.dashboard.checks.title')}
              description={t('admin.dashboard.checks.description')}
            />
            <GroupRow
              rows={data.checks.map((row) => ({
                key: row.verdict ?? row.labelKey,
                label: t(row.labelKey as TranslationKey),
                count: row.count,
              }))}
              emptyLabel={t('admin.dashboard.empty')}
              onOpen={(key) => open('/enforcement/checks', { verdict: key })}
              locale={locale}
            />
          </Card>

          <Card>
            <SectionHeader
              title={t('admin.dashboard.citations.title')}
              description={t('admin.dashboard.citations.description')}
            />
            <GroupRow
              rows={data.citations.map((row) => ({
                key: row.status ?? row.labelKey,
                label: t(row.labelKey as TranslationKey),
                count: row.count,
                money: formatCurrencyMinor(row.totalMinor, currency, locale),
              }))}
              emptyLabel={t('admin.dashboard.empty')}
              onOpen={(key) => open('/enforcement/citations', { status: key })}
              locale={locale}
            />
          </Card>

          <Card>
            <SectionHeader
              title={t('admin.dashboard.exemptions.title')}
              description={t('admin.dashboard.exemptions.description')}
            />
            <GroupRow
              rows={data.exemptions.map((row) => ({
                key: row.status ?? row.labelKey,
                label: t(row.labelKey as TranslationKey),
                count: row.count,
              }))}
              emptyLabel={t('admin.dashboard.empty')}
              onOpen={(key) => open('/exemptions', { status: key })}
              locale={locale}
            />
          </Card>

          {/* --- 8. actividad por inspector --------------------------------------------------- */}
          <Card>
            <SectionHeader
              title={t('admin.dashboard.inspectors.title')}
              description={t('admin.dashboard.inspectors.description')}
            />
            <Table
              loadingLabel={t('common.loading')}
              emptyLabel={t('admin.dashboard.inspectors.none')}
              rows={data.inspectors}
              rowKey={(row) => row.inspectorUserId}
              columns={[
                {
                  key: 'name',
                  header: t('admin.audit.column.actor'),
                  render: (row) => (
                    <button
                      type="button"
                      className="lx-linklike"
                      onClick={() => open('/enforcement/checks', { inspectorUserId: row.inspectorUserId })}
                    >
                      {row.name ?? row.inspectorUserId.slice(0, 8)}
                    </button>
                  ),
                },
                {
                  key: 'checks',
                  header: t('admin.dashboard.column.checks'),
                  render: (row) => formatNumber(row.checks, locale),
                },
                {
                  key: 'citations',
                  header: t('admin.dashboard.column.citations'),
                  render: (row) => formatNumber(row.citations, locale),
                },
                {
                  key: 'last',
                  header: t('admin.dashboard.column.lastCheck'),
                  render: (row) => (row.lastCheckAt ? formatDateTime(row.lastCheckAt, locale) : '—'),
                },
              ]}
            />
            {/* Neither number means anything alone, and a supervisor acting on one of them alone
                acts wrongly. Saying so on the screen is cheaper than explaining it afterwards. */}
            <Alert tone="info">{t('admin.dashboard.inspectors.notice')}</Alert>
          </Card>

          {/* --- 9. fallos de pago ------------------------------------------------------------ */}
          <Card>
            <SectionHeader
              title={t('admin.dashboard.failures.title')}
              description={t('admin.dashboard.failures.description')}
            />
            {data.paymentFailures.count === 0 ? (
              <Alert tone="success">{t('admin.dashboard.failures.none')}</Alert>
            ) : (
              <>
                <p style={{ fontSize: 22, fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {formatNumber(data.paymentFailures.count, locale)}{' '}
                  <span className="lx-text-meta" style={{ fontSize: 14, fontWeight: 400 }}>
                    {t('admin.dashboard.failures.count', {
                      amount: formatCurrencyMinor(data.paymentFailures.amountMinor, currency, locale),
                    })}
                  </span>
                </p>
                <Table
                  loadingLabel={t('common.loading')}
                  emptyLabel={t('admin.dashboard.empty')}
                  rows={data.paymentFailures.byReason}
                  rowKey={(row) => `${row.code}-${row.reason}`}
                  columns={[
                    { key: 'code', header: t('admin.dashboard.column.code'), render: (row) => row.code },
                    { key: 'reason', header: t('admin.dashboard.column.reason'), render: (row) => row.reason || '—' },
                    {
                      key: 'count',
                      header: t('admin.dashboard.column.attempts'),
                      render: (row) => formatNumber(row.count, locale),
                    },
                    {
                      key: 'amount',
                      header: t('admin.billing.column.gross'),
                      render: (row) => formatCurrencyMinor(row.amountMinor, currency, locale),
                    },
                  ]}
                />
              </>
            )}
          </Card>
        </>
      )}
    </AdminShell>
  );
}

/**
 * A row of counts, each one a door.
 *
 * <p>When {@code onOpen} is given every count becomes a button carrying its own enumerated value, so
 * the list it opens is filtered by exactly what the number counted. Without it the counts render as
 * plain text — used where there is no screen listing those rows yet, which is honest: a link that
 * went nowhere useful would be worse than none.</p>
 */
function GroupRow({
  rows,
  emptyLabel,
  onOpen,
  locale,
}: {
  rows: { key: string; label: string; count: number; money?: string }[];
  emptyLabel: string;
  onOpen?: (key: string) => void;
  locale: SupportedLocale;
}): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="lx-text-meta">{emptyLabel}</p>;
  }
  return (
    <div style={{ display: 'flex', gap: 'var(--lx-space-4)', flexWrap: 'wrap' }}>
      {rows.map((row) => (
        <div key={row.key} style={{ minWidth: 150 }}>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {row.label}
          </p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {onOpen ? (
              <button type="button" className="lx-linklike" onClick={() => onOpen(row.key)}>
                {formatNumber(row.count, locale)}
              </button>
            ) : (
              formatNumber(row.count, locale)
            )}
          </p>
          {row.money ? (
            <p className="lx-text-meta" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {row.money}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** One figure, big enough to read across a desk, and clickable when there is somewhere to go. */
function Figure({
  label,
  value,
  meta,
  tone,
  onOpen,
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: 'danger' | 'success';
  onOpen?: () => void;
}): React.JSX.Element {
  return (
    <div style={{ minWidth: 180 }}>
      <p className="lx-text-meta" style={{ margin: 0 }}>
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 26,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: tone === 'danger' ? 'var(--lx-danger)' : tone === 'success' ? 'var(--lx-success)' : undefined,
        }}
      >
        {onOpen ? (
          <button type="button" className="lx-linklike" style={{ font: 'inherit', color: 'inherit' }} onClick={onOpen}>
            {value}
          </button>
        ) : (
          value
        )}
      </p>
      {meta ? (
        <p className="lx-text-meta" style={{ margin: 0 }}>
          {meta}
        </p>
      ) : null}
    </div>
  );
}

/** Local midnight, written out for the same reason as on the audit screen (v0.33). */
function startOfDay(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString();
}

function startOfNextDay(date: string): string {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
}
