import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor, formatWeekdayTime } from '@luparx/i18n';
import { TenantSwitchControl } from '@luparx/features';
import {
  Alert,
  Button,
  Card,
  ChipGroup,
  FormField,
  IconCar,
  IconPin,
  IconPlus,
  Input,
  ListRow,
  Select,
  StepList,
  type Step,
} from '@luparx/ui';
import { formatDurationLabel } from '../lib/duration';
import { parkingErrorMessage } from '../lib/apiErrors';
import { checkSpaceCode } from '../lib/spaceCode';
import { catalogLabeller, vehicleDescriptor, vehicleOptionLabel } from '../lib/vehiclePresentation';
import { CitizenShell } from '../components/CitizenShell';
import { QueryBoundary } from '../components/QueryBoundary';
import {
  useParkingPolicy,
  useParkingQuote,
  useParkingSchedule,
  useParkingSpaceFormat,
  useParkingZones,
  useStartParkingSession,
  useVehicleColorCatalog,
  useVehicles,
} from '../lib/queries';

/** Sentinel for the "Otro" chip — a value no duration can collide with. */
const CUSTOM_DURATION = 'custom';

export function ParkingPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const tKey = (key: string): string => t(key as Parameters<typeof t>[0]);

  const zonesQuery = useParkingZones();
  const zones = zonesQuery.data;
  const [zoneId, setZoneId] = useState<string>('');
  useEffect(() => {
    if (!zoneId && zones && zones.length > 0) setZoneId(zones[0]!.id);
  }, [zoneId, zones]);
  const zone = zones?.find((z) => z.id === zoneId) ?? null;

  // The bay code as it is painted on the ground. Kept as typed-in text rather than derived from
  // the zone: one zone holds hundreds of bays, and only the person standing in one knows which.
  const [spaceCode, setSpaceCode] = useState('');
  const spaceFormatQuery = useParkingSpaceFormat();
  const spaceFormat = spaceFormatQuery.data;

  /**
   * What is wrong with the code as typed, judged against this municipality's format and this
   * zone's published range. It is a hint, not a gate on the server's opinion: the submit button
   * still respects it (there is no reason to spend a request on a code that cannot exist), but a
   * code this check likes can still be refused by `POST /sessions`, and that refusal wins.
   */
  const spaceProblem = checkSpaceCode(spaceCode, spaceFormat, zone);
  const spaceCodeError = spaceProblem
    ? spaceProblem.kind === 'format'
      ? t('citizen.parking.step1.spaceCodeError.format', { example: spaceProblem.example })
      : t('citizen.parking.step1.spaceCodeError.range', { first: spaceProblem.first, last: spaceProblem.last })
    : undefined;

  const range = zone?.spaceCodes;
  const spaceCodeHint = [
    range && range.count > 1
      ? t('citizen.parking.step1.spaceCodeRange', { first: range.first, last: range.last, count: range.count })
      : range && range.count === 1
        ? t('citizen.parking.step1.spaceCodeRangeSingle', { code: range.first })
        : t('citizen.parking.step1.spaceCodeHint'),
    spaceFormat?.example ? t('citizen.parking.step1.spaceCodeFormat', { example: spaceFormat.example }) : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const vehiclesQuery = useVehicles();
  const vehicles = vehiclesQuery.data;
  const colorCatalogQuery = useVehicleColorCatalog();
  const colorOf = catalogLabeller(colorCatalogQuery.data, tKey);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  useEffect(() => {
    if (!vehicleId && vehicles && vehicles.length > 0) {
      setVehicleId(vehicles.find((v) => v.isPrimary)?.id ?? vehicles[0]!.id);
    }
  }, [vehicleId, vehicles]);
  const vehicle = vehicles?.find((v) => v.id === vehicleId);

  const policyQuery = useParkingPolicy();
  const policy = policyQuery.data;

  /**
   * The stay lengths this municipality actually sells.
   *
   * `sessionIncrementsMinutes` is not a suggestion the minimum and maximum then widen: the server
   * refuses anything not on that list with `INVALID_INCREMENT` and explicitly never rounds to the
   * nearest one. So the client offers exactly the published options, bounded by the same minimum
   * and maximum the server applies — a free-text minute box would only manufacture requests that
   * are certain to be refused.
   */
  const offeredMinutes = (policy?.sessionIncrementsMinutes ?? []).filter(
    (option) => option >= (policy?.sessionMinMinutes ?? 0) && option <= (policy?.sessionMaxMinutes ?? Infinity),
  );
  // Three chips is what fits a phone without the row scrolling; anything the municipality offers
  // beyond that lives behind "Otro" rather than being dropped.
  const CHIP_LIMIT = 3;
  const chipMinutes = offeredMinutes.slice(0, CHIP_LIMIT);
  const otherMinutes = offeredMinutes.slice(CHIP_LIMIT);

  const [presetMinutes, setPresetMinutes] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  useEffect(() => {
    if (presetMinutes === null && !customOpen && chipMinutes.length > 0) setPresetMinutes(chipMinutes[0]!);
  }, [presetMinutes, customOpen, chipMinutes]);

  /**
   * "Otro" is shown disabled, not hidden, when the municipality publishes nothing beyond the chips:
   * the absence of longer stays is its rule, and an option that vanished would read as a missing
   * feature rather than as a decision somebody made.
   */
  const customAvailable = otherMinutes.length > 0;

  const minutes = customOpen ? customMinutes : presetMinutes;

  /**
   * Priced only against a zone this municipality actually publishes.
   *
   * Switching municipality replaces the zone list before the local `zoneId` is cleared, and asking
   * for a quote in that gap means quoting the previous municipality's zone against the new one —
   * answered with `PARKING_ZONE_NOT_FOUND`. Deriving the id from the loaded list closes the gap.
   */
  const quoteZoneId = zone ? zoneId : null;
  const { data: quote } = useParkingQuote(quoteZoneId, minutes);
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

  function handleDurationChange(value: string): void {
    if (value === CUSTOM_DURATION) {
      setCustomOpen(true);
      setCustomMinutes((current) => current ?? otherMinutes[0] ?? null);
      return;
    }
    setCustomOpen(false);
    setPresetMinutes(Number(value));
  }

  async function handleSubmit(): Promise<void> {
    if (!vehicleId || !minutes || !zoneId || !spaceCode.trim() || spaceProblem) return;
    setError(null);
    try {
      await startSession.mutateAsync({ zoneId, spaceCode: spaceCode.trim().toUpperCase(), vehicleId, minutes });
      navigate('/');
    } catch (err) {
      setError(parkingErrorMessage(err, t));
    }
  }

  const durationLabel = minutes !== null ? formatDurationLabel(minutes, tPlural) : '';

  /**
   * Everything chosen below belongs to the municipality that was active when it was chosen: a zone
   * id, a bay code in that municipality's format, a duration priced by its tariff. When the
   * municipality changes, none of it means anything any more, so it is cleared rather than left on
   * screen looking valid. The cached server answers are dropped by TenantCacheReset; these three
   * are local state that nothing else would reset.
   */
  function handleTenantSwitched(): void {
    setZoneId('');
    setSpaceCode('');
    setPresetMinutes(null);
    setCustomOpen(false);
    setCustomMinutes(null);
    setError(null);
  }

  const steps: Step[] = useMemo(
    () => [
      {
        title: t('citizen.parking.step0.title'),
        state: 'active',
        content: <TenantSwitchControl hint={t('tenant.switch.parkingHint')} onSwitched={handleTenantSwitched} />,
      },
      {
        title: t('citizen.parking.step1.title'),
        state: 'active',
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
            <p className="lx-text-meta" style={{ margin: '-4px 0 0 0' }}>
              {t('citizen.parking.step1.description')}
            </p>
            <QueryBoundary
              query={zonesQuery}
              errorTitle={t('citizen.parking.step1.title')}
              isEmpty={(list) => list.length === 0}
              empty={<Alert tone="danger">{t('citizen.parking.step1.noZones')}</Alert>}
            >
              {(list) => (
                <Select
                  icon={<IconPin size={18} />}
                  aria-label={t('citizen.parking.step1.zoneLabel')}
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  placeholder={t('common.select.placeholder')}
                  options={list.map((z) => ({ value: z.id, label: z.name }))}
                />
              )}
            </QueryBoundary>
            <FormField label={t('citizen.parking.step1.spaceCodeLabel')} hint={spaceCodeHint} error={spaceCodeError}>
              {({ inputId, describedBy }) => (
                <Input
                  id={inputId}
                  aria-describedby={describedBy}
                  invalid={Boolean(spaceCodeError)}
                  value={spaceCode}
                  inputMode={spaceFormat && !spaceFormat.allowLetters && !spaceFormat.prefix ? 'numeric' : 'text'}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setSpaceCode(e.target.value.toUpperCase())}
                />
              )}
            </FormField>
            {/* The format is a hint, so its failure is reported where the hint would have been —
                with a way back — instead of blocking a step the citizen could still complete. */}
            {spaceFormatQuery.isError ? (
              <QueryBoundary query={spaceFormatQuery} errorTitle={t('citizen.parking.step1.spaceCodeLabel')}>
                {() => null}
              </QueryBoundary>
            ) : null}
          </div>
        ),
      },
      {
        title: t('citizen.parking.step2.title'),
        state: 'active',
        // Same control as the zone above it, on purpose: two choices of the same kind, made the
        // same way. The card-with-a-chevron this replaced looked like a link to another screen and
        // in fact cycled silently through the list on tap.
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
            <QueryBoundary
              query={vehiclesQuery}
              errorTitle={t('citizen.parking.step2.title')}
              isEmpty={(list) => list.length === 0}
              empty={
                <p className="lx-text-meta" style={{ margin: 0 }}>
                  {t('citizen.parking.step2.empty')}
                </p>
              }
            >
              {(list) => (
                <Select
                  icon={<IconCar size={18} />}
                  aria-label={t('citizen.parking.step2.selectLabel')}
                  value={vehicleId ?? ''}
                  onChange={(e) => setVehicleId(e.target.value)}
                  placeholder={t('common.select.placeholder')}
                  options={list.map((v) => ({ value: v.id, label: vehicleOptionLabel(v, list, colorOf) }))}
                />
              )}
            </QueryBoundary>
            {/* Reachable whether or not the list is empty: the citizen who has one car and just
                bought another should not have to leave through the menu to say so. */}
            <Button type="button" variant="ghost" onClick={() => navigate('/vehicles')}>
              <IconPlus size={16} /> {t('citizen.parking.step2.addVehicleCta')}
            </Button>
          </div>
        ),
      },
      {
        title: t('citizen.parking.step3.title'),
        state: 'active',
        content: (
          <QueryBoundary query={policyQuery} errorTitle={t('citizen.parking.step3.title')}>
            {(p) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
                {/* Every option here is the municipality's: its published increments, plus "Otro"
                    bounded by its own minimum and maximum. Nothing in this file knows what half an
                    hour costs or whether it is even offered. */}
                <ChipGroup
                  aria-label={t('citizen.parking.step3.title')}
                  value={customOpen ? CUSTOM_DURATION : presetMinutes !== null ? String(presetMinutes) : ''}
                  onChange={handleDurationChange}
                  options={[
                    ...chipMinutes.map((option) => ({
                      value: String(option),
                      label: formatDurationLabel(option, tPlural),
                    })),
                    {
                      value: CUSTOM_DURATION,
                      label: t('citizen.parking.step3.customCta'),
                      disabled: !customAvailable,
                    },
                  ]}
                />
                {customOpen && customAvailable ? (
                  <FormField
                    label={t('citizen.parking.step3.customLabel')}
                    hint={t('citizen.parking.step3.customHint', {
                      max: formatDurationLabel(p.sessionMaxMinutes, tPlural),
                    })}
                  >
                    {({ inputId }) => (
                      <Select
                        id={inputId}
                        value={customMinutes !== null ? String(customMinutes) : ''}
                        onChange={(e) => setCustomMinutes(Number(e.target.value))}
                        placeholder={t('common.select.placeholder')}
                        options={otherMinutes.map((option) => ({
                          value: String(option),
                          label: formatDurationLabel(option, tPlural),
                        }))}
                      />
                    )}
                  </FormField>
                ) : null}
                {/* One line, and it always states the municipality's ceiling — that is the number
                    a person needs before choosing. When "Otro" is greyed out it also says why,
                    rather than leaving a dead option unexplained. */}
                <p className="lx-text-meta" style={{ margin: 0 }}>
                  {t(
                    customAvailable ? 'citizen.parking.step3.maxNotice' : 'citizen.parking.step3.customUnavailable',
                    { max: formatDurationLabel(p.sessionMaxMinutes, tPlural) },
                  )}
                </p>
              </div>
            )}
          </QueryBoundary>
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
            <ListRow
              title={t('citizen.parking.step4.vehicleLabel')}
              meta={
                vehicle
                  ? vehicleDescriptor(vehicle, { includeName: true, colorLabel: colorOf(vehicle.color) }) || undefined
                  : undefined
              }
              value={vehicle?.plate ?? '—'}
            />
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
    [
      zoneId,
      zonesQuery,
      zone,
      spaceCode,
      spaceCodeHint,
      spaceCodeError,
      spaceFormat,
      spaceFormatQuery,
      vehiclesQuery,
      vehicle,
      vehicleId,
      colorCatalogQuery.data,
      policyQuery,
      policy,
      presetMinutes,
      customOpen,
      customMinutes,
      customAvailable,
      chipMinutes,
      otherMinutes,
      minutes,
      durationLabel,
      quote,
      locale,
    ],
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
        disabled={!vehicleId || !minutes || !quote || !zoneId || spaceCode.trim().length === 0 || Boolean(spaceProblem)}
        onClick={handleSubmit}
      >
        {t('citizen.parking.submit')}
      </Button>
    </CitizenShell>
  );
}
