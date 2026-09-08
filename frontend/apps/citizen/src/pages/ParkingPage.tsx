import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor, formatWeekdayTime } from '@luparx/i18n';
import {
  Alert,
  Button,
  Card,
  ChipGroup,
  FormField,
  IconCar,
  IconChevronRight,
  IconPin,
  Input,
  ListRow,
  Select,
  StepList,
  type Step,
} from '@luparx/ui';
import { formatDurationLabel } from '../lib/duration';
import { parkingErrorMessage } from '../lib/apiErrors';
import { CitizenShell } from '../components/CitizenShell';
import {
  useParkingPolicy,
  useParkingQuote,
  useParkingSchedule,
  useParkingZones,
  useStartParkingSession,
  useVehicles,
} from '../lib/queries';

export function ParkingPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();

  const { data: zones } = useParkingZones();
  const [zoneId, setZoneId] = useState<string>('');
  useEffect(() => {
    if (!zoneId && zones && zones.length > 0) setZoneId(zones[0]!.id);
  }, [zoneId, zones]);
  const zone = zones?.find((z) => z.id === zoneId) ?? null;

  // The bay code as it is painted on the ground. Kept as typed-in text rather than derived from
  // the zone: one zone holds hundreds of bays, and only the person standing in one knows which.
  const [spaceCode, setSpaceCode] = useState('');

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

  const { data: quote } = useParkingQuote(zoneId || null, minutes);
  const { data: schedule } = useParkingSchedule();
  const startSession = useStartParkingSession();
  const [error, setError] = useState<string | null>(null);

  // "Right now the municipality is not charging." Said before the citizen picks anything, because
  // it changes what the whole screen means (CONTRACT.md v0.3 §"Horario de cobro"): starting a stay
  // outside the charging bands is refused with OUTSIDE_CHARGING_HOURS, and a citizen who was not
  // told will read that as a broken app rather than as a Sunday.
  const notChargingNotice =
    schedule && !schedule.chargingNow
      ? schedule.nextChargingStartsAt
        ? t('citizen.parking.schedule.notChargingWithResume', {
            resumesAt: formatWeekdayTime(schedule.nextChargingStartsAt, locale, { timeZone: schedule.timeZone }),
          })
        : t('citizen.parking.schedule.notCharging')
      : null;

  function cycleVehicle(): void {
    if (!vehicles || vehicles.length === 0) return;
    const index = vehicles.findIndex((v) => v.id === vehicleId);
    setVehicleId(vehicles[(index + 1) % vehicles.length]!.id);
  }

  async function handleSubmit(): Promise<void> {
    if (!vehicleId || !minutes || !zoneId || !spaceCode.trim()) return;
    setError(null);
    try {
      await startSession.mutateAsync({ zoneId, spaceCode: spaceCode.trim().toUpperCase(), vehicleId, minutes });
      navigate('/');
    } catch (err) {
      setError(parkingErrorMessage(err, t));
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
            {zones && zones.length === 0 ? (
              <Alert tone="danger">{t('citizen.parking.step1.noZones')}</Alert>
            ) : (
              <Select
                icon={<IconPin size={18} />}
                aria-label={t('citizen.parking.step1.zoneLabel')}
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                placeholder={t('common.select.placeholder')}
                options={(zones ?? []).map((z) => ({ value: z.id, label: z.name }))}
              />
            )}
            <FormField label={t('citizen.parking.step1.spaceCodeLabel')} hint={t('citizen.parking.step1.spaceCodeHint')}>
              {({ inputId }) => (
                <Input
                  id={inputId}
                  value={spaceCode}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setSpaceCode(e.target.value.toUpperCase())}
                />
              )}
            </FormField>
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
            <ListRow
              title={t('citizen.parking.step4.zoneLabel')}
              value={zone ? `${zone.name}${spaceCode ? ` (${spaceCode})` : ''}` : '—'}
            />
            <ListRow title={t('citizen.parking.step4.vehicleLabel')} value={vehicle?.plate ?? '—'} />
            <ListRow title={t('citizen.parking.step4.durationLabel')} value={durationLabel || '—'} />
            {quote ? (
              <>
                {/* Only the minutes inside a charging band are billed (CONTRACT.md v0.3): when the
                    stay spills past closing time, the difference is shown rather than left to be
                    discovered on the receipt. */}
                {quote.chargeableMinutes !== quote.minutes ? (
                  <ListRow
                    title={t('citizen.parking.step4.chargeableMinutesLabel')}
                    meta={t('citizen.parking.step4.chargeableMinutesHint')}
                    value={tPlural('citizen.parking.durationMinutes', quote.chargeableMinutes)}
                  />
                ) : null}
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
    [zoneId, zones, zone, spaceCode, vehicle, policy, minutes, durationLabel, quote, locale],
  );

  return (
    <CitizenShell title={t('citizen.parking.title')} subtitle={t('citizen.parking.subtitle')} onBack={() => navigate('/')}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notChargingNotice ? <Alert tone="info">{notChargingNotice}</Alert> : null}
      <StepList steps={steps} />
      <Button
        type="button"
        variant="primary"
        fullWidth
        loading={startSession.isPending}
        disabled={!vehicleId || !minutes || !quote || !zoneId || spaceCode.trim().length === 0}
        onClick={handleSubmit}
      >
        {t('citizen.parking.submit')}
      </Button>
    </CitizenShell>
  );
}
