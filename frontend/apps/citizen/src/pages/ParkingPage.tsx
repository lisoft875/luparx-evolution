import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor, formatWeekdayTime } from '@luparx/i18n';
import { TenantSwitchControl } from '@luparx/features';
import {
  Alert,
  Button,
  Card,
  ErrorDialog,
  FormField,
  IconCar,
  IconPin,
  IconPlus,
  Input,
  ListRow,
  RadioCardGroup,
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
  useWallet,
  useTimeCredits,
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
  const { data: timeCredits } = useTimeCredits();

  /**
   * The stay lengths sold **in the chosen zone**.
   *
   * `sessionIncrementsMinutes` is not a suggestion the minimum and maximum then widen: the server
   * refuses anything not on that list with `INVALID_INCREMENT` and explicitly never rounds to the
   * nearest one. So the client offers exactly the published options, bounded by the same minimum
   * and maximum the server applies — a free-text minute box would only manufacture requests that
   * are certain to be refused.
   *
   * Since v0.31 a zone may sell different durations and a shorter maximum than its municipality —
   * two hours in the historic centre, more on the edges — so the list comes from the zone when the
   * zone carries one. Falling back to the municipality's is what keeps this working against a
   * server older than v0.31, where zones did not carry rules at all.
   */
  const zoneMaxMinutes = zone?.sessionMaxMinutes ?? policy?.sessionMaxMinutes;
  const incrementMinutes = useMemo(
    () => {
      const offered = zone?.sessionIncrementsMinutes ?? policy?.sessionIncrementsMinutes ?? [];
      const min = zone?.sessionMinMinutes ?? policy?.sessionMinMinutes ?? 0;
      const max = zone?.sessionMaxMinutes ?? policy?.sessionMaxMinutes ?? Infinity;
      return offered.filter((option) => option >= min && option <= max);
    },
    [
      zone?.sessionIncrementsMinutes,
      zone?.sessionMinMinutes,
      zone?.sessionMaxMinutes,
      policy?.sessionIncrementsMinutes,
      policy?.sessionMinMinutes,
      policy?.sessionMaxMinutes,
    ],
  );

  /**
   * The minutes the citizen has saved in this municipality, as a duration of their own — when they
   * have any and it is not already one of the increments above (CONTRACT.md v0.12).
   *
   * Saved minutes come from finishing early and almost never land on an offered option: 44 left
   * over from an hour, against a list of 30, 60 and 120. Without this entry they can only be spent
   * inside a longer stay — ask for 60 and the 44 come off it, ask for 30 and 14 stay behind — and
   * there is no way to say "just use what I have". The municipality's *minimum* deliberately does
   * not apply: it is the shortest stay it sells, and this time was paid for already.
   */
  const savedMinutes = timeCredits?.minutes ?? 0;
  const savedMinutesOption =
    savedMinutes > 0 &&
    savedMinutes <= (zoneMaxMinutes ?? Infinity) &&
    !incrementMinutes.includes(savedMinutes)
      ? savedMinutes
      : null;

  // First, because it is free and it is theirs — then the municipality's ladder.
  const offeredMinutes = useMemo(
    () => (savedMinutesOption !== null ? [savedMinutesOption, ...incrementMinutes] : incrementMinutes),
    [savedMinutesOption, incrementMinutes],
  );

  /**
   * Preselected: the municipality's shortest sold stay — deliberately **not** the saved-minute
   * option, even though that one is listed first and costs nothing.
   *
   * <p>Saved minutes are whatever was left over, which can be three. Opening the screen already set
   * to a three-minute stay would let somebody who came to park for an hour start one with a tap,
   * and they would find out at the windscreen. Being at the top of the list is what makes it easy
   * to choose; being chosen for them is what makes it a trap. Preselecting the smallest sold
   * duration is also stable — it does not depend on whether the credit balance arrived before the
   * policy did, which is what it depended on until this was written down.</p>
   */
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    if (minutes !== null) return;
    const preselected = incrementMinutes[0] ?? offeredMinutes[0];
    if (preselected !== undefined) setMinutes(preselected);
  }, [minutes, incrementMinutes, offeredMinutes]);

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
  // Told which car, so the courtesy of v0.31 is priced into what the picker shows: a screen that
  // said ₡500 and then charged nothing would be the screen lying, and so would the reverse.
  const quoteVehicleId = isGuest ? null : (vehicleId ?? null);
  const quotePlate = isGuest ? (guestPlateNormalized || null) : null;
  const durationQuotes = useParkingQuotes(quoteZoneId, offeredMinutes, quoteVehicleId, quotePlate);
  const { data: quote } = useParkingQuote(quoteZoneId, minutes, quoteVehicleId, quotePlate);
  const { data: schedule } = useParkingSchedule();
  // El saldo, para poder decirlo ANTES de confirmar y no descubrirlo en un error al enviar.
  const walletQuery = useWallet();

  // Saldo corto, detectado ANTES de enviar. Sólo cuando los dos números están: sin la billetera
  // cargada no se afirma que falta plata —eso bloquearía el botón por no haber respondido todavía—
  // y con `payableMinor` en 0 no hay nada que pagar.
  const faltante =
    walletQuery.data && quote && quote.payableMinor > 0
      ? quote.payableMinor - walletQuery.data.balanceMinor
      : 0;
  const saldoCorto = faltante > 0;
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
   * Whether the quote on screen is a courtesy one.
   *
   * Read from the numbers rather than from a flag on the wire: a stay that costs nothing, spends no
   * saved minutes, and is short enough for this zone's courtesy is one — and inferring it here keeps
   * the client working against a server that has not been told to say so.
   */
  const isCourtesyQuote =
    quote !== undefined &&
    quote.payableMinor === 0 &&
    quote.creditMinutesApplied === 0 &&
    (zone?.freeMinutes ?? 0) > 0 &&
    quote.minutes <= (zone?.freeMinutes ?? 0);

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
                  /*
                    Teclado numérico cuando lo que hay que teclear son sólo dígitos. La persona
                    escribe el código COMPLETO, prefijo incluido, así que un prefijo con letras
                    («A-001») necesita el teclado de texto de verdad.

                    Antes era `!spaceFormat.prefix`, que descartaba también los prefijos numéricos y,
                    peor, dejaba `text` mientras el formato venía en camino: en una municipalidad
                    puramente numérica el teclado salía alfabético al abrir la pantalla y sólo
                    cambiaba después, cuando el campo ya podía estar enfocado —y iOS no rehace el
                    teclado de un campo enfocado—. Con el formato en vuelo se asume numérico, que es
                    el caso de la gran mayoría.
                  */
                  inputMode={
                    !spaceFormat || (!spaceFormat.allowLetters && /^[0-9-]*$/.test(spaceFormat.prefix))
                      ? 'numeric'
                      : 'text'
                  }
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
                {/*
                  Tarjetas de opción y NO un desplegable. El precio de cada duración ya se calculaba
                  —lo da el servidor, acá no se multiplica nada—, pero vivía aplastado en la línea
                  `detail` de un `<Select>`, unido con «·» y escondido hasta abrir la lista: elegir
                  cuánto tiempo y saber cuánto cuesta eran dos gestos distintos.

                  Ahora es el mismo patrón que ya usa «Extender tiempo» para la misma decisión:
                  duración a la izquierda, monto como badge a la derecha, todas las opciones a la
                  vista. El beneficio de la zona se enuncia UNA vez arriba como contexto, en vez de
                  repetirse en cada fila, y el «GRATIS» de una opción cubierta por ese beneficio se
                  dice con palabra y no sólo con un ₡0 que se lee como «estacionar es gratis».
                */}
                {(zone?.freeMinutes ?? 0) > 0 ? (
                  <p className="lx-text-meta" style={{ margin: 0 }}>
                    {t('citizen.parking.step3.benefitHeading')}:{' '}
                    {t('citizen.parking.step3.freeMinutesBenefit', {
                      minutes: tPlural('citizen.parking.durationMinutes', zone?.freeMinutes ?? 0),
                    })}
                  </p>
                ) : null}
                <RadioCardGroup
                  name="parking-minutes"
                  legend={t('citizen.parking.step3.title')}
                  value={minutes !== null ? String(minutes) : ''}
                  onChange={(value) => setMinutes(Number(value))}
                  options={offeredMinutes.map((option) => {
                    const optionQuote = durationQuotes.get(option);
                    // Cubierta por el beneficio de la zona: ni cuesta ni gasta minutos propios.
                    const porBeneficio =
                      option !== savedMinutesOption &&
                      optionQuote &&
                      optionQuote.payableMinor === 0 &&
                      optionQuote.creditMinutesApplied === 0 &&
                      (zone?.freeMinutes ?? 0) > 0 &&
                      option <= (zone?.freeMinutes ?? 0);
                    return {
                      value: String(option),
                      label: formatDurationLabel(option, tPlural),
                      // El monto del servidor, tal cual. Nunca minutos × tarifa, ni de vista previa.
                      // Ausente mientras su cotización está en vuelo: una duración sin precio se
                      // puede elegir igual y el resumen dice el monto antes de cobrar nada.
                      trailing: porBeneficio
                        ? t('citizen.parking.step3.freeBadge')
                        : optionQuote
                          ? formatCurrencyMinor(optionQuote.payableMinor, optionQuote.currencyCode, locale)
                          : undefined,
                      detail:
                        [
                          option === savedMinutesOption ? t('citizen.parking.step3.savedMinutes') : undefined,
                          option === savedMinutesOption
                            ? undefined
                            : optionQuote && optionQuote.creditMinutesApplied > 0
                              ? t('citizen.parking.step3.creditApplied', {
                                  minutes: tPlural(
                                    'citizen.parking.durationMinutes',
                                    optionQuote.creditMinutesApplied,
                                  ),
                                })
                              : undefined,
                        ]
                          .filter(Boolean)
                          .join(' · ') || undefined,
                    };
                  })}
                />
                {/* One line, and it always states the ceiling — that is the number a person needs
                    before choosing. Since v0.31 it is THIS ZONE's ceiling, which is often lower than
                    the municipality's: saying "up to eight hours" where the zone allows two would be
                    an invitation to be refused at the last step. */}
                <p className="lx-text-meta" style={{ margin: 0 }}>
                  {t(
                    zone?.sessionMaxMinutes !== undefined && zone.sessionMaxMinutes !== p.sessionMaxMinutes
                      ? 'citizen.parking.step3.maxNoticeZone'
                      : 'citizen.parking.step3.maxNotice',
                    { max: formatDurationLabel(zoneMaxMinutes ?? p.sessionMaxMinutes, tPlural) },
                  )}
                </p>
                {/* The courtesy, said before the choice rather than discovered in the summary. */}
                {(zone?.freeMinutes ?? 0) > 0 ? (
                  <p className="lx-text-meta" style={{ margin: 0 }}>
                    {t('citizen.parking.step3.courtesyNotice', {
                      minutes: tPlural('citizen.parking.durationMinutes', zone?.freeMinutes ?? 0),
                    })}
                  </p>
                ) : null}
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
                    discovered on the receipt.

                    A courtesy stay also has nothing chargeable, and it is NOT the same fact: saying
                    "the rest falls outside charging hours" about a free quarter of an hour at ten in
                    the morning is simply untrue, and it is the kind of untrue that teaches a person
                    to stop reading the summary. */}
                {quote.chargeableMinutes !== quote.minutes ? (
                  <ListRow
                    title={t('citizen.parking.step4.chargeableMinutesLabel')}
                    meta={t(
                      isCourtesyQuote ? 'citizen.parking.step4.courtesyHint' : 'citizen.parking.step4.chargeableMinutesHint',
                    )}
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
                {/*
                  Saldo antes y después, que era lo que faltaba para que el resumen respondiera la
                  pregunta completa: no «cuánto cuesta» sino «puedo pagarlo y con qué me quedo».
                  La resta la hace el cliente, pero los dos números son del servidor: `payableMinor`
                  de la cotización y `balanceMinor` de la billetera. Acá no se calcula ninguna
                  tarifa.
                */}
                {walletQuery.data ? (
                  <>
                    <ListRow
                      title={t('citizen.parking.step4.balanceLabel')}
                      value={formatCurrencyMinor(
                        walletQuery.data.balanceMinor,
                        walletQuery.data.currencyCode,
                        locale,
                      )}
                    />
                    {quote.payableMinor > 0 ? (
                      <ListRow
                        title={t('citizen.parking.step4.balanceAfterLabel')}
                        value={
                          <span
                            style={{
                              color:
                                walletQuery.data.balanceMinor - quote.payableMinor < 0
                                  ? 'var(--lx-danger)'
                                  : undefined,
                            }}
                          >
                            {formatCurrencyMinor(
                              walletQuery.data.balanceMinor - quote.payableMinor,
                              walletQuery.data.currencyCode,
                              locale,
                            )}
                          </span>
                        }
                      />
                    ) : null}
                  </>
                ) : null}
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
      {notChargingNotice ? <Alert tone="info">{notChargingNotice}</Alert> : null}
      <StepList steps={steps} />
      {/*
        CTA fijo sobre la barra de pestañas. Antes era un hijo inline de `main` después de cinco
        pasos de formulario: en un teléfono quedaba fuera de pantalla justo cuando hacía falta, y la
        persona tenía que buscarlo con scroll. `.lx-sticky-cta` paga la safe-area y deja espacio a
        la barra inferior.

        Y cuando el saldo no alcanza, el botón principal cambia de destino en vez de dejar enviar y
        fallar: el mismo patrón que ya usa PayFineDialog para las multas. La selección NO se pierde
        —esta pantalla mantiene su estado y se vuelve con «atrás»—, así que recargar no obliga a
        rehacer zona, espacio, vehículo y duración.
      */}
      <div className="lx-sticky-cta">
        {saldoCorto ? (
          <>
            <p className="lx-sticky-cta__notice">
              {t('citizen.parking.step4.shortBy', {
                amount: formatCurrencyMinor(
                  faltante,
                  walletQuery.data?.currencyCode ?? quote?.currencyCode ?? 'CRC',
                  locale,
                ),
              })}
            </p>
            <Button type="button" variant="primary" fullWidth onClick={() => navigate('/wallet')}>
              {t('citizen.parking.step4.topUpCta')}
            </Button>
          </>
        ) : (
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
        )}
      </div>
      {/* The submit button sits under four steps of form: a refusal rendered at the top of the page
          is off screen at the moment it arrives. It interrupts instead. */}
      <ErrorDialog
        open={error !== null}
        onClose={() => setError(null)}
        title={t('citizen.parking.error.title')}
        message={error ?? ''}
        closeLabel={t('common.close')}
        dismissLabel={t('common.understood')}
      />
    </CitizenShell>
  );
}
