import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor, type TranslationKey } from '@luparx/i18n';
import {
  Button,
  Card,
  ChipGroup,
  IconCar,
  IconChevronRight,
  IconPin,
  Input,
  ListRow,
  Select,
  StepList,
  type Step,
} from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { MOCK_CURRENCY_CODE, MOCK_VEHICLES, MOCK_ZONES, primaryVehicle, startMockSession } from '../mocks/parkingDomain';

type DurationOption = '30m' | '1h' | '2h' | 'other';
const DURATION_MINUTES: Record<Exclude<DurationOption, 'other'>, number> = { '30m': 30, '1h': 60, '2h': 120 };
// TODO(domain): fixed price tiers stand in for `/api/v1/admin/rates` (CONTRACT.md §4 "Dominio parquímetros").
const AMOUNT_MINOR_BY_DURATION: Record<Exclude<DurationOption, 'other'>, number> = {
  '30m': 27500,
  '1h': 55000,
  '2h': 110000,
};
const RATE_MINOR_PER_MINUTE = AMOUNT_MINOR_BY_DURATION['1h'] / 60;

export function ParkingPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();

  // Non-null: MOCK_ZONES/MOCK_VEHICLES are non-empty compile-time constants.
  const [zoneId, setZoneId] = useState(MOCK_ZONES[0]!.id);
  const [vehicleId, setVehicleId] = useState(primaryVehicle().id);
  const [duration, setDuration] = useState<DurationOption>('1h');
  const [customMinutes, setCustomMinutes] = useState(45);

  const zone = MOCK_ZONES.find((z) => z.id === zoneId) ?? MOCK_ZONES[0]!;
  const vehicle = MOCK_VEHICLES.find((v) => v.id === vehicleId) ?? primaryVehicle();
  const durationMinutes = duration === 'other' ? customMinutes : DURATION_MINUTES[duration];
  const amountMinor =
    duration === 'other' ? Math.round(customMinutes * RATE_MINOR_PER_MINUTE) : AMOUNT_MINOR_BY_DURATION[duration];
  const durationLabel =
    duration === 'other'
      ? tPlural('citizen.parking.step4.customDuration', customMinutes)
      : t(`citizen.parking.step3.duration.${duration}` as TranslationKey);

  function cycleVehicle(): void {
    const index = MOCK_VEHICLES.findIndex((v) => v.id === vehicleId);
    setVehicleId(MOCK_VEHICLES[(index + 1) % MOCK_VEHICLES.length]!.id);
  }

  function handleSubmit(): void {
    startMockSession({
      vehiclePlate: vehicle.plate,
      zoneName: zone.name,
      spaceCode: zone.spaceCode,
      durationMinutes,
      amountMinor,
    });
    navigate('/');
  }

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
              options={MOCK_ZONES.map((z) => ({ value: z.id, label: z.name }))}
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
        content: (
          <Card nested>
            <ListRow
              icon={<IconCar size={18} />}
              title={vehicle.plate}
              meta={`${vehicle.brand} ${vehicle.model} · ${vehicle.year}`}
              value={<IconChevronRight size={16} />}
              onClick={cycleVehicle}
            />
          </Card>
        ),
      },
      {
        title: t('citizen.parking.step3.title'),
        state: 'active',
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
            <ChipGroup
              aria-label={t('citizen.parking.step3.title')}
              value={duration}
              onChange={setDuration}
              options={[
                { value: '30m', label: t('citizen.parking.step3.duration.30m') },
                { value: '1h', label: t('citizen.parking.step3.duration.1h') },
                { value: '2h', label: t('citizen.parking.step3.duration.2h') },
                { value: 'other', label: t('citizen.parking.step3.duration.other') },
              ]}
            />
            {duration === 'other' ? (
              <Input
                type="number"
                min={5}
                step={5}
                aria-label={t('citizen.parking.step3.duration.other')}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(Number(e.target.value))}
              />
            ) : null}
          </div>
        ),
      },
      {
        title: t('citizen.parking.step4.title'),
        state: 'active',
        content: (
          <Card nested>
            <ListRow title={t('citizen.parking.step4.zoneLabel')} value={`${zone.name} (${zone.spaceCode})`} />
            <ListRow title={t('citizen.parking.step4.vehicleLabel')} value={vehicle.plate} />
            <ListRow title={t('citizen.parking.step4.durationLabel')} value={durationLabel} />
            <ListRow
              title={t('citizen.parking.step4.amountLabel')}
              value={formatCurrencyMinor(amountMinor, MOCK_CURRENCY_CODE, locale)}
            />
          </Card>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoneId, vehicleId, duration, customMinutes, amountMinor, durationLabel, zone, vehicle, locale],
  );

  return (
    <CitizenShell title={t('citizen.parking.title')} subtitle={t('citizen.parking.subtitle')} onBack={() => navigate('/')}>
      <StepList steps={steps} />
      <Button type="button" variant="primary" fullWidth onClick={handleSubmit}>
        {t('citizen.parking.submit')}
      </Button>
    </CitizenShell>
  );
}
