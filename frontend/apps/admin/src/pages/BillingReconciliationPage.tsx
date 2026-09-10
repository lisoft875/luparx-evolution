import * as React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatCurrencyMinor, formatDateTime, type TranslationKey } from '@luparx/i18n';
import type { Payment, Reconciliation, Settlement, SettlementLine } from '@luparx/api-client';
import { Alert, Badge, Card, SectionHeader, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

/**
 * What the municipality charged, what the provider confirmed, and what is still owed
 * (CONTRACT.md v0.35).
 *
 * <p>The screen is ordered by what a treasurer is afraid of, not by what is easiest to compute.
 * First the amount nobody has confirmed — the only figure on the page that costs money. Then the
 * payments behind it, named. Then the statements, with their findings. A layout that opened with
 * "collected this month" would be a screen somebody looks at once a month; this one is meant to be
 * opened on a Monday.</p>
 */
export function BillingReconciliationPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const [openSettlement, setOpenSettlement] = useState<string | null>(null);

  const totals = useQuery({
    queryKey: ['admin', 'billing', 'totals'],
    queryFn: () => apiClient.adminBilling.totals(),
  });
  const unsettled = useQuery({
    queryKey: ['admin', 'billing', 'unsettled'],
    queryFn: () => apiClient.adminBilling.unsettled(),
  });
  const settlements = useQuery({
    queryKey: ['admin', 'billing', 'settlements'],
    queryFn: () => apiClient.adminBilling.settlements(),
  });

  const currency = totals.data?.currencyCode ?? 'CRC';
  const owed = totals.data?.unsettledGrossMinor ?? 0;

  return (
    <AdminShell>
      <h1>{t('admin.billing.title')}</h1>

      {/* --- the number that costs money, before anything else -------------------------------- */}
      <Card>
        <SectionHeader
          title={t('admin.billing.totals.title')}
          description={t('admin.billing.totals.description')}
        />
        {totals.data ? (
          <>
            <div
              style={{
                display: 'flex',
                gap: 'var(--lx-space-4)',
                flexWrap: 'wrap',
                margin: 'var(--lx-space-3) 0',
              }}
            >
              <Figure
                label={t('admin.billing.totals.captured')}
                value={formatCurrencyMinor(totals.data.capturedGrossMinor, currency, locale)}
                meta={t('admin.billing.totals.capturedCount', { count: totals.data.capturedCount })}
              />
              <Figure
                label={t('admin.billing.totals.settled')}
                value={formatCurrencyMinor(totals.data.settledGrossMinor, currency, locale)}
              />
              <Figure
                label={t('admin.billing.totals.owed')}
                value={formatCurrencyMinor(owed, currency, locale)}
                // The one figure on this page anybody has to act on, so it is the one that changes
                // colour. Everything green would make it as easy to skim past as the rest.
                tone={owed > 0 ? 'danger' : 'success'}
              />
              <Figure
                label={t('admin.billing.totals.net')}
                value={formatCurrencyMinor(totals.data.capturedNetMinor, currency, locale)}
                meta={t('admin.billing.totals.netHint')}
              />
            </div>
            <p className="lx-text-meta">
              {t('admin.billing.totals.window', {
                from: formatDateTime(totals.data.from, locale),
                to: formatDateTime(totals.data.to, locale),
              })}
            </p>
            {totals.data.failedCount > 0 ? (
              // Failed attempts are shown rather than hidden: they are what answers "I paid and my
              // balance did not go up", and a screen that only counted the successes could not.
              <p className="lx-text-meta">
                {t('admin.billing.totals.failed', { count: totals.data.failedCount })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="lx-text-meta">{t('common.loading')}</p>
        )}
      </Card>

      {/* --- what is behind that number ------------------------------------------------------- */}
      <Card>
        <SectionHeader
          title={t('admin.billing.unsettled.title')}
          description={t('admin.billing.unsettled.description')}
        />
        {unsettled.data && unsettled.data.length === 0 ? (
          <Alert tone="success">{t('admin.billing.unsettled.none')}</Alert>
        ) : (
          <Table
            loading={unsettled.isLoading}
            loadingLabel={t('common.loading')}
            emptyLabel={t('admin.billing.unsettled.none')}
            rows={unsettled.data ?? []}
            rowKey={(row: Payment) => row.id}
            columns={[
              {
                key: 'confirmedAt',
                header: t('admin.billing.column.confirmedAt'),
                render: (row) => (row.confirmedAt ? formatDateTime(row.confirmedAt, locale) : '—'),
              },
              {
                key: 'method',
                header: t('admin.billing.column.method'),
                render: (row) => t(row.methodLabelKey as TranslationKey),
              },
              {
                key: 'reference',
                header: t('admin.billing.column.reference'),
                render: (row) => row.providerReference ?? '—',
              },
              {
                key: 'gross',
                header: t('admin.billing.column.gross'),
                render: (row) => formatCurrencyMinor(row.grossMinor, row.currencyCode, locale),
              },
              {
                key: 'reconciliation',
                header: t('admin.billing.column.reconciliation'),
                render: (row) => (
                  <Badge tone={row.reconciliationStatus === 'MISSING_IN_SETTLEMENT' ? 'danger' : 'warning'}>
                    {t(row.reconciliationLabelKey as TranslationKey)}
                  </Badge>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* --- what the providers said ---------------------------------------------------------- */}
      <Card>
        <SectionHeader
          title={t('admin.billing.settlements.title')}
          description={t('admin.billing.settlements.description')}
        />
        <Table
          loading={settlements.isLoading}
          loadingLabel={t('common.loading')}
          emptyLabel={t('admin.billing.settlements.none')}
          rows={settlements.data ?? []}
          rowKey={(row: Settlement) => row.id}
          columns={[
            { key: 'provider', header: t('admin.billing.column.provider'), render: (row) => row.provider },
            {
              key: 'reference',
              header: t('admin.billing.column.reference'),
              render: (row) => (
                <button type="button" className="lx-linklike" onClick={() => setOpenSettlement(row.id)}>
                  {row.externalReference}
                </button>
              ),
            },
            {
              key: 'period',
              header: t('admin.billing.column.period'),
              render: (row) =>
                `${formatDateTime(row.periodStart, locale)} — ${formatDateTime(row.periodEnd, locale)}`,
            },
            {
              key: 'net',
              header: t('admin.billing.column.declaredNet'),
              render: (row) => formatCurrencyMinor(row.declaredNetMinor, row.currencyCode, locale),
            },
            {
              key: 'deposit',
              header: t('admin.billing.column.deposit'),
              // The last link of the chain. Without it the screen stops one step short of the bank,
              // and the treasurer is still the one holding the statement next to the account.
              render: (row) => row.depositReference ?? t('admin.billing.deposit.pending'),
            },
            {
              key: 'status',
              header: t('admin.billing.column.status'),
              render: (row) => (
                <Badge tone={row.status === 'DISPUTED' ? 'danger' : 'neutral'}>
                  {t(row.statusLabelKey as TranslationKey)}
                </Badge>
              ),
            },
          ]}
        />
      </Card>

      {openSettlement ? <Findings settlementId={openSettlement} /> : null}
    </AdminShell>
  );
}

/**
 * The lines of one statement that need a person.
 *
 * <p>Only the findings, never the matched lines. A statement is thousands of lines of which four are
 * wrong, and a screen that showed all of them would be a screen where the four are invisible.</p>
 */
function Findings({ settlementId }: { settlementId: string }): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const query = useQuery({
    queryKey: ['admin', 'billing', 'findings', settlementId],
    queryFn: () => apiClient.adminBilling.findings(settlementId),
  });

  return (
    <Card>
      <SectionHeader
        title={t('admin.billing.findings.title')}
        description={t('admin.billing.findings.description')}
      />
      {query.data && query.data.length === 0 ? (
        <Alert tone="success" data-testid="findings-clean">
          {t('admin.billing.findings.none')}
        </Alert>
      ) : (
        <Table
          loading={query.isLoading}
          loadingLabel={t('common.loading')}
          emptyLabel={t('admin.billing.findings.none')}
          rows={query.data ?? []}
          rowKey={(row: SettlementLine) => row.id}
          columns={[
            {
              key: 'reference',
              header: t('admin.billing.column.reference'),
              render: (row) => row.providerReference,
            },
            {
              key: 'gross',
              header: t('admin.billing.column.gross'),
              render: (row) => formatCurrencyMinor(row.grossMinor, row.currencyCode, locale),
            },
            {
              key: 'match',
              header: t('admin.billing.column.finding'),
              render: (row) => <Badge tone="warning">{t(row.matchLabelKey as TranslationKey)}</Badge>,
            },
          ]}
        />
      )}
    </Card>
  );
}

/** One figure, big enough to read across a desk. */
function Figure({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: 'danger' | 'success';
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
          color:
            tone === 'danger' ? 'var(--lx-danger)' : tone === 'success' ? 'var(--lx-success)' : undefined,
        }}
      >
        {value}
      </p>
      {meta ? (
        <p className="lx-text-meta" style={{ margin: 0 }}>
          {meta}
        </p>
      ) : null}
    </div>
  );
}

/** Re-exported so the reconciliation result of an import can be rendered by the same components. */
export type { Reconciliation };
