import * as React from 'react';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor, formatWeekdayTime } from '@luparx/i18n';
import { useAuth } from '@luparx/auth';
import { ActiveTenantBadge, TenantSheet } from '@luparx/features';
import type { TranslationKey } from '@luparx/i18n';
import type { ParkingSession } from '@luparx/api-client';
import {
  Alert,
  Button,
  Card,
  ErrorDialog,
  FormField,
  IconCar,
  IconCheck,
  IconPin,
  IconPlus,
  Input,
  ListRow,
  RadioCardGroup,
  Select,
  StepList,
  type Step,
} from '@luparx/ui';
import { VehicleImage } from '../vehicleImages/VehicleImage';
import { formatDurationLabel } from '../lib/duration';
import { parkingErrorMessage } from '../lib/apiErrors';
import { checkSpaceCode } from '../lib/spaceCode';
import { tarifasPorCodigo } from '../lib/tarifaDeZona';
import { ExtendSessionSheet } from '../components/ExtendSessionSheet';

/*
  El mapa llega por `lazy`: MapLibre y su lienzo pesan, y la mayoría de las sesiones de
  estacionamiento se completan sin abrirlo. Así el paquete inicial de esta pantalla queda como
  estaba, y quien no despliega el mapa no descarga nada de él.
*/
const ZoneMap = lazy(() => import('@luparx/ui/map').then((m) => ({ default: m.ZoneMap })));

/*
  La pregunta «¿va a aparecer un mapa?» se importa de su entrada propia y NO de `@luparx/ui/map`:
  desde ahí arrastraría `ZoneMap` al paquete inicial y la carga perezosa de arriba dejaría de
  servir para nada. Medido: con esta entrada el paquete inicial queda igual y MapLibre sigue en su
  propio archivo de 800 kB.

  Hace falta porque esta pantalla OFRECE un botón que promete un mapa, y el 23-10-2026 Javier
  fotografió ese botón diciendo «Ocultar el mapa» sobre una pantalla sin mapa.
*/
import { centroConfigurado, hayProveedorDeMapa, sePuedeDibujarElMapa } from '@luparx/ui/map-disponibilidad';

/*
  Los papelitos de la pantalla «¡Listo!», colocados a mano.

  Ocho piezas y sus posiciones fijas: el boceto las tiene repartidas alrededor del disco y no
  cayendo, así que no hay animación ni azar. Al azar, además, la composición salía distinta en cada
  captura y no se podía comparar con el boceto, que es lo que pidió la orden.
*/
const CONFETI = [
  { x: '14%', y: '18%', color: '#38bdf8', giro: 18 },
  { x: '30%', y: '8%', color: '#f472b6', giro: -24 },
  { x: '68%', y: '10%', color: '#fbbf24', giro: 32 },
  { x: '84%', y: '22%', color: '#8b5cf6', giro: -12 },
  { x: '10%', y: '58%', color: '#34d399', giro: 40 },
  { x: '26%', y: '74%', color: '#60a5fa', giro: -34 },
  { x: '72%', y: '70%', color: '#fbbf24', giro: 22 },
  { x: '88%', y: '56%', color: '#f472b6', giro: -18 },
];
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
  useZonesGeoJson,
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

  const { activeTenant } = useAuth();
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
  /*
    El cambio de municipalidad, en una línea.

    La tarjeta del paso 0 se fue el 23-10-2026 por repetir y por ocupar 135 px encima del mapa. La
    barra superior del portal lleva esta misma insignia... pero SÓLO en las pantallas sin botón de
    volver, y Estacionar tiene uno: quitar la tarjeta sin poner nada dejaba esta pantalla sin
    ninguna forma de cambiar de municipalidad, que es una función, no una decoración.

    Así que se pone la MISMA insignia de la barra, acá, abierta a la MISMA hoja de selección. Una
    línea en vez de una tarjeta, los mismos componentes, y el reseteo del formulario cuelga del
    identificador de la municipalidad activa, así que da igual por dónde se cambie.
  */
  const [cambiarMunicipio, setCambiarMunicipio] = useState(false);
  /** El mapa de la pantalla «¡Listo!», que se abre desde «Ver en el mapa». */
  const [mapaResultado, setMapaResultado] = useState(false);
  /** La hoja de ampliar tiempo, la misma que usa el Inicio. */
  const [ampliarAbierto, setAmpliarAbierto] = useState(false);
  const spaceFormatQuery = useParkingSpaceFormat();
  const spaceFormat = spaceFormatQuery.data;

  /**
   * What is wrong with the code as typed, judged against this municipality's format and this
   * zone's published range. It is a hint, not a gate on the server's opinion: the submit button
   * still respects it (there is no reason to spend a request on a code that cannot exist), but a
   * code this check likes can still be refused by `POST /sessions`, and that refusal wins.
   */
  const spaceProblem = checkSpaceCode(spaceCode, spaceFormat, zone);
  /*
    EL MAPA ABRE CON LA PANTALLA (22-10-2026).

    Hasta hoy aparecía sólo después de que el código de bahía validara, y detrás de un botón: era
    una confirmación de dónde cae la zona que ya se había elegido en la lista. La orden del
    22-10-2026 lo cambia de sitio en el flujo —«mostrar el mapa al ingresar a Estacionar»— y con
    eso el mapa pasa a ser la forma principal de ELEGIR la zona, que es lo que dice el boceto
    aprobado.

    Lo que esto cuesta, dicho para que no se descubra como sorpresa: MapLibre y la petición del
    GeoJSON ahora los paga todo el que entra a Estacionar, no sólo quien abría el mapa. El
    componente se sigue cargando de forma perezosa, así que no entra en el paquete inicial.
  */
  const zonasGeoQuery = useZonesGeoJson(true);
  /** Si llegó al menos un perímetro que dibujar. */
  const hayGeometrias = Boolean(zonasGeoQuery.data && zonasGeoQuery.data.features.length > 0);
  /*
    ¿Va a aparecer un mapa si lo pido? La MISMA pregunta que se hace el componente, con la misma
    función, para que el botón de «¡Listo!» no prometa lo que no va a pasar.

    No se le pasa `hayCentro`: hoy no existe ningún centro por municipalidad que pasarle —ni el
    contrato del ciudadano ni la tabla `tenants` guardan coordenadas—, así que afirmar que lo hay
    sería inventarlo. El día que exista, se añade acá y en el `centro` del componente, y las dos
    pantallas empiezan a mostrar calles sin polígonos sin tocar nada más.
  */
  /*
    El centro con el que mirar cuando la municipalidad todavía no tiene ni un perímetro dibujado.

    NO lo decide esta pantalla ni está escrito en el código: sale de `VITE_MAP_CENTERS`, que llena
    quien despliega con coordenadas que la municipalidad puede verificar. Sin esa variable vale
    `null`, no hay dónde centrar y el mapa no se dibuja —que es lo correcto: centrar en el país ya
    se probó el 21-10 y debajo de «Barrio Amón» apareció Costa Rica y Panamá.
  */
  const centroDelMapa = centroConfigurado(activeTenant?.slug);
  const habraMapa = sePuedeDibujarElMapa({
    estiloConfigurado: hayProveedorDeMapa(),
    hayGeometrias,
    hayCentro: Boolean(centroDelMapa),
  });
  const spaceCodeError = spaceProblem
    ? spaceProblem.kind === 'format'
      ? t('citizen.parking.step1.spaceCodeError.format', { example: spaceProblem.example })
      : t('citizen.parking.step1.spaceCodeError.range', { first: spaceProblem.first, last: spaceProblem.last })
    : undefined;

  const range = zone?.spaceCodes;
  /*
    El rango, y SÓLO el rango (23-10-2026).

    Decía además «Formato: LUP-0001», que es exactamente lo que el propio campo ya muestra como
    texto de ejemplo. Dos líneas de ayuda encima del mapa, y una de las dos repitiendo lo que se
    ve en el renglón de abajo. El formato sigue estando donde hace falta: dentro del campo.
  */
  const spaceCodeHint = range && range.count > 1
    ? t('citizen.parking.step1.spaceCodeRange', { first: range.first, last: range.last, count: range.count })
    : range && range.count === 1
      ? t('citizen.parking.step1.spaceCodeRangeSingle', { code: range.first })
      : t('citizen.parking.step1.spaceCodeHint');

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

  /*
    Qué falta para poder continuar, en el ORDEN del flujo: se nombra lo primero pendiente y no una
    lista de seis cosas. Un botón gris sin explicación obliga a adivinar cuál de los cinco pasos
    quedó a medias, y en un teléfono ni siquiera se ven todos a la vez (auditoría del 22-09-2026).

    El error del código de espacio no entra acá: ya se muestra bajo su propio campo, que es donde
    se corrige, y repetirlo abajo sería decir dos veces lo mismo.
  */
  const faltaParaContinuar: TranslationKey | null = !zoneId
    ? 'citizen.parking.falta.zona'
    : spaceCode.trim().length === 0
      ? 'citizen.parking.falta.espacio'
      : !vehicleChosen
        ? 'citizen.parking.falta.vehiculo'
        : !minutes
          ? 'citizen.parking.falta.duracion'
          : null;
  const startSession = useStartParkingSession();
  const [error, setError] = useState<string | null>(null);

  /*
    El asistente, en cuatro pasos.

    Hasta el 19-10-2026 esta pantalla mostraba los cinco bloques del formulario a la vez y dejaba
    el botón pegado abajo. En un teléfono eso significaba que la barra de validación, el botón y la
    navegación inferior se repartían un tercio de la pantalla y tapaban las opciones de tiempo:
    está fotografiado en staging a 393×852. El arreglo no es margen ni relleno — es que en un
    teléfono sólo cabe UNA decisión a la vez.

      1  Zona y espacio      2  Vehículo y tiempo      3  Confirmar y pagar      4  Resultado

    El estado del formulario NO se toca: sigue siendo el mismo, vive en esta función y sobrevive al
    ir y venir entre pasos. Lo único que cambia es cuánto se muestra de él a la vez.
  */
  const PASOS_TOTALES = 4;
  const [paso, setPaso] = useState(1);
  /*
    Si ya se intentó avanzar con algo incompleto. Antes de intentarlo no se regaña a nadie: el
    aviso «Escribí el código del espacio» ocupaba una barra fija desde que se abría la pantalla,
    tapando el formulario que pedía completar.
  */
  const [intentoAvanzar, setIntentoAvanzar] = useState(false);
  /** La estadía que el servidor creó. Es lo que el paso 4 cuenta; no se inventa ningún dato. */
  const [sesionIniciada, setSesionIniciada] = useState<ParkingSession | null>(null);

  /*
    Cada paso empieza arriba. Sin esto, pasar del paso 1 al 2 deja la ventana donde estaba —a media
    altura del paso anterior— y el paso nuevo parece empezar por la mitad. `auto` y no `smooth`
    porque el contenido ya cambió: animar el recorrido de algo que no está es mareo, no contexto.
  */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [paso]);

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
      const sesion = await startSession.mutateAsync(
        isGuest
          ? { ...where, plate: guestPlateNormalized, vehicleType: guestType }
          : { ...where, vehicleId: vehicleId! },
      );
      /*
        Se muestra el resultado acá y no se salta a Inicio. Volver a la portada dejaba a la persona
        buscando entre tarjetas la confirmación de lo que acababa de hacer; el paso 4 lo dice con
        los datos que devolvió el servidor —hasta cuándo vale, en qué espacio— y ofrece lo que de
        verdad se puede hacer a continuación.
      */
      setSesionIniciada(sesion);
      setPaso(4);
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
  /*
    EL BLOQUE DE «MUNICIPALIDAD» SALIÓ DE ESTA PANTALLA (23-10-2026).

    Era el paso 0 del asistente: una tarjeta con el logo, el nombre, una frase y un botón de
    cambiar. La orden del 23-10 pide no repetir la información municipal en varias secciones y
    recuperar el espacio para el mapa, y esa tarjeta es las dos cosas a la vez: la barra superior
    del portal YA lleva la municipalidad activa y YA abre el mismo selector al tocarla, en todas
    las pantallas. Medido a 390 × 844, la tarjeta costaba 135 px justo encima del mapa.

    Lo que no se puede perder al quitarla es el reseteo: cambiar de municipalidad tiene que
    vaciar la zona, la bahía y el tiempo, porque son de la municipalidad anterior. Antes lo
    disparaba el botón de la tarjeta; ahora cuelga del identificador de la municipalidad activa,
    que es más correcto: resetea venga el cambio de donde venga, incluida la barra superior.
  */
  const municipalidadActiva = activeTenant?.id ?? null;
  const municipalidadPrevia = useRef(municipalidadActiva);
  useEffect(() => {
    if (municipalidadPrevia.current === municipalidadActiva) return;
    municipalidadPrevia.current = municipalidadActiva;
    setZoneId('');
    setSpaceCode('');
    setMinutes(null);
    setError(null);
  }, [municipalidadActiva]);

  const steps: Step[] = useMemo(
    () => [
      {
        title: t('citizen.parking.step1.title'),
        state: 'active',
        content: (
          /*
            EL ORDEN DEL BOCETO APROBADO (23-10-2026, segunda corrección).

            Número de parqueo primero, zona después, y el mapa debajo de los dos. Es lo que pide el
            boceto `03_BOCETO_FINAL_APROBADO` con todas las letras, y la razón se ve en la captura
            de staging que vino con él: con el mapa arriba, el campo del número quedaba por debajo
            del pliegue —el dato que la persona TIENE delante, pintado en el suelo, y que es lo
            primero que quiere escribir.

            Lo que se fue en esta vuelta, y por qué:
              · la tarjeta de la zona — «información repetida»: la zona ya está en el selector y
                dibujada en el mapa; una tercera copia con su propio botón no agregaba nada;
              · las dos notas que listaban los perímetros faltantes — «demasiado texto técnico» y
                «listas extensas de perímetros». Queda UNA línea, sin nombres.

            Y con la tarjeta se fue su botón de confirmar: tocar una zona del mapa AHORA LA ELIGE,
            sin segundo paso. Era el gesto de dos tiempos que la tarjeta justificaba; sin tarjeta,
            pedir una confirmación aparte es pedir dos toques para una decisión.
          */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
            <div className="lx-municipio-linea">
              <ActiveTenantBadge onOpenSelector={() => setCambiarMunicipio(true)} />
            </div>

            {/* 1 · El número de parqueo, lo primero. */}
            <FormField label={t('citizen.parking.step1.spaceCodeLabel')} hint={spaceCodeHint} error={spaceCodeError}>
              {({ inputId, describedBy }) => (
                <Input
                  id={inputId}
                  aria-describedby={describedBy}
                  invalid={Boolean(spaceCodeError)}
                  value={spaceCode}
                  /*
                    El ejemplo que da el servidor para esta municipalidad («0001», «A-12»…), no un
                    literal: el formato lo decide cada una. El boceto escribe «Ej. 1023», que es
                    ilustrativo; el número de verdad lo dice el servidor.
                  */
                  placeholder={spaceFormat?.example ?? undefined}
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

            {/* 2 · La zona, y 3 · el mapa justo debajo. */}
            <QueryBoundary
              query={zonesQuery}
              errorTitle={t('citizen.parking.step1.zoneLabel')}
              isEmpty={(list) => list.length === 0}
              empty={<Alert tone="danger">{t('citizen.parking.step1.noZones')}</Alert>}
            >
              {(list) => (
                <>
                  <FormField label={t('citizen.parking.step1.zoneLabel')}>
                    {() => (
                      <Select
                        icon={<IconPin size={18} />}
                        aria-label={t('citizen.parking.step1.zoneLabel')}
                        nativoEnMovil
                        value={zoneId}
                        onChange={(value) => setZoneId(value)}
                        placeholder={t('citizen.parking.step1.zonePlaceholder')}
                        /*
                          Sólo el nombre. El `detail` traía la descripción de la zona y en staging
                          se vio lo que produce: «Barrio Amón · Barrio Amón, al norte del centr…»,
                          el nombre dos veces y cortado. La descripción no desaparece del sistema;
                          deja de repetirse donde no cabe.
                        */
                        options={list.map((z) => ({
                          value: z.id,
                          label: z.name,
                          icon: <IconPin size={16} />,
                        }))}
                      />
                    )}
                  </FormField>

                  {/*
                    La línea que el boceto pone entre el selector y el mapa. Dice la relación entre
                    los dos controles, que es lo único que no se adivina mirándolos.

                    Sin geometrías NO se escribe nada acá: el mapa no se dibuja y pone su propia
                    nota de una línea en ese mismo hueco. Escribir las dos era el mismo aviso dos
                    veces seguidas, que es justo el texto repetido que la orden manda quitar.
                  */}
                  {hayGeometrias ? (
                    <p className="lx-zonemap-pista">{t('citizen.parking.map.tapHint')}</p>
                  ) : null}

                  <Suspense fallback={<p className="lx-text-meta">{t('citizen.parking.map.loading')}</p>}>
                    <ZoneMap
                      zonas={zonasGeoQuery.data}
                      cargando={zonasGeoQuery.isLoading}
                      error={zonasGeoQuery.isError}
                      onReintentar={() => void zonasGeoQuery.refetch()}
                      /* 280–350 px «adaptable al dispositivo», que es un clamp y no un número. */
                      altoCompacto="clamp(280px, 38vh, 350px)"
                      centro={centroDelMapa ?? undefined}
                      /* La tarifa que el boceto escribe debajo del nombre de cada zona. Sale de
                         las zonas que esta pantalla ya pidió —el GeoJSON no trae precios— y va
                         tal cual la dio el servidor. Las del boceto son ilustrativas. */
                      etiquetas={tarifasPorCodigo(zones, (minor, moneda) =>
                        formatCurrencyMinor(minor, moneda, locale))}
                      zonaDestacada={zone?.code}
                      /*
                        Tocar una zona LA ELIGE. Sin paso intermedio: la tarjeta que justificaba
                        confirmar se fue, y pedir dos toques para una decisión es pedir uno de más.
                        Si el código tocado no está en la lista de la municipalidad —el servidor
                        puede dibujar una zona que no ofrece— no se cambia nada, que es lo honesto:
                        no se puede elegir lo que no se ofrece.
                      */
                      onZonaElegida={(codigo) => {
                        const elegida = zones?.find((z) => z.code === codigo);
                        if (elegida) setZoneId(elegida.id);
                      }}
                      textos={{
                        titulo: t('citizen.parking.map.title'),
                        ampliar: t('citizen.parking.map.expand'),
                        cerrar: t('citizen.parking.map.collapse'),
                        cargando: t('citizen.parking.map.loading'),
                        vacio: t('citizen.parking.map.emptyShort'),
                        errorTitulo: t('citizen.parking.map.error'),
                        reintentar: t('common.retry'),
                        sinProveedor: t('citizen.parking.map.noProvider'),
                        noOficial: t('citizen.parking.map.notOfficial'),
                        noOficialDetalle: t('citizen.parking.map.notOfficialDetail'),
                      }}
                    />
                  </Suspense>
                </>
              )}
            </QueryBoundary>
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
                      // La miniatura del boceto en vez del icono genérico: en una lista de tres
                      // carros, la silueta y el color distinguen de un vistazo cuál es cuál mucho
                      // antes que leer la placa. Dibujo por categoría teñido del color declarado;
                      // nada de marca ni modelo, que el dominio no tiene foto.
                      icon: <VehicleImage vehicleId={v.id} type={v.type} color={v.color} brand={v.brand} model={v.model} year={v.year} size={32} />,
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
                  /*
                    La leyenda queda sólo para quien lee con lector de pantalla: el título del
                    bloque, justo encima, ya dice «Tiempo», y pintarlo dos veces era repetir la
                    misma palabra con dos tipografías distintas a cuatro píxeles de distancia.
                  */
                  legend={t('citizen.parking.step3.title')}
                  hideLegend
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
                      /*
                        Un «₡0» a secas en la lista de duraciones se lee como «estacionar es
                        gratis», y no lo es: puede ser que la municipalidad no esté cobrando a esta
                        hora. Es un estado legítimo —el servidor devuelve `chargeableMinutes: 0`
                        porque ningún minuto de la estadía cae dentro de una banda de cobro— pero
                        decirlo con un número es decirlo mal. Las otras dos razones de un cero ya
                        se nombraban: la cortesía de la zona («GRATIS») y los minutos a favor
                        («incluye N minutos a favor»); faltaba ésta.

                        Por eso se excluyen los minutos a favor de la condición: una opción pagada
                        con crédito también da cero, y ahí el cero ya está explicado en su propia
                        línea. Este rótulo significa UNA cosa —la municipalidad no está cobrando a
                        esta hora— y no debe significar dos.
                      */
                      trailing: porBeneficio
                        ? t('citizen.parking.step3.freeBadge')
                        : optionQuote
                          && optionQuote.chargeableMinutes === 0
                          && optionQuote.payableMinor === 0
                          && optionQuote.creditMinutesApplied === 0
                          ? t('citizen.parking.step3.noChargeBadge')
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
                {/*
                  «Monto» y «A pagar de tu billetera» sólo cuando DIFIEREN. Coinciden siempre que no
                  haya minutos a favor, cortesía ni horario parcial, y entonces son dos filas con el
                  mismo número: ruido que enseña a saltarse el resumen. Cuando difieren, la
                  diferencia es justo lo que hay que ver.
                */}
                {quote.payableMinor !== quote.amountMinor ? (
                  <ListRow
                    title={t('citizen.parking.step4.payableLabel')}
                    value={formatCurrencyMinor(quote.payableMinor, quote.currencyCode, locale)}
                  />
                ) : null}
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

  /*
    Qué hace falta EN ESTE PASO, no en todo el formulario. El aviso de un campo que vive dos pasos
    más adelante no ayuda a nadie: nombra lo que la persona tiene delante.
  */
  const faltaEnEstePaso: TranslationKey | null =
    paso === 1
      ? !zoneId
        ? 'citizen.parking.falta.zona'
        : spaceCode.trim().length === 0
          ? 'citizen.parking.falta.espacio'
          : null
      : paso === 2
        ? !vehicleChosen
          ? 'citizen.parking.falta.vehiculo'
          : !minutes
            ? 'citizen.parking.falta.duracion'
            : null
        : faltaParaContinuar;
  const pasoCompleto = faltaEnEstePaso === null && !(paso === 1 && spaceProblem);

  function avanzar(): void {
    if (!pasoCompleto) {
      setIntentoAvanzar(true);
      return;
    }
    setIntentoAvanzar(false);
    setPaso((actual) => Math.min(actual + 1, 3));
  }
  function retroceder(): void {
    setIntentoAvanzar(false);
    if (paso > 1 && paso < 4) setPaso(paso - 1);
    else navigate('/');
  }

  const pasosRotulos: TranslationKey[] = [
    'citizen.parking.wizard.step1',
    'citizen.parking.wizard.step2',
    'citizen.parking.wizard.step3',
    'citizen.parking.wizard.step4',
  ];

  return (
    /*
      Sin subtítulo (23-10-2026). «Sigue estos pasos para iniciar tu sesión» decía lo que el
      indicador de pasos muestra justo debajo, y costaba 26 px encima del mapa. El boceto no lo
      tiene: su encabezado es «Estacionar» y nada más.
    */
    <CitizenShell title={t('citizen.parking.title')} onBack={retroceder}>
      {notChargingNotice && paso < 4 ? <Alert tone="info">{notChargingNotice}</Alert> : null}
      {/*
        El indicador compacto del boceto: cuatro números en una fila, el actual marcado. Dice dónde
        está la persona y cuánto falta sin gastar la altura que gastaba la lista completa de pasos.

        En el paso 4 NO se dibuja: la pantalla 5 del boceto es una celebración a pantalla completa,
        sin rastro del asistente. Ya no queda nada que recorrer, y el indicador le robaba al símbolo
        de éxito el sitio que el boceto le da.
      */}
      {paso < 4 ? (
      <ol className="lx-pasos" aria-label={t('citizen.parking.wizard.progress', { current: String(paso), total: String(PASOS_TOTALES) })}>
        {pasosRotulos.map((clave, indice) => {
          const numero = indice + 1;
          const estado = numero < paso ? 'hecho' : numero === paso ? 'actual' : 'pendiente';
          return (
            <li key={clave} className={`lx-pasos__paso lx-pasos__paso--${estado}`} aria-current={estado === 'actual' ? 'step' : undefined}>
              <span className="lx-pasos__numero" aria-hidden="true">{estado === 'hecho' ? '✓' : numero}</span>
              <span className="lx-pasos__rotulo">{t(clave)}</span>
            </li>
          );
        })}
      </ol>
      ) : null}
      {/*
        El paso 1 se dibuja SIN el envoltorio de la lista de pasos (23-10-2026).

        Cuando eran dos bloques —Municipalidad y «Zona y espacio»— el título de cada uno hacía
        falta para separarlos. Ahora es uno solo, con sus campos ya rotulados y el indicador de
        pasos justo encima diciendo dónde está la persona: el título «Zona y espacio» repetía esa
        información y costaba 34 px justo encima del mapa. Los pasos 2 y 3 sí tienen dos bloques
        cada uno y conservan su lista.
      */}
      {paso === 1 ? <div className="lx-paso-suelto">{steps[0]?.content}</div> : null}
      {paso === 2 ? <StepList className="lx-step-list--sin-numero" steps={steps.slice(1, 3)} /> : null}
      {paso === 3 ? <StepList className="lx-step-list--sin-numero" steps={steps.slice(3, 4)} /> : null}
      {/*
        La pantalla 5 del boceto: el símbolo de éxito manda, el resumen va compacto debajo.

        El dato es el mismo que antes —zona, vehículo y vencimiento, los tres de la sesión que el
        servidor acaba de crear—; lo que cambia es la composición. Se quitó la tarjeta exterior,
        que convertía la celebración en un formulario más, y la tarjeta anidada dentro de otra.
      */}
      {paso === 4 && sesionIniciada ? (
        <section className="lx-resultado">
          <div className="lx-resultado__celebracion">
            {/* Decorativo y nada más: el lector de pantalla anuncia el título, no los papelitos. */}
            <span className="lx-resultado__confeti" aria-hidden="true">
              {CONFETI.map((p, i) => (
                <i key={i} style={{ left: p.x, top: p.y, background: p.color, transform: `rotate(${p.giro}deg)` }} />
              ))}
            </span>
            <span className="lx-resultado__disco" aria-hidden="true">
              <IconCheck size={44} />
            </span>
          </div>
          <h2 className="lx-resultado__titulo">{t('citizen.parking.result.title')}</h2>
          <p className="lx-resultado__subtitulo">{t('citizen.parking.result.subtitle')}</p>
          <Card className="lx-resultado__resumen">
            <ListRow title={t('citizen.parking.step4.zoneLabel')} value={`${sesionIniciada.zoneName} (${sesionIniciada.spaceCode})`} />
            <ListRow title={t('citizen.parking.step4.vehicleLabel')} value={sesionIniciada.plateSnapshot} />
            <ListRow
              title={t('citizen.parking.result.validUntil')}
              value={formatWeekdayTime(sesionIniciada.expiresAt, locale, { timeZone: schedule?.timeZone })}
            />
          </Card>
          {/*
            «Ver en el mapa» del boceto, y es el mismo mapa del paso 1: la zona de la estadía que
            se acaba de iniciar. No marca la bahía —`parking_spaces` no tiene coordenadas— ni pide
            ubicación.

            El comentario que había acá decía «si la municipalidad no tiene geometrías, el mapa
            base igual se ve». Era falso desde el 22-10, cuando el mapa volvió a depender de la
            geometría, y nadie lo actualizó: un comentario que afirma lo contrario de lo que hace
            el código es peor que ninguno, porque se lee como garantía. Lo que pasa hoy está en
            `sePuedeDibujarElMapa`, en un solo lugar, y esta pantalla lo consulta en `habraMapa`.

            Sin mapa posible va la nota de una línea, no un hueco: la persona acaba de estacionar
            y merece saber por qué no ve el plano, en una frase.
          */}
          {!habraMapa ? (
            <p className="lx-zonemap__nota" role="note">{t('citizen.parking.map.emptyShort')}</p>
          ) : null}
          {habraMapa && mapaResultado ? (
            <Suspense fallback={<p className="lx-text-meta">{t('citizen.parking.map.loading')}</p>}>
              <ZoneMap
                zonas={zonasGeoQuery.data}
                cargando={zonasGeoQuery.isLoading}
                error={zonasGeoQuery.isError}
                onReintentar={() => void zonasGeoQuery.refetch()}
                centro={centroDelMapa ?? undefined}
                etiquetas={tarifasPorCodigo(zones, (minor, moneda) =>
                  formatCurrencyMinor(minor, moneda, locale))}
                  /* El mapa abre encuadrado en la zona elegida, no sobre toda la municipalidad. */
                  zonaDestacada={zone?.code}
                textos={{
                  titulo: t('citizen.parking.map.title'),
                  ampliar: t('citizen.parking.map.expand'),
                  cerrar: t('citizen.parking.map.collapse'),
                  cargando: t('citizen.parking.map.loading'),
                  /*
                    La MISMA línea breve que el paso 1, y no el párrafo largo que había acá. Ése
                    es el texto que se lee en la captura de staging del 23-10 —tres renglones
                    explicando que el estacionamiento funciona igual, debajo de una pantalla que ya
                    dice que el estacionamiento está activo—, y la orden manda quitarlo.
                  */
                  vacio: t('citizen.parking.map.emptyShort'),
                  errorTitulo: t('citizen.parking.map.error'),
                  reintentar: t('common.retry'),
                  sinProveedor: t('citizen.parking.map.noProvider'),
                  noOficial: t('citizen.parking.map.notOfficial'),
                  noOficialDetalle: t('citizen.parking.map.notOfficialDetail'),
                }}
              />
            </Suspense>
          ) : null}
        </section>
      ) : null}
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
      {/*
        UN patrón de llamada a la acción por paso, y sólo uno.

        El aviso de lo que falta aparece acá únicamente DESPUÉS de intentar avanzar. Antes vivía
        fijo en esta barra desde que se abría la pantalla: dos renglones permanentes que, sumados
        al botón y a la navegación inferior, tapaban el formulario en un teléfono.
      */}
      <div className="lx-sticky-cta">
        {paso === 4 ? (
          <>
            {/*
              El boceto pone «Ampliar tiempo» como acción principal, y existe: es la misma hoja que
              usa el Inicio. Va sólo si la municipalidad permite extender —`policy.extensionEnabled`,
              la misma condición que el Inicio—, porque un botón que el servidor va a rechazar es
              peor que ningún botón.

              «Compartir comprobante», la tercera acción del boceto, NO está: no existe comprobante
              que compartir en ninguna parte de la aplicación, y el boceto no autoriza inventarlo.
            */}
            {policy?.extensionEnabled ? (
              <Button type="button" variant="primary" fullWidth onClick={() => setAmpliarAbierto(true)}>
                <IconPlus size={16} /> {t('citizen.parking.result.extendCta')}
              </Button>
            ) : null}
            {/*
              EL BOTÓN SÓLO EXISTE SI VA A APARECER UN MAPA (23-10-2026).

              Antes estaba siempre, y en staging Javier lo fotografió diciendo «Ocultar el mapa»
              sobre una pantalla sin mapa: ocultar y volver a mostrar no arreglaba nada porque no
              había nada. El estado del botón era la intención de la persona; lo que se dibujaba
              dependía de otros datos, y cuando los dos no coincidían el que mentía era el rótulo.

              La corrección no es cambiar el texto: es no ofrecer la acción. Un botón que promete
              un mapa y no lo entrega es peor que no tener botón, y en su lugar queda la nota de
              una línea que dice por qué no hay mapa. Cuando sí lo hay, funciona como siempre.
            */}
            {habraMapa ? (
              <Button
                type="button"
                variant={policy?.extensionEnabled ? 'outline' : 'primary'}
                fullWidth
                aria-expanded={mapaResultado}
                onClick={() => setMapaResultado((v) => !v)}
              >
                <IconPin size={16} />{' '}
                {mapaResultado ? t('citizen.parking.result.hideMap') : t('citizen.parking.result.seeOnMap')}
              </Button>
            ) : null}
            <Button type="button" variant="outline" fullWidth onClick={() => navigate('/')}>
              {t('citizen.parking.result.seeMine')}
            </Button>
          </>
        ) : paso === 3 && saldoCorto ? (
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
        ) : paso === 3 ? (
          <Button
            type="button"
            variant="primary"
            fullWidth
            loading={startSession.isPending}
            disabled={!vehicleChosen || !minutes || !quote || !zoneId || spaceCode.trim().length === 0 || Boolean(spaceProblem)}
            onClick={handleSubmit}
          >
            {quote && quote.payableMinor > 0
              ? t('citizen.parking.step4.confirmAndPay', {
                  amount: formatCurrencyMinor(quote.payableMinor, quote.currencyCode, locale),
                })
              : t('citizen.parking.submit')}
          </Button>
        ) : (
          <>
            {intentoAvanzar && faltaEnEstePaso ? (
              <p className="lx-sticky-cta__notice" aria-live="polite">
                {t(faltaEnEstePaso)}
              </p>
            ) : null}
            <Button type="button" variant="primary" fullWidth onClick={avanzar}>
              {t('citizen.parking.wizard.continue')}
            </Button>
          </>
        )}
      </div>
      {/* The submit button sits under four steps of form: a refusal rendered at the top of the page
          is off screen at the moment it arrives. It interrupts instead. */}
      <TenantSheet open={cambiarMunicipio} onClose={() => setCambiarMunicipio(false)} />
      <ErrorDialog
        open={error !== null}
        onClose={() => setError(null)}
        title={t('citizen.parking.error.title')}
        message={error ?? ''}
        closeLabel={t('common.close')}
        dismissLabel={t('common.understood')}
      />
      {/* La misma hoja que el Inicio: una sola implementación de ampliar, con los precios que el
          servidor da para ESTA estadía. */}
      {sesionIniciada ? (
        <ExtendSessionSheet
          open={ampliarAbierto}
          onClose={() => setAmpliarAbierto(false)}
          session={sesionIniciada}
        />
      ) : null}
    </CitizenShell>
  );
}
