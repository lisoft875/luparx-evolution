import * as React from 'react';
import { useMemo, useState } from 'react';
import type { AdminParkingZone, ParkingRate } from '@luparx/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequirePermission, useAuth } from '@luparx/auth';
import { formatDurationLabel } from '@luparx/features';
import { useTranslation, formatCurrencyMinor, formatDateTime, majorToMinor } from '@luparx/i18n';
import { Alert, Badge, Button, Card, FormField, Input, Modal, SectionHeader, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useParkingPolicy } from '../lib/queries';

/** What is being priced: a zone's linear base, or one duration of its ladder. */
type Target = { zone: AdminParkingZone; minutes: number | null };

/**
 * What each sector costs (CONTRACT.md v0.16, rebuilt in v0.21, ladder added in v0.24).
 *
 * <h2>A price per duration, because that is how municipalities charge</h2>
 *
 * <p>A single amount per block can only express a straight line: half an hour always costs half of
 * an hour. Real tariffs are not linear — 45 minutes at ₡400 next to an hour at ₡500 is ordinary —
 * and until v0.24 that was inexpressible.</p>
 *
 * <p>So the screen is a grid: a row per zone, a column per duration the municipality sells, and a
 * cell that either holds a price of its own or shows what the base charges for that length. Setting
 * a cell prices exactly that duration; clearing it hands the duration back to the base. There are no
 * priorities and no rules to order, because there is nothing to order: a price stated for 45 minutes
 * is more specific than a formula that can also produce a number for 45 minutes.</p>
 *
 * <h2>The columns come from the policy, not from here</h2>
 *
 * <p>Which durations exist is a decision the municipality already made once, on the parking policy
 * screen. Letting this screen invent its own would be a second place to answer the same question —
 * and a price for a duration nobody can buy is money nobody will ever be charged.</p>
 */
export function TariffsPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<Target | null>(null);
  const [amount, setAmount] = useState('');
  const [baseMinutes, setBaseMinutes] = useState('60');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const zonesQuery = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => apiClient.adminParking.zones() });
  const ratesQuery = useQuery({ queryKey: ['admin', 'rates'], queryFn: () => apiClient.adminParking.rates() });
  const policyQuery = useParkingPolicy();

  const zones = useMemo(() => zonesQuery.data ?? [], [zonesQuery.data]);
  const rates = useMemo(() => ratesQuery.data ?? [], [ratesQuery.data]);
  /** The durations on sale — the columns of the grid. */
  const durations = useMemo(
    () => [...(policyQuery.data?.sessionIncrementsMinutes ?? [])].sort((a, b) => a - b),
    [policyQuery.data],
  );

  const format = (minutes: number): string => formatDurationLabel(minutes, tPlural);

  /** The base of each zone: the window with no closing date. At most one per zone. */
  const baseByZone = useMemo(() => {
    const map = new Map<string, ParkingRate>();
    for (const rate of rates) {
      if (rate.validTo === null && rate.kind === 'BLOCK') map.set(rate.zoneId, rate);
    }
    return map;
  }, [rates]);

  /** The rungs in force, keyed `zoneId:minutes`. */
  const rungs = useMemo(() => {
    const map = new Map<string, ParkingRate>();
    for (const rate of rates) {
      if (rate.validTo === null && rate.kind === 'EXACT') map.set(`${rate.zoneId}:${rate.minutes}`, rate);
    }
    return map;
  }, [rates]);

  const history = useMemo(
    () => rates.filter((rate) => rate.validTo !== null).sort((a, b) => b.validFrom.localeCompare(a.validFrom)),
    [rates],
  );

  const currencyCode = rates[0]?.currencyCode ?? null;

  /**
   * What a zone charges for a duration today — the rung if it has one, otherwise the base by started
   * block. The same rule the server applies, and the reason it is repeated here at all is that the
   * grid has to show the inherited number in the cells nobody has priced.
   */
  function priceOf(zone: AdminParkingZone, minutes: number): { amountMinor: number; own: boolean } | null {
    const rung = rungs.get(`${zone.id}:${minutes}`);
    if (rung) return { amountMinor: rung.amountMinor, own: true };
    const base = baseByZone.get(zone.id);
    if (!base) return null;
    const blocks = Math.ceil(minutes / base.minutes);
    return { amountMinor: base.amountMinor * blocks, own: false };
  }

  const unpriced = useMemo(
    () => zones.filter((zone) => zone.active && !baseByZone.has(zone.id)),
    [zones, baseByZone],
  );

  const saveMutation = useMutation({
    mutationFn: (target: Target) => {
      const amountMinor = majorToMinor(Number(amount), currencyCode ?? 'CRC');
      return target.minutes === null
        ? apiClient.adminParking.setRate({ zoneId: target.zone.id, amountMinor, minutes: Number(baseMinutes) })
        : apiClient.adminParking.setRateRung({ zoneId: target.zone.id, amountMinor, minutes: target.minutes });
    },
    onSuccess: (_result, target) => {
      setError(null);
      setEditing(null);
      setAmount('');
      setFeedback(
        target.minutes === null
          ? t('admin.tariffs.saved.base', { zone: `${target.zone.code} — ${target.zone.name}` })
          : t('admin.tariffs.saved.rung', {
              zone: `${target.zone.code} — ${target.zone.name}`,
              duration: format(target.minutes),
            }),
      );
      void queryClient.invalidateQueries({ queryKey: ['admin', 'rates'] });
    },
    onError: () => {
      setFeedback(null);
      setError(t('admin.zones.error.generic'));
    },
  });

  const clearMutation = useMutation({
    mutationFn: (target: Target & { minutes: number }) =>
      apiClient.adminParking.clearRateRung(target.zone.id, target.minutes),
    onSuccess: (_result, target) => {
      setError(null);
      setEditing(null);
      setFeedback(
        t('admin.tariffs.cleared', {
          zone: `${target.zone.code} — ${target.zone.name}`,
          duration: format(target.minutes),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['admin', 'rates'] });
    },
    onError: () => {
      setFeedback(null);
      setError(t('admin.zones.error.generic'));
    },
  });

  function openFor(zone: AdminParkingZone, minutes: number | null): void {
    setError(null);
    const base = baseByZone.get(zone.id);
    if (minutes === null) {
      // Editing the base: the amount starts empty (it is being replaced), the block does not.
      setAmount('');
      setBaseMinutes(String(base?.minutes ?? 60));
    } else {
      setAmount('');
    }
    setEditing({ zone, minutes });
  }

  const loading = zonesQuery.isLoading || ratesQuery.isLoading || policyQuery.isLoading;
  const editingRung = editing !== null && editing.minutes !== null;
  const editingHasRung = editingRung && rungs.has(`${editing.zone.id}:${editing.minutes}`);

  return (
    <AdminShell>
      <h1>{t('admin.tariffs.title')}</h1>
      <p className="lx-text-meta">{t('admin.tariffs.description')}</p>

      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {!loading && unpriced.length > 0 ? (
        <Alert tone="warning">
          {t('admin.tariffs.unpriced', { zones: unpriced.map((zone) => `${zone.code} — ${zone.name}`).join(', ') })}
        </Alert>
      ) : null}

      <Card>
        <SectionHeader title={t('admin.tariffs.grid.title')} description={t('admin.tariffs.grid.description')} />
        <Table
          loading={loading}
          loadingLabel={t('common.loading')}
          emptyLabel={t('admin.tariffs.noZones')}
          rows={zones}
          rowKey={(zone) => zone.id}
          columns={[
            {
              key: 'zone',
              header: t('admin.tariffs.column.zone'),
              render: (zone) => {
                const base = baseByZone.get(zone.id);
                return (
                  <>
                    <div>
                      <strong>{zone.code}</strong> — {zone.name}
                    </div>
                    {/* The base is shown under the zone, not as a column: it is the fallback the
                        whole row inherits from, and reading it as one more duration would be
                        reading it as a product it is not. */}
                    <button
                      type="button"
                      className="lx-linklike"
                      onClick={() => openFor(zone, null)}
                      disabled={!zone.active}
                    >
                      {base
                        ? t('admin.tariffs.base.value', {
                            amount: formatCurrencyMinor(base.amountMinor, base.currencyCode, locale),
                            minutes: base.minutes,
                          })
                        : t('admin.tariffs.base.missing')}
                    </button>
                  </>
                );
              },
            },
            ...durations.map((minutes) => ({
              key: `d-${minutes}`,
              header: format(minutes),
              render: (zone: AdminParkingZone) => {
                const price = priceOf(zone, minutes);
                if (!price) return <span className="lx-text-meta">—</span>;
                return (
                  <button
                    type="button"
                    className="lx-linklike"
                    onClick={() => openFor(zone, minutes)}
                    // A cell is either a price this municipality set, or the number its base
                    // produces. Both are shown; only the second is dimmed, because "inherited" is
                    // information and a blank cell is not.
                    style={price.own ? undefined : { opacity: 0.65 }}
                  >
                    {formatCurrencyMinor(price.amountMinor, currencyCode ?? 'CRC', locale)}
                    {price.own ? null : <span className="lx-text-meta"> · {t('admin.tariffs.fromBase')}</span>}
                  </button>
                );
              },
            })),
          ]}
        />
        {durations.length === 0 && !loading ? (
          <Alert tone="info">{t('admin.tariffs.noDurations')}</Alert>
        ) : null}
      </Card>

      <Card>
        <SectionHeader title={t('admin.tariffs.history.title')} description={t('admin.tariffs.history.description')} />
        <Table
          loading={ratesQuery.isLoading}
          loadingLabel={t('common.loading')}
          emptyLabel={t('admin.tariffs.history.empty')}
          rows={history}
          rowKey={(rate) => rate.id}
          columns={[
            {
              key: 'zone',
              header: t('admin.tariffs.column.zone'),
              render: (rate) => {
                const zone = zones.find((candidate) => candidate.id === rate.zoneId);
                return zone ? `${zone.code} — ${zone.name}` : rate.zoneId;
              },
            },
            {
              key: 'what',
              header: t('admin.tariffs.column.what'),
              render: (rate) =>
                rate.kind === 'EXACT' ? (
                  <Badge tone="info">{format(rate.minutes)}</Badge>
                ) : (
                  <Badge tone="neutral">{t('admin.tariffs.base.label')}</Badge>
                ),
            },
            {
              key: 'price',
              header: t('admin.tariffs.column.price'),
              render: (rate) =>
                rate.kind === 'EXACT'
                  ? formatCurrencyMinor(rate.amountMinor, rate.currencyCode, locale)
                  : t('admin.tariffs.price', {
                      amount: formatCurrencyMinor(rate.amountMinor, rate.currencyCode, locale),
                      minutes: rate.minutes,
                    }),
            },
            { key: 'from', header: t('admin.tariffs.column.from'), render: (rate) => formatDateTime(rate.validFrom, locale) },
            {
              key: 'to',
              header: t('admin.tariffs.column.to'),
              render: (rate) => (rate.validTo ? formatDateTime(rate.validTo, locale) : t('admin.tariffs.openWindow')),
            },
          ]}
        />
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing === null
            ? ''
            : editing.minutes === null
              ? t('admin.tariffs.set.baseTitle', { zone: `${editing.zone.code} — ${editing.zone.name}` })
              : t('admin.tariffs.set.rungTitle', {
                  duration: format(editing.minutes),
                  zone: `${editing.zone.code} — ${editing.zone.name}`,
                })
        }
        closeLabel={t('common.close')}
      >
        <RequirePermission permission="TENANT_MANAGE">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
            <p className="lx-text-body" style={{ margin: 0 }}>
              {t(editing?.minutes === null ? 'admin.tariffs.set.baseBody' : 'admin.tariffs.set.rungBody')}
            </p>
            {editing !== null && editing.minutes !== null && !editingHasRung ? (
              <Alert tone="info">
                {t('admin.tariffs.set.inheriting', {
                  price: formatCurrencyMinor(
                    priceOf(editing.zone, editing.minutes)?.amountMinor ?? 0,
                    currencyCode ?? 'CRC',
                    locale,
                  ),
                })}
              </Alert>
            ) : null}
            <div style={{ display: 'flex', gap: 'var(--lx-space-3)' }}>
              <div style={{ flex: 1 }}>
                <FormField
                  label={
                    currencyCode
                      ? t('admin.tariffs.field.amount', { currency: currencyCode })
                      : t('admin.tariffs.field.amountNoCurrency')
                  }
                >
                  {({ inputId }) => (
                    <Input
                      id={inputId}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      autoFocus
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  )}
                </FormField>
              </div>
              {editing?.minutes === null ? (
                <div style={{ flex: 1 }}>
                  <FormField label={t('admin.tariffs.field.minutes')} hint={t('admin.tariffs.field.minutesHint')}>
                    {({ inputId, describedBy }) => (
                      <Input
                        id={inputId}
                        aria-describedby={describedBy}
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={baseMinutes}
                        onChange={(e) => setBaseMinutes(e.target.value)}
                      />
                    )}
                  </FormField>
                </div>
              ) : null}
            </div>
            <div className="lx-dialog-actions">
              {/* Clearing is offered only where there is something to clear, and it is not a
                  destructive act: the duration goes back to the base, which still prices it. */}
              {editingHasRung ? (
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  loading={clearMutation.isPending}
                  onClick={() =>
                    editing &&
                    editing.minutes !== null &&
                    clearMutation.mutate({ zone: editing.zone, minutes: editing.minutes })
                  }
                >
                  {t('admin.tariffs.action.clear')}
                </Button>
              ) : (
                <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(null)}>
                  {t('common.cancel')}
                </Button>
              )}
              <Button
                type="button"
                fullWidth
                loading={saveMutation.isPending}
                disabled={
                  Number(amount) <= 0 || (editing?.minutes === null && Number(baseMinutes) <= 0)
                }
                onClick={() => editing && saveMutation.mutate(editing)}
              >
                {t('admin.tariffs.set.submit')}
              </Button>
            </div>
          </div>
        </RequirePermission>
      </Modal>
    </AdminShell>
  );
}
