import * as React from 'react';
import { useMemo, useState } from 'react';
import type { AdminParkingZone, ParkingRate } from '@luparx/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequirePermission, useAuth } from '@luparx/auth';
import { useTranslation, formatCurrencyMinor, formatDateTime, majorToMinor } from '@luparx/i18n';
import { Alert, Badge, Button, Card, FormField, Input, Modal, SectionHeader, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

/**
 * What each sector costs (CONTRACT.md v0.16, rebuilt in v0.21).
 *
 * <h2>The screen is the list of zones, not a form</h2>
 *
 * <p>It used to be a loose row of fields above a table of rate windows. That put the least useful
 * thing first — an empty form — and made the most useful question unanswerable: <b>which zones have
 * no price?</b> A zone without an open rate window is not a cosmetic gap. {@code start} calls
 * {@code requireRate} and answers {@code PARKING_RATE_NOT_FOUND}, so a citizen standing in that
 * sector simply cannot park, and nobody in the municipality finds out until they complain.</p>
 *
 * <p>So the zones are the table, each with the price in force beside it, and the ones without a
 * price are named at the top in a warning. Setting a tariff is an action <em>on a zone</em>, which
 * is what it always was — the old form asked you to pick the zone again from a dropdown that had no
 * idea which ones needed one.</p>
 *
 * <h2>Nothing is edited</h2>
 *
 * <p>A tariff is an amount per block of minutes, charged per <em>started</em> block, so the two
 * numbers are the price together and neither means anything alone. Setting one closes the window
 * that is open and opens a new one from now on; the closed windows stay, in their own table, because
 * they are what priced the stays that were paid while they were in force. An administrator who could
 * edit a past window could change what a citizen was charged last month, and the receipt would stop
 * matching the ledger.</p>
 */
export function TariffsPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<AdminParkingZone | null>(null);
  const [amount, setAmount] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const zonesQuery = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => apiClient.adminParking.zones() });
  // Every rate of the municipality in one read, unfiltered. The old screen filtered this by the zone
  // selected in the form, so choosing a zone to price silently changed the history underneath — and
  // there was no way to see the whole picture, which is the one thing this screen is for.
  const ratesQuery = useQuery({ queryKey: ['admin', 'rates'], queryFn: () => apiClient.adminParking.rates() });

  const zones = useMemo(() => zonesQuery.data ?? [], [zonesQuery.data]);
  const rates = useMemo(() => ratesQuery.data ?? [], [ratesQuery.data]);

  /** The window with no closing date: the price a citizen is quoted today. At most one per zone. */
  const currentByZone = useMemo(() => {
    const map = new Map<string, ParkingRate>();
    for (const rate of rates) {
      if (rate.validTo === null) map.set(rate.zoneId, rate);
    }
    return map;
  }, [rates]);

  const history = useMemo(
    () => rates.filter((rate) => rate.validTo !== null).sort((a, b) => b.validFrom.localeCompare(a.validFrom)),
    [rates],
  );

  /**
   * The municipality's own currency, read from a rate it already has. The server sets it from the
   * tenant and ignores anything the client sends, so this is only ever used to render and to convert
   * what was typed — never to declare what a zone is priced in. A municipality with no rate at all
   * has not told us yet, and the form says "Monto" without inventing one: hardcoding a fallback is
   * how a platform meant for several countries ends up quoting colones in Panama.
   */
  const currencyCode = rates[0]?.currencyCode ?? null;

  /**
   * Active zones a citizen cannot park in. Inactive ones are excluded on purpose: a zone that is no
   * longer operated needs no price, and listing it here would train people to ignore this warning.
   */
  const unpriced = useMemo(
    () => zones.filter((zone) => zone.active && !currentByZone.has(zone.id)),
    [zones, currentByZone],
  );

  const setRateMutation = useMutation({
    mutationFn: (zone: AdminParkingZone) =>
      apiClient.adminParking.setRate({
        zoneId: zone.id,
        // The field asks for colones and the wire carries minor units. Converting here rather than
        // sending the number as typed is not a detail: for CRC the two differ by a hundred, so a
        // tariff of ₡550 sent raw would price the whole municipality at ₡5.50 and nobody would
        // notice until the month closed. `majorToMinor` reads the currency's own exponent, so this
        // stays right in a country whose currency has none.
        amountMinor: majorToMinor(Number(amount), currencyCode ?? 'CRC'),
        minutes: Number(minutes),
      }),
    onSuccess: (_result, zone) => {
      setError(null);
      setEditing(null);
      setAmount('');
      setFeedback(t('admin.tariffs.saved', { zone: `${zone.code} — ${zone.name}` }));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'rates'] });
    },
    onError: () => {
      setFeedback(null);
      setError(t('admin.zones.error.generic'));
    },
  });

  const canSubmit = Number(amount) > 0 && Number(minutes) > 0;

  function openFor(zone: AdminParkingZone): void {
    const current = currentByZone.get(zone.id);
    setError(null);
    setAmount('');
    // Prefilled with the block the zone already sells, so changing only the amount — which is what
    // an increase actually is — does not make somebody retype the part that is not changing.
    setMinutes(String(current?.minutes ?? 60));
    setEditing(zone);
  }

  return (
    <AdminShell>
      <h1>{t('admin.tariffs.title')}</h1>
      <p className="lx-text-meta">{t('admin.tariffs.description')}</p>

      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* Named before the table, because a zone with no price is a zone nobody can park in and the
          municipality has no other way to find out. */}
      {!ratesQuery.isLoading && !zonesQuery.isLoading && unpriced.length > 0 ? (
        <Alert tone="warning">
          {t('admin.tariffs.unpriced', { zones: unpriced.map((zone) => `${zone.code} — ${zone.name}`).join(', ') })}
        </Alert>
      ) : null}

      <Card>
        <SectionHeader title={t('admin.tariffs.zones.title')} description={t('admin.tariffs.zones.description')} />
        <Table
          loading={zonesQuery.isLoading || ratesQuery.isLoading}
          loadingLabel={t('common.loading')}
          emptyLabel={t('admin.tariffs.noZones')}
          rows={zones}
          rowKey={(zone) => zone.id}
          columns={[
            {
              key: 'zone',
              header: t('admin.tariffs.column.zone'),
              render: (zone) => (
                <>
                  <div>
                    <strong>{zone.code}</strong> — {zone.name}
                  </div>
                  {!zone.active ? (
                    <div className="lx-text-meta">{t('admin.zones.status.inactive')}</div>
                  ) : null}
                </>
              ),
            },
            {
              key: 'price',
              header: t('admin.tariffs.column.current'),
              render: (zone) => {
                const current = currentByZone.get(zone.id);
                if (!current) {
                  return <Badge tone={zone.active ? 'warning' : 'neutral'}>{t('admin.tariffs.noRate')}</Badge>;
                }
                return (
                  <>
                    <div>
                      {t('admin.tariffs.price', {
                        amount: formatCurrencyMinor(current.amountMinor, current.currencyCode, locale),
                        minutes: current.minutes,
                      })}
                    </div>
                    <div className="lx-text-meta">
                      {t('admin.tariffs.since', { date: formatDateTime(current.validFrom, locale) })}
                    </div>
                  </>
                );
              },
            },
            {
              key: 'actions',
              header: t('admin.staff.column.actions'),
              render: (zone) => (
                <RequirePermission permission="TENANT_MANAGE">
                  <Button type="button" variant="secondary" onClick={() => openFor(zone)}>
                    {t(currentByZone.has(zone.id) ? 'admin.tariffs.action.change' : 'admin.tariffs.action.set')}
                  </Button>
                </RequirePermission>
              ),
            },
          ]}
        />
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
              key: 'price',
              header: t('admin.tariffs.column.price'),
              render: (rate) =>
                t('admin.tariffs.price', {
                  amount: formatCurrencyMinor(rate.amountMinor, rate.currencyCode, locale),
                  minutes: rate.minutes,
                }),
            },
            // Two labelled dates rather than two bare ones stacked: "11 jun 2026 / 5 ago 2025" in one
            // cell leaves the reader guessing which end is which.
            {
              key: 'from',
              header: t('admin.tariffs.column.from'),
              render: (rate) => formatDateTime(rate.validFrom, locale),
            },
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
        title={t('admin.tariffs.set.title', { zone: editing ? `${editing.code} — ${editing.name}` : '' })}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          <p className="lx-text-body" style={{ margin: 0 }}>
            {t('admin.tariffs.set.description')}
          </p>
          {editing && currentByZone.has(editing.id) ? (
            <Alert tone="info">
              {t('admin.tariffs.set.replacing', {
                price: t('admin.tariffs.price', {
                  amount: formatCurrencyMinor(
                    currentByZone.get(editing.id)!.amountMinor,
                    currentByZone.get(editing.id)!.currencyCode,
                    locale,
                  ),
                  minutes: currentByZone.get(editing.id)!.minutes,
                }),
              })}
            </Alert>
          ) : null}
          {/* One line, both fields: the amount and the block are the price together, and splitting
              them across the dialog would invite reading either one as the whole thing. */}
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
            <div style={{ flex: 1 }}>
              <FormField label={t('admin.tariffs.field.minutes')} hint={t('admin.tariffs.field.minutesHint')}>
                {({ inputId, describedBy }) => (
                  <Input
                    id={inputId}
                    aria-describedby={describedBy}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                )}
              </FormField>
            </div>
          </div>
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              fullWidth
              loading={setRateMutation.isPending}
              disabled={!canSubmit}
              onClick={() => editing && setRateMutation.mutate(editing)}
            >
              {/* The same words as the button that opened it: "Poner" and "Cambiar" are different
                  acts to whoever is doing them, and the dialog should not rename what they pressed. */}
              {t(editing && currentByZone.has(editing.id) ? 'admin.tariffs.action.change' : 'admin.tariffs.action.set')}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
