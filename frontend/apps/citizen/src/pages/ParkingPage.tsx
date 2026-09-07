import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@luparx/i18n';
import { AmountText, Button, Card, ChipGroup, Input, ListRow, Select, StepList, type Step } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { MOCK_VEHICLES, startMockSession } from '../mocks/parkingDomain';

// TODO(domain): zones/rates are hand-seeded here until `/api/v1/admin/zones` and `/api/v1/admin/rates`
// ship and citizen reads them through a public zones endpoint (CONTRACT.md §4 "Dominio parquímetros").
const MOCK_ZONES = [
  { id: 'zone-centro', name: 'Zona Centro' },
  { id: 'zone-escazu', name: 'Zona Escazú centro' },
];

type DurationOption = '30m' | '1h' | '2h' | 'other';
const DURATION_MINUTES: Record<Exclude<DurationOption, 'other'>, number> = { '30m': 30, '1h': 60, '2h': 120 };
const RATE_MINOR_PER_MINUTE = 40000 / 30; // ₡400 per 30 minutes (CONTRACT.md §5 amount_minor, CRC 2 decimals)

export function ParkingPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();

  const [zoneId, setZoneId] = useState('');
  const [spaceCode, setSpaceCode] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [duration, setDuration] = useState<DurationOption>('30m');
  const [customMinutes, setCustomMinutes] = useState(45);

  const durationMinutes = duration === 'other' ? customMinutes : DURATION_MINUTES[duration];
  const amountMinor = Math.round(durationMinutes * RATE_MINOR_PER_MINUTE);
  const zone = MOCK_ZONES.find((z) => z.id === zoneId);
  const vehicle = MOCK_VEHICLES.find((v) => v.id === vehicleId);

  const step1Done = Boolean(zoneId && spaceCode);
  const step2Done = Boolean(vehicleId);
  const step3Done = duration !== 'other' || customMinutes > 0;
  const canSubmit = step1Done && step2Done && step3Done;

  const activeIndex = !step1Done ? 0 : !step2Done ? 1 : !step3Done ? 2 : 3;
  const stateFor = (index: number): Step['state'] => (index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending');

  function handleSubmit(): void {
    if (!canSubmit || !zone || !vehicle) return;
    startMockSession({
      vehiclePlate: vehicle.plate,
      zoneName: zone.name,
      spaceCode,
      durationMinutes,
      amountMinor,
    });
    navigate('/');
  }

  const steps: Step[] = useMemo(
    () => [
      {
        title: t('citizen.parking.step1.title'),
        state: stateFor(0),
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
            <Select
              aria-label={t('citizen.parking.step1.zoneLabel')}
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              placeholder={t('citizen.parking.step1.zoneLabel')}
              options={MOCK_ZONES.map((z) => ({ value: z.id, label: z.name }))}
            />
            <Input
              aria-label={t('citizen.parking.step1.spaceLabel')}
              placeholder={t('citizen.parking.step1.spaceLabel')}
              value={spaceCode}
              onChange={(e) => setSpaceCode(e.target.value)}
            />
          </div>
        ),
      },
      {
        title: t('citizen.parking.step2.title'),
        state: stateFor(1),
        content: (
          <Card nested>
            {MOCK_VEHICLES.map((v) => (
              <ListRow
                key={v.id}
                title={v.plate}
                meta={v.label}
                onClick={() => setVehicleId(v.id)}
                value={vehicleId === v.id ? t('common.yes') : undefined}
              />
            ))}
          </Card>
        ),
      },
      {
        title: t('citizen.parking.step3.title'),
        state: stateFor(2),
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
        state: stateFor(3),
        content: (
          <Card nested>
            <ListRow
              title={t('citizen.parking.step4.totalLabel')}
              meta={t('citizen.parking.step4.payWith')}
              value={<AmountText amountMinor={-amountMinor} currencyCode="CRC" locale={locale} />}
            />
          </Card>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoneId, spaceCode, vehicleId, duration, customMinutes, amountMinor],
  );

  return (
    <CitizenShell title={t('citizen.parking.title')} onBack={() => navigate('/')}>
      <StepList steps={steps} />
      <Button type="button" fullWidth disabled={!canSubmit} onClick={handleSubmit}>
        {t('citizen.parking.submit')}
      </Button>
    </CitizenShell>
  );
}
