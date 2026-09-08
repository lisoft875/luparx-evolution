import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor } from '@luparx/i18n';
import {
  Alert,
  Button,
  Card,
  ChipGroup,
  IconCar,
  IconChevronRight,
  IconPin,
  ListRow,
  Select,
  StepList,
  type Step,
} from '@luparx/ui';
import { useAuth } from '@luparx/auth';
import { formatDurationLabel } from '../lib/duration';
import { parkingErrorKey } from '../lib/apiErrors';
import { CitizenShell } from '../components/CitizenShell';
import { zonesForTenant } from '../mocks/parkingDomain';
import { useParkingPolicy, useParkingQuote, useStartParkingSession, useVehicles } from '../lib/queries';

export function ParkingPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const { me } = useAuth();

  const zones = useMemo(() => zonesForTenant(me?.activeTenant?.id), [me?.activeTenant?.id]);
  // Non-null: `zones` always has at least one entry (zonesForTenant falls back to a default list).
  const [zoneId, setZoneId] = useState(zones[0]!.id);
  const zone = zones.find((z) => z.id === zoneId) ?? zones[0]!;

  const { data: vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  useEffect(() => {
    if (!vehicleId && vehicles && vehicles.length > 0) {
      setVehicleId(vehicles.find((v) => v.isPrimary)?.id ?? vehicles[0]!.id);
    }
  }, [vehicleId, vehicles]);
  const vehicle = vehicles?.find((v) => v.id === vehicleId);

  const { data: policy } = useParkingPolicy();
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    if (minutes === null && policy && policy.sessionIncrementsMinutes.length > 0) {
      setMinutes(policy.sessionIncrementsMinutes[0]!);
    }
  }, [minutes, policy]);

  const { data: quote } = useParkingQuote(zoneId, minutes);
  const startSession = useStartParkingSession();
  const [error, setError] = useState<string | null>(null);

  function cycleVehicle(): void {
    if (!vehicles || vehicles.length === 0) return;
    const index = vehicles.findIndex((v) => v.id === vehicleId);
    setVehicleId(vehicles[(index + 1) % vehicles.length]!.id);
  }

  async function handleSubmit(): Promise<void> {
    if (!vehicleId || !minutes) return;
    setError(null);
    try {
      await startSession.mutateAsync({ zoneId, spaceCode: zone.spaceCode, vehicleId, minutes });
      navigate('/');
    } catch (err) {
      setError(t(parkingErrorKey(err)));
    }
  }

  const durationLabel = minutes !== null ? formatDurationLabel(minutes, tPlural) : '';

  const steps: Step[] = useMemo(
    () => [
      {
        title: t('citizen.parking.step1.title'),
        state: 'active',
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
            <p className="lx-text-meta" style={{ margin: '-4px 0 0 0' }}>
              {t('citizen.parking.step1.description')}
            </p>
            <Select
              icon={<IconPin size={18} />}
              aria-label={t('citizen.parking.step1.zoneLabel')}
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              options={zones.map((z) => ({ value: z.id, label: z.name }))}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-2)', color: 'var(--lx-text-muted)' }}>
                <IconPin size={16} />
                {zone.spaceCode}
              </span>
              <button type="button" className="lx-link-button" onClick={() => undefined}>
                {t('citizen.parking.step1.viewMapCta')}
              </button>
            </div>
          </div>
        ),
      },
      {
        title: t('citizen.parking.step2.title'),
        state: 'active',
        content: vehicle ? (
          <Card nested>
            <ListRow
              icon={<IconCar size={18} />}
              title={vehicle.plate}
              meta={[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || undefined}
              value={<IconChevronRight size={16} />}
              onClick={cycleVehicle}
            />
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
            <p className="lx-text-meta" style={{ margin: 0 }}>
              {t('citizen.parking.step2.empty')}
            </p>
            <Button type="button" variant="outline" onClick={() => navigate('/vehicles')}>
              {t('citizen.parking.step2.addVehicleCta')}
            </Button>
          </div>
        ),
      },
      {
        title: t('citizen.parking.step3.title'),
        state: 'active',
        content: policy ? (
          <ChipGroup
            aria-label={t('citizen.parking.step3.title')}
            value={minutes !== null ? String(minutes) : ''}
            onChange={(value) => setMinutes(Number(value))}
            options={policy.sessionIncrementsMinutes.map((option) => ({
              value: String(option),
              label: formatDurationLabel(option, tPlural),
            }))}
          />
        ) : (
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('common.loading')}
          </p>
        ),
      },
      {
        title: t('citizen.parking.step4.title'),
        state: 'active',
        content: (
          <Card nested>
            <ListRow title={t('citizen.parking.step4.zoneLabel')} value={`${zone.name} (${zone.spaceCode})`} />
            <ListRow title={t('citizen.parking.step4.vehicleLabel')} value={vehicle?.plate ?? '—'} />
            <ListRow title={t('citizen.parking.step4.durationLabel')} value={durationLabel || '—'} />
            {quote ? (
              <>
                <ListRow title={t('citizen.parking.step4.amountLabel')} value={formatCurrencyMinor(quote.amountMinor, quote.currencyCode, locale)} />
                {quote.creditMinutesApplied > 0 ? (
                  <ListRow
                    title={t('citizen.parking.step4.creditAppliedLabel')}
                    value={
                      <span style={{ color: 'var(--lx-success)' }}>
                        {tPlural('citizen.parking.durationMinutes', quote.creditMinutesApplied)}
                      </span>
                    }
                  />
                ) : null}
                <ListRow
                  title={t('citizen.parking.step4.payableLabel')}
                  value={formatCurrencyMinor(quote.payableMinor, quote.currencyCode, locale)}
                />
              </>
            ) : (
              <ListRow title={t('citizen.parking.step4.amountLabel')} value={t('common.loading')} />
            )}
          </Card>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoneId, zones, zone, vehicle, policy, minutes, durationLabel, quote, locale],
  );

  return (
    <CitizenShell title={t('citizen.parking.title')} subtitle={t('citizen.parking.subtitle')} onBack={() => navigate('/')}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <StepList steps={steps} />
      <Button
        type="button"
        variant="primary"
        fullWidth
        loading={startSession.isPending}
        disabled={!vehicleId || !minutes || !quote}
        onClick={handleSubmit}
      >
        {t('citizen.parking.submit')}
      </Button>
    </CitizenShell>
  );
}
