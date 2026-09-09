import * as React from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequirePermission, useAuth } from '@luparx/auth';
import { useTranslation, formatCurrencyMinor, formatDateTime, majorToMinor } from '@luparx/i18n';
import { Alert, Badge, Button, Card, FormField, Input, SectionHeader, Select, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

/**
 * What each sector costs (CONTRACT.md v0.16).
 *
 * <p>A tariff is an amount per block of minutes, and a stay is charged per <em>started</em> block —
 * so the two numbers together are the price, and neither means anything alone. The form asks for
 * both on one line for that reason.</p>
 *
 * <p><b>Nothing here is edited.</b> Setting a tariff closes the window that is open and opens a new
 * one from now on; the closed windows stay on screen, greyed, because they are what priced the stays
 * that were paid while they were in force. An administrator who could edit a past window could
 * change what a citizen was charged last month, and the receipt would stop matching the ledger.</p>
 */
export function TariffsPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();

  const [zoneId, setZoneId] = useState('');
  const [amount, setAmount] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const zonesQuery = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => apiClient.adminParking.zones() });
  const ratesQuery = useQuery({
    queryKey: ['admin', 'rates', { zoneId }],
    queryFn: () => apiClient.adminParking.rates({ zoneId: zoneId || undefined }),
  });

  const setRateMutation = useMutation({
    mutationFn: () =>
      apiClient.adminParking.setRate({
        zoneId,
        // The field asks for colones and the wire carries minor units. Converting here rather than
        // sending the number as typed is not a detail: for CRC the two differ by a hundred, so a
        // tariff of ₡550 sent raw would price the whole municipality at ₡5.50 and nobody would
        // notice until the month closed. `majorToMinor` reads the currency's own exponent, so this
        // stays right in a country whose currency has none.
        amountMinor: majorToMinor(Number(amount), currencyCode),
        minutes: Number(minutes),
      }),
    onSuccess: () => {
      setError(null);
      setAmount('');
      setFeedback(t('admin.tariffs.saved'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'rates'] });
    },
    onError: () => {
      setFeedback(null);
      setError(t('admin.zones.error.generic'));
    },
  });

  const zonesById = new Map((zonesQuery.data ?? []).map((zone) => [zone.id, zone]));
  // The municipality's own currency, taken from a rate it already has. The server sets it from the
  // tenant and ignores anything the client sends, so this is only ever used to render and to
  // convert what was typed — never to declare what a zone is priced in.
  const currencyCode = ratesQuery.data?.[0]?.currencyCode ?? 'CRC';
  const canSubmit = zoneId !== '' && Number(amount) > 0 && Number(minutes) > 0;

  return (
    <AdminShell>
      <h1>{t('admin.tariffs.title')}</h1>
      <p className="lx-text-meta">{t('admin.tariffs.description')}</p>

      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <RequirePermission permission="TENANT_MANAGE">
        <Card>
          <SectionHeader title={t('admin.tariffs.set.title')} description={t('admin.tariffs.set.description')} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 240 }}>
              <FormField label={t('admin.tariffs.field.zone')}>
                {({ inputId }) => (
                  <Select
                    id={inputId}
                    value={zoneId}
                    onChange={setZoneId}
                    placeholder={t('admin.spaces.zonePlaceholder')}
                    options={(zonesQuery.data ?? []).map((zone) => ({
                      value: zone.id,
                      label: `${zone.code} — ${zone.name}`,
                    }))}
                  />
                )}
              </FormField>
            </div>
            <div style={{ minWidth: 140 }}>
              <FormField label={t('admin.tariffs.field.amount', { currency: currencyCode })}>
                {({ inputId }) => (
                  <Input
                    id={inputId}
                    type="number"
                    min={0}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <div style={{ minWidth: 140 }}>
              <FormField label={t('admin.tariffs.field.minutes')} hint={t('admin.tariffs.field.minutesHint')}>
                {({ inputId, describedBy }) => (
                  <Input
                    id={inputId}
                    aria-describedby={describedBy}
                    type="number"
                    min={1}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <Button
              type="button"
              loading={setRateMutation.isPending}
              disabled={!canSubmit}
              onClick={() => setRateMutation.mutate()}
            >
              {t('admin.tariffs.set.submit')}
            </Button>
          </div>
        </Card>
      </RequirePermission>

      <Table
        loading={ratesQuery.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.tariffs.empty')}
        rows={ratesQuery.data ?? []}
        rowKey={(rate) => rate.id}
        columns={[
          {
            key: 'zone',
            header: t('admin.tariffs.column.zone'),
            render: (rate) => {
              const zone = zonesById.get(rate.zoneId);
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
          {
            key: 'window',
            header: t('admin.tariffs.column.window'),
            render: (rate) => (
              <>
                <div>{formatDateTime(rate.validFrom, locale)}</div>
                <div className="lx-text-meta">
                  {rate.validTo ? formatDateTime(rate.validTo, locale) : t('admin.tariffs.openWindow')}
                </div>
              </>
            ),
          },
          {
            key: 'status',
            header: t('admin.zones.column.status'),
            render: (rate) => (
              <Badge tone={rate.validTo === null ? 'success' : 'neutral'}>
                {t(rate.validTo === null ? 'admin.tariffs.inForce' : 'admin.tariffs.closed')}
              </Badge>
            ),
          },
        ]}
      />
    </AdminShell>
  );
}
