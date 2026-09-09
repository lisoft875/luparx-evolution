import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor, formatWeekdayTime } from '@luparx/i18n';
import { TenantSwitchControl } from '@luparx/features';
import {
  Alert,
  Button,
  Card,
  FormField,
  IconCar,
  IconClock,
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
import { catalogLabeller, vehicleDescriptor, vehicleOptionDetail } from '../lib/vehiclePresentation';
import { CitizenShell } from '../components/CitizenShell';
import { QueryBoundary } from '../components/QueryBoundary';
import {
  useParkingPolicy,
  useParkingQuote,
  useParkingQuotes,
  useParkingSchedule,
  useParkingSpaceFormat,
  useParkingZones,
  useStartParkingSession,
  useVehicleColorCatalog,
  useVehicleTypeCatalog,
  useVehicles,
} from '../lib/queries';

/**
 * The value of the "someone else's car" entry in the vehicle dropdown.
 *
 * <p>A sentinel and not `null`, because "nothing chosen yet" and "chosen: a car that is not mine"
 * are different states and the submit button has to tell them apart. It cannot collide with a
 * vehicle id: those are UUIDs.</p>
 */
const GUEST_VEHICLE = '__guest__';

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
  const typeCatalogQuery = useVehicleTypeCatalog();
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  useEffect(() => {
    if (!vehicleId && vehicles && vehicles.length > 0) {
      setVehicleId(vehicles.find((v) => v.isPrimary)?.id ?? vehicles[0]!.id);
    }
  }, [vehicleId, vehicles]);
  const vehicle = vehicles?.find((v) => v.id === vehicleId);

  // Parking somebody else's car (CONTRACT.md v0.11): the plate is typed here and stored on the
  // stay, not in the citizen's garage. It lives beside `vehicleId` in the same dropdown rather
  // than behind a separate button because it answers the same question — which car is this for —
  // and a citizen doing a friend a favour should not have to find a different control for it.
  const [guestPlate, setGuestPlate] = useState('');
  const [guestType, setGuestType] = useState('');
  const isGuest = vehicleId === GUEST_VEHICLE;
  const guestPlateNormalized = guestPlate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  useEffect(() => {
    // Defaulted from the server's catalogue, never from a literal here: the day the platform adds a
    // type, this picks up the first one it publishes instead of a value written into this file.
    if (!guestType && typeCatalogQuery.data?.length) setGuestType(typeCatalogQuery.data[0]!.value);
  }, [guestType, typeCatalogQuery.data]);
  const plateForSummary = isGuest ? guestPlateNormalized : (vehicle?.plate ?? '');
  const vehicleChosen = isGuest ? guestPlateNormalized.length > 0 : Boolean(vehicleId);

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
  const offeredMinutes = useMemo(
    () =>
      (policy?.sessionIncrementsMinutes ?? []).filter(
        (option) => option >= (policy?.sessionMinMinutes ?? 0) && option <= (policy?.sessionMaxMinutes ?? Infinity),
      ),
    [policy?.sessionIncrementsMinutes, policy?.sessionMinMinutes, policy?.sessionMaxMinutes],
  );

  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    if (minutes === null && offeredMinutes.length > 0) setMinutes(offeredMinutes[0]!);
  }, [minutes, offeredMinutes]);

  /**
   * Priced only against a zone this municipality actually publishes.
   *
   * Switching municipality replaces the zone list before the local `zoneId` is cleared, and asking
   * for a quote in that gap means quoting the previous municipality's zone against the new one —
   * answered with `PARKING_ZONE_NOT_FOUND`. Deriving the id from the loaded list closes the gap.
   */
  const quoteZoneId = zone ? zoneId : null;
  // A quote per offered duration, so the price rides on the option itself rather than only
  // appearing in the summary after the choice has been made (v0.6, reference screen 5).
  const durationQuotes = useParkingQuotes(quoteZoneId, offeredMinutes);
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

  async function handleSubmit(): Promise<void> {
    if (!vehicleChosen || !minutes || !zoneId || !spaceCode.trim() || spaceProblem) return;
    setError(null);
    try {
      const where = { zoneId, spaceCode: spaceCode.trim().toUpperCase(), minutes };
      // One of the two, never both: the request type says so and the server refuses the pair.
      await startSession.mutateAsync(
        isGuest
          ? { ...where, plate: guestPlateNormalized, vehicleType: guestType }
          : { ...where, vehicleId: vehicleId! },
      );
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
    setMinutes(null);
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
                  onChange={(value) => setZoneId(value)}
                  placeholder={t('common.select.placeholder')}
                  options={list.map((z) => ({
                    value: z.id,
                    label: z.name,
                    detail: z.description || undefined,
                    icon: <IconPin size={16} />,
                  }))}
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
            {/* No `isEmpty` here any more: a citizen with no vehicles of their own can still park
                somebody else's car, and replacing the whole control with "you have no vehicles"
                would take that away from exactly the person most likely to be doing a favour. An
                empty list simply means the dropdown offers the one entry that does not need one. */}
            <QueryBoundary query={vehiclesQuery} errorTitle={t('citizen.parking.step2.title')}>
              {(list) => (
                <Select
                  icon={<IconCar size={18} />}
                  aria-label={t('citizen.parking.step2.selectLabel')}
                  value={vehicleId ?? ''}
                  onChange={(value) => setVehicleId(value)}
                  placeholder={t('common.select.placeholder')}
                  // Plate first, description underneath — the reference product's two-line row.
                  // The plate is what the inspector reads off the windscreen, so it leads.
                  options={[
                    ...list.map((v) => ({
                      value: v.id,
                      label: v.plate,
                      detail: vehicleOptionDetail(v, list, colorOf),
                      icon: <IconCar size={16} />,
                    })),
                    // Last, because it is the exception: the everyday case is one of your own cars.
                    {
                      value: GUEST_VEHICLE,
                      label: t('citizen.parking.step2.guestOption'),
                      detail: t('citizen.parking.step2.guestOptionDetail'),
                      icon: <IconCar size={16} />,
                    },
                  ]}
                />
              )}
            </QueryBoundary>

            {isGuest ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
                <FormField label={t('citizen.parking.step2.guestPlateLabel')} hint={t('citizen.parking.step2.guestPlateHint')}>
                  {({ inputId, describedBy }) => (
                    <Input
                      id={inputId}
                      aria-describedby={describedBy}
                      value={guestPlate}
                      onChange={(e) => setGuestPlate(e.target.value)}
                      // Same normalisation the server applies, shown as the person types, so the
                      // plate on the summary is the plate the inspector will look for.
                      onBlur={() => setGuestPlate(guestPlateNormalized)}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={16}
                      placeholder={t('citizen.parking.step2.guestPlatePlaceholder')}
                    />
                  )}
                </FormField>
                <QueryBoundary query={typeCatalogQuery} errorTitle={t('citizen.parking.step2.guestTypeLabel')}>
                  {(types) => (
                    <FormField label={t('citizen.parking.step2.guestTypeLabel')}>
                      {({ inputId }) => (
                        <Select
                          id={inputId}
                          value={guestType}
                          onChange={setGuestType}
                          options={types.map((entry) => ({ value: entry.value, label: tKey(entry.labelKey) }))}
                        />
                      )}
                    </FormField>
                  )}
                </QueryBoundary>
              </div>
            ) : (
              /* Reachable whether or not the list is empty: the citizen who has one car and just
                 bought another should not have to leave through the menu to say so. Hidden while a
                 borrowed plate is being typed, because adding a vehicle is the opposite of what
                 that choice means. */
              <Button type="button" variant="ghost" onClick={() => navigate('/vehicles')}>
                <IconPlus size={16} /> {t('citizen.parking.step2.addVehicleCta')}
              </Button>
            )}
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
                {/* Every option here is the municipality's published increment, and every price on
                    it is a quote the server gave for that exact duration in this exact zone. The
                    row of chips this replaced showed three of them and hid the rest behind "Otro",
                    and none of them said what they cost — so the citizen chose a length and only
                    then learnt the price. Nothing in this file computes money. */}
                <Select
                  icon={<IconClock size={18} />}
                  aria-label={t('citizen.parking.step3.title')}
                  value={minutes !== null ? String(minutes) : ''}
                  onChange={(value) => setMinutes(Number(value))}
                  placeholder={t('common.select.placeholder')}
                  options={offeredMinutes.map((option) => {
                    const optionQuote = durationQuotes.get(option);
                    // What would actually leave the wallet, which is what the citizen is deciding
                    // about — and, when the citizen's own minutes brought it down, why. A bare
                    // "₡0" on an option that costs ₡600 to somebody with no credit is a number
                    // nobody can act on.
                    const price = optionQuote
                      ? formatCurrencyMinor(optionQuote.payableMinor, optionQuote.currencyCode, locale)
                      : undefined;
                    const credited =
                      optionQuote && optionQuote.creditMinutesApplied > 0
                        ? t('citizen.parking.step3.creditApplied', {
                            minutes: tPlural('citizen.parking.durationMinutes', optionQuote.creditMinutesApplied),
                          })
                        : undefined;
                    return {
                      value: String(option),
                      label: formatDurationLabel(option, tPlural),
                      // Absent while its quote is still in flight, and absent for good if that
                      // request failed: a duration without a price is still choosable, and the
                      // summary below states the amount before anything is charged.
                      detail: price ? [price, credited].filter(Boolean).join(' · ') : undefined,
                      icon: <IconClock size={16} />,
                    };
                  })}
                />
                {/* One line, and it always states the municipality's ceiling — that is the number
                    a person needs before choosing. */}
                <p className="lx-text-meta" style={{ margin: 0 }}>
                  {t('citizen.parking.step3.maxNotice', {
                    max: formatDurationLabel(p.sessionMaxMinutes, tPlural),
                  })}
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
                isGuest
                  ? // A borrowed car has no record to describe, so the line says what it is instead
                    // of leaving the plate to stand alone as if it were one of the citizen's own.
                    t('citizen.parking.step2.guestOption')
                  : vehicle
                    ? vehicleDescriptor(vehicle, { includeName: true, colorLabel: colorOf(vehicle.color) }) || undefined
                    : undefined
              }
              value={plateForSummary || '—'}
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
      isGuest,
      guestPlate,
      guestPlateNormalized,
      guestType,
      plateForSummary,
      typeCatalogQuery,
      colorCatalogQuery.data,
      policyQuery,
      policy,
      offeredMinutes,
      durationQuotes,
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
        disabled={!vehicleChosen || !minutes || !quote || !zoneId || spaceCode.trim().length === 0 || Boolean(spaceProblem)}
        onClick={handleSubmit}
      >
        {t('citizen.parking.submit')}
      </Button>
    </CitizenShell>
  );
}
