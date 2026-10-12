import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  formatCurrencyMinor,
  formatDate,
  formatDateTime,
  formatTime,
  useTranslation,
  type TranslationKey,
} from '@luparx/i18n';
import { useAuth } from '@luparx/auth';
import { plateVerdictKey } from '@luparx/features';
import type { PlateVerdict } from '@luparx/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  FormField,
  IconCar,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconFine,
  /* El icono del aviso de la bahía. La familia no tiene una «i» en círculo y no se crea una:
     `IconHelp` es el signo de interrogación en círculo, que dice lo mismo —«acá va una
     explicación»— y ya existe. */
  IconHelp,
  IconPin,
  IconSearch,
  Input,
  ListRow,
  MetricCard,
  SectionHeader,
  Select,
  type CardTone,
  type MetricTone,
} from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import { VerdictMark, verdictTone } from '../components/VerdictMark';
import {
  useCitationQueue,
  useIsOnline,
  useKnownZones,
  useLastLookup,
  usePlateLookup,
  useShiftSummary,
} from '../lib/queries';
import { lookupErrorMessage } from '../lib/apiErrors';

/**
 * The screen this app exists for: "has this plate paid, on this bay, right now?".
 *
 * Three decisions shape it. The **plate field is the largest thing on the screen** because it is
 * typed standing up, one-handed, sometimes with gloves. The **bay is asked for on the same screen
 * and not behind a step**, because without it the server refuses to say "covered" at all and a
 * lookup that comes back `AMBIGUOUS` has wasted the officer's walk. And the **answer is a shape
 * before it is a colour** (see VerdictMark), readable from a metre away, because that is the
 * distance between an officer's eyes and a phone held at waist height.
 *
 * `BAY_MISMATCH` gets the longest sentence of the four on purpose: it is the case where fining
 * wrongly is easiest, so the screen states what actually happened — "paid for bay 0042, not for
 * this one" — instead of a bare label the officer has to interpret.
 *
 * The **answer sits above the form**, not under it. The form is what the officer has just filled
 * in and does not need to read again; the answer is the whole reason they are holding the phone,
 * and putting it below a five-field card meant scrolling to find out whether to write a ticket.
 */
export function PlateLookupPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const zones = useKnownZones();
  const lookup = usePlateLookup();
  const online = useIsOnline();
  // El conteo real de la cola de este aparato, para la insignia de «Pendientes».
  const { pending } = useCitationQueue();
  const ultima = useLastLookup();
  const { me, activeTenant } = useAuth();
  const nombre = me?.user.givenName ?? null;
  const municipio = activeTenant?.shortName ?? activeTenant?.name ?? null;
  const resumen = useShiftSummary();

  /*
    El reloj de la cabecera.

    Treinta segundos es la resolución que necesita un reloj que muestra minutos: con sesenta, la
    hora puede pasar casi un minuto entero equivocada, y un fiscalizador que anota la hora de un
    acto lee ESTE reloj. No hay intervalo cuando la pestaña está oculta porque el navegador los
    estrangula solo; no hace falta administrarlo a mano.
  */
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const tic = window.setInterval(() => setAhora(new Date()), 30_000);
    return () => window.clearInterval(tic);
  }, []);

  // El acceso «Consultar placa» del lanzador no navega a ningún lado: ya estamos en su pantalla,
  // así que lleva el cursor al campo —que es la acción— y abre el teclado.
  const plateRef = useRef<HTMLInputElement>(null);

  const [plate, setPlate] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [bay, setBay] = useState('');
  const [pairError, setPairError] = useState(false);

  const zoneOptions = useMemo(
    () => zones.map((zone) => ({ value: zone.id, label: zone.name, detail: zone.code })),
    [zones],
  );
  const result = lookup.data;

  /*
    Las tarjetas del turno que SE PUEDEN dibujar, en el orden de la referencia.

    Cada una entra sólo si su fuente contestó. `resumen.data` es la respuesta de
    `GET /inspector/shift-summary`; si la ruta no existe todavía en el servidor que sirve esta
    aplicación, la consulta falla sin reintentos y las dos primeras tarjetas no se dibujan — que es
    lo que el encargo pide, y no un cero que parecería un turno sin trabajo.

    «Pendientes de enviar» no depende del servidor: es la cola de este aparato, así que está
    siempre, también sin señal, y su cero es un cero medido.
  */
  const indicadores = useMemo(() => {
    const lista: { clave: string; rotulo: TranslationKey; valor: number; tono: MetricTone; icono: React.ReactNode }[] =
      [];
    if (resumen.data) {
      lista.push({
        clave: 'checks',
        rotulo: 'inspector.home.shift.checks',
        valor: resumen.data.checks,
        // `primary` y no `info`: el tono `info` es el gris azulado de la paleta y la referencia
        // dibuja esta tarjeta en azul. Los otros dos conservan verde y ámbar, que es lo que la
        // especificación reserva para estados y aquí lo son: emitidas y por enviar.
        tono: 'primary',
        icono: <IconCar size={20} />,
      });
      lista.push({
        clave: 'citations',
        rotulo: 'inspector.home.shift.citations',
        valor: resumen.data.citations,
        tono: 'success',
        icono: <IconFine size={20} />,
      });
    }
    lista.push({
      clave: 'pending',
      rotulo: 'inspector.home.shift.pending',
      valor: pending,
      tono: 'warning',
      icono: <IconClock size={20} />,
    });
    return lista;
  }, [resumen.data, pending]);

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    runLookup(zoneId, bay);
  }

  /**
   * The zone and the bay travel together or not at all — half a pair is `VALIDATION_FAILED` on the
   * server. It is caught here so the officer is told before the round trip, not after it.
   */
  function runLookup(nextZoneId: string, nextBay: string): void {
    const trimmedBay = nextBay.trim();
    if (Boolean(nextZoneId) !== Boolean(trimmedBay)) {
      setPairError(true);
      return;
    }
    setPairError(false);
    lookup.mutate({
      plate: plate.trim(),
      zoneId: nextZoneId || undefined,
      spaceCode: trimmedBay || undefined,
    });
  }

  // The stay the verdict is about: the one covering this bay, or the one that ran out on it.
  const stay = result?.coveringStay ?? result?.expiredStay ?? null;
  const minutesLeft = useMemo(() => {
    if (!stay || !result) return null;
    return Math.round((new Date(stay.expiresAt).getTime() - new Date(result.checkedAt).getTime()) / 60000);
  }, [stay, result]);
  // Covered, and yet the clock says otherwise: that is the tolerance, and it has to be said.
  const withinGrace = result?.verdict === 'COVERED' && minutesLeft !== null && minutesLeft < 0;

  return (
    <InspectorShell>
      {/*
        El saludo, que vuelve a encabezar la pantalla (12-10-2026, «Especificación definitiva del
        Inicio»).

        Conviene contar el vaivén, porque es la tercera vez que esta cabecera cambia y cada cambio
        tuvo su razón. Hasta el 11 de octubre el saludo encabezaba. La «Orden visual v2» lo quitó
        para que el título dijera qué hace la pantalla. Esta especificación —y el plan maestro que
        la precede— lo devuelven: «Hola, [nombre]» y «Fiscalización · [municipalidad]», con el
        título «Consultar vehículo» bajado a encabezado de SU tarjeta, que es donde la referencia
        aprobada lo dibuja.

        El `h1` es el saludo otra vez. No es gratis —un lector de pantalla entra por «Hola, Javier»
        y no por la tarea— y por eso la tarjeta de consulta lleva un `h2` de verdad: la pantalla
        conserva su jerarquía de encabezados aunque el primero sea una cortesía.

        El nombre y la municipalidad son los de la sesión. Si todavía no cargaron, el respaldo dice
        «Inspector» y «Fiscalización» a secas, nunca un nombre de ejemplo.
      */}
      <header className="lx-fiscal-greet">
        <div className="lx-fiscal-greet__who">
          <h1 className="lx-fiscal-greet__hi">
            {nombre ? t('inspector.home.greeting.named', { name: nombre }) : t('inspector.home.greeting')}
          </h1>
          <p className="lx-fiscal-greet__where">
            {municipio
              ? t('inspector.home.where', { tenant: municipio })
              : t('inspector.home.where.noTenant')}
          </p>
        </div>
        {/*
          La fecha y la hora, discretas y del APARATO.

          La especificación las deja opcionales —«pueden mostrarse discretamente»— y la referencia
          las dibuja, así que están. Hora local y no un dato fijo: se refresca cada treinta
          segundos, que es la resolución que un reloj de minutos necesita sin convertirse en un
          sondeo.
        */}
        <p className="lx-fiscal-clock" aria-label={t('inspector.home.clock.label')}>
          <span className="lx-fiscal-clock__date">{formatDate(ahora, locale, { dateStyle: 'medium' })}</span>
          <span className="lx-fiscal-clock__hour">{formatTime(ahora, locale)}</span>
        </p>
      </header>

      {/*
        El resumen del turno, y las dos reglas que lo gobiernan (12-10-2026).

        La primera: SÓLO SI EXISTE. La especificación lo dice en letra —«primero comprobar si cada
        cifra puede obtenerse con exactitud y filtrarse por inspector, municipalidad y turno/fecha;
        si no se puede, no mostrarla; nunca poner 0 cuando el dato es desconocido»— y por eso cada
        tarjeta se dibuja por separado y la fila entera desaparece si no queda ninguna.

        La segunda: de dónde sale cada una, auditado contra lo que el servidor contesta.

          · «Consultas hoy» y «Boletas emitidas» → `GET /inspector/shift-summary`, acotado por
            municipalidad, por esta persona y por el día local del aparato. La ruta se añadió el
            12-10-2026 justamente para esto; antes no había fuente y la fila no se dibujaba.
          · «Pendientes de enviar» → la cola de este aparato. Es el único de los cuatro que no
            depende del servidor, y por eso sigue estando aunque el resumen falle: un cero ahí es
            un cero MEDIDO —la cola está vacía—, no un dato desconocido.
          · «Evidencias tomadas», que la referencia dibuja, NO SE DIBUJA. Las fotos viven dentro de
            cada boleta y el servidor no publica ningún conteo; inventarlo es exactamente lo que la
            regla 2 del encargo prohíbe. Queda pendiente de integración.

        Sin chevrones y sin enlace: la regla 3 prohíbe repetir en el cuerpo los accesos que ya
        están en la barra inferior, y una tarjeta que lleva a Pendientes sería eso mismo con otra
        forma.
      */}
      {indicadores.length > 0 ? (
        <div className="lx-fiscal-kpis">
          {indicadores.map((indicador) => (
            <MetricCard
              key={indicador.clave}
              icon={indicador.icono}
              tone={indicador.tono}
              label={t(indicador.rotulo)}
              value={String(indicador.valor)}
            />
          ))}
        </div>
      ) : null}

      {/*
        La consulta, que es el elemento principal de la pantalla.

        La tarjeta lleva su propio encabezado —icono, «Consultar vehículo» y una línea de ayuda—
        como en la referencia aprobada. Debajo, la placa y BUSCAR en una fila; debajo, el aviso de
        la bahía; y al final, la zona y la bahía en una sección compacta.

        «Ubicación de la consulta» es idea de la especificación («idealmente en una sección
        compacta») y resuelve una tensión real: la referencia no dibuja esos dos campos, pero sin
        ellos el servidor NO puede decir «cubierta» —contesta `AMBIGUOUS`— y el fiscalizador
        caminaría hasta el carro para nada. No se esconden detrás de un desplegable: el encargo
        dice «sin ocultarlos cuando sean necesarios para el proceso». Lo que cambia es el peso:
        dejan de competir con la acción principal y pasan a ser una sección con su rótulo.
      */}
      <Card className="lx-fiscal-ask">
        <header className="lx-fiscal-ask__head">
          <span className="lx-fiscal-ask__icon" aria-hidden="true">
            <IconSearch size={22} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 className="lx-fiscal-ask__title">{t('inspector.home.title')}</h2>
            <p className="lx-fiscal-ask__sub">{t('inspector.home.subtitle')}</p>
          </div>
        </header>

        <form onSubmit={submit} className="lx-fiscal-ask__form">
          <div className="lx-plate-row">
            {/*
              Sin rótulo visible y con el marcador de posición diciendo qué va acá, que es como lo
              dibuja la referencia aprobada. El nombre accesible no se pierde: lo da `aria-label`.

              Es el tercer criterio de esta línea en tres días y hay que decirlo: la v2 pidió
              rótulos visibles en los tres campos y se hicieron; esta especificación es posterior,
              se llama «definitiva» y su referencia dibuja el campo sin rótulo. La zona y la bahía
              SÍ conservan el suyo, porque van en una sección con varios campos y ahí el rótulo es
              lo único que distingue uno de otro.
            */}
            <Input
              ref={plateRef}
              name="plate"
              aria-label={t('inspector.lookup.plateLabel')}
              className="lx-plate-input"
              value={plate}
              onChange={(event) => setPlate(event.target.value.toUpperCase())}
              placeholder={t('inspector.lookup.platePlaceholder')}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              required
            />
            {/* El único botón primario azul de la pantalla, que es lo que la especificación pide
                en letra: «un solo botón primario azul (Buscar)». */}
            <button
              type="submit"
              className="lx-plate-row__go"
              aria-busy={lookup.isPending}
              disabled={plate.trim().length === 0 || lookup.isPending}
            >
              <span className="lx-plate-row__go-text">{t('inspector.home.fast.go')}</span>
            </button>
          </div>

          {/* La regla crítica del encargo, con su icono: «sin bahía identificada, no confirmar
              cobertura de pago». El texto lo dice en un renglón y la lógica no cambia: sin el par
              zona+bahía el servidor sigue contestando `AMBIGUOUS` y la pantalla sigue diciéndolo. */}
          <p className="lx-fiscal-ask__note">
            <span className="lx-fiscal-ask__note-icon" aria-hidden="true">
              <IconHelp size={16} />
            </span>
            {t('inspector.lookup.bayHint')}
          </p>

          <section className="lx-fiscal-where" aria-labelledby="lx-fiscal-where-title">
            <h3 className="lx-fiscal-where__title" id="lx-fiscal-where-title">
              {t('inspector.home.location.title')}
            </h3>
            <div className="lx-grid-2">
              <FormField label={t('inspector.lookup.zoneLabel')} optionalLabel={t('common.optional')}>
                {({ inputId }) => (
                  <Select
                    id={inputId}
                    value={zoneId}
                    onChange={setZoneId}
                    options={zoneOptions}
                    placeholder={
                      zoneOptions.length === 0
                        ? t('inspector.zones.empty')
                        : t('inspector.lookup.zonePlaceholder')
                    }
                    disabled={zoneOptions.length === 0}
                    aria-label={t('inspector.lookup.zoneLabel')}
                  />
                )}
              </FormField>
              <FormField label={t('inspector.lookup.bayLabel')} optionalLabel={t('common.optional')}>
                {({ inputId }) => (
                  <Input
                    id={inputId}
                    name="spaceCode"
                    value={bay}
                    onChange={(event) => setBay(event.target.value.toUpperCase())}
                    placeholder={t('inspector.lookup.bayPlaceholder')}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                  />
                )}
              </FormField>
            </div>
          </section>

          {/* Los seis estados que la especificación declara obligatorios: inicial, cargando,
              encontrado, sin resultado, error y sin conexión. */}
          {!online ? <Alert tone="warning">{t('inspector.lookup.offline')}</Alert> : null}
          {lookup.isPending ? (
            <p className="lx-text-meta" role="status" style={{ margin: 0 }}>
              {t('inspector.lookup.checking')}
            </p>
          ) : null}
          {zoneOptions.length === 0 ? <Alert tone="info">{t('inspector.zones.emptyHint')}</Alert> : null}
          {pairError ? <Alert tone="danger">{t('inspector.lookup.bayIncomplete')}</Alert> : null}
          {lookup.isError ? <Alert tone="danger">{lookupErrorMessage(lookup.error, t)}</Alert> : null}
        </form>
      </Card>

      {result ? (
        <>
          {/* The surface tone only has `success` and `warning`; the other two verdicts carry their
              colour on the mark and the headline, and their meaning on the shape. */}
          <Card tone={cardToneFor(result.verdict)}>
            <div style={{ display: 'flex', gap: 'var(--lx-space-4)', alignItems: 'flex-start' }}>
              <span style={{ color: `var(--lx-${verdictTone(result.verdict)})`, flexShrink: 0 }}>
                <VerdictMark verdict={result.verdict} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)', minWidth: 0 }}>
                {/*
                  La placa arriba y el estado como ficha a su lado (08-10-2026).

                  La sección 5 del documento pide «placa prominente, estado con chip», y hasta hoy
                  era al revés: el veredicto ocupaba el renglón grande a 24px y la placa iba en el
                  renglón de metadatos, a 13px, junto a la hora.

                  Las dos lecturas tenían razón y ahora conviven. La placa manda porque es la
                  identidad de lo que se está mirando y es lo que se dicta en voz alta cuando
                  alguien reclama en la bahía. El veredicto NO pierde peso: lo dice la ficha de
                  color a su lado, lo dice la marca de la izquierda —una forma legible a un metro,
                  que es la distancia entre los ojos de un fiscalizador y un teléfono a la altura
                  de la cintura— y lo dice la frase completa debajo. Tres señales, ninguna de ellas
                  sólo color.

                  La hora de la consulta se queda donde estaba, en el renglón de metadatos, sin la
                  placa al lado porque la placa ya está arriba.
                */}
                <p className="lx-verdict__plate">
                  <strong>{result.plateNormalized}</strong>
                  <Badge tone={verdictTone(result.verdict) === 'success' ? 'success' : 'warning'}>
                    {t(plateVerdictKey(result.verdict))}
                  </Badge>
                </p>
                <p className="lx-text-body" style={{ margin: 0 }}>
                  {t(VERDICT_DETAIL_KEYS[result.verdict], {
                    bay: result.bay?.spaceCode ?? bay,
                    other: result.otherStays[0]?.spaceCode ?? '',
                  })}
                </p>
                <p className="lx-text-meta" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {t('inspector.lookup.checkedAt', { time: formatTime(result.checkedAt, locale) })}
                </p>
                {/* The stay itself, spelled out. Until v0.28 the start time was never shown and the
                    expiry was rendered time-only, so a stay that ran out yesterday at 14:30 and one
                    running until 14:30 today looked identical on screen. */}
                {stay ? (
                  /* En dos o tres columnas cuando hay ancho, una debajo de otra en el teléfono.
                     Lo pide la sección 4 para tablet —«datos secundarios pueden organizarse en 2-3
                     columnas»— y lo hace CSS con `columns`, no una cuadrícula: estas filas son
                     cuatro o cinco líneas de texto suelto cuyo número cambia con la respuesta
                     (puede no haber pago, puede no haber transacción), y una cuadrícula con un
                     número fijo de columnas deja huecos cuando faltan. */
                  <div className="lx-verdict__facts">
                    <span className="lx-text-meta">
                      {t('inspector.lookup.stay.zone', { zone: stay.zoneName ?? '', bay: stay.spaceCode ?? '' })}
                    </span>
                    <span className="lx-text-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t('inspector.lookup.stay.startedAt', { datetime: formatDateTime(stay.startedAt, locale) })}
                    </span>
                    <span className="lx-text-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t(
                        result.verdict === 'EXPIRED'
                          ? 'inspector.lookup.stay.expiredAt'
                          : 'inspector.lookup.stay.expiresAt',
                        { datetime: formatDateTime(stay.expiresAt, locale) },
                      )}
                      {minutesLeft !== null ? (
                        <>
                          {' · '}
                          {t(
                            minutesLeft >= 0
                              ? 'inspector.lookup.stay.remaining'
                              : 'inspector.lookup.stay.overdue',
                            { minutes: Math.abs(minutesLeft) },
                          )}
                        </>
                      ) : null}
                    </span>
                    {/* The payment (v0.32). The whole reason the officer's lookup and the money read
                        from the same record: a stay can exist and have cost nothing —courtesy, the
                        citizen's own minutes, an hour this municipality does not charge for— and an
                        officer who cannot tell those from a payment has nothing to say to the person
                        arguing with them. */}
                    {stay.paymentStatus ? (
                      <span className="lx-text-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {stay.paymentStatus === 'PAID'
                          ? t('inspector.lookup.stay.paid', {
                              amount: formatCurrencyMinor(
                                stay.amountMinor ?? 0,
                                stay.currencyCode ?? '',
                                locale,
                              ),
                            })
                          : stay.noChargeReason
                            ? t(
                                `inspector.lookup.stay.noCharge.${stay.noChargeReason}` as TranslationKey,
                              )
                            : t('inspector.lookup.stay.noCharge')}
                        {/* The movement, so a complaint at the bay traces to the money without the
                            officer leaving the street. Shortened: it is a reference to read out, not
                            an identifier to retype. */}
                        {stay.paymentTransactionId ? (
                          <>
                            {' · '}
                            {t('inspector.lookup.stay.transaction', {
                              id: stay.paymentTransactionId.slice(0, 8),
                            })}
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {/* The tolerance, said out loud. The municipality's grace is applied by the server —
                    that is why this reads "vigente" — but until v0.28 it was invisible, so the
                    officer saw "vigente" beside a time already past and had no way to know why. */}
                {withinGrace ? (
                  <Alert tone="info">
                    {t('inspector.lookup.withinGrace', { minutes: result.graceMinutes })}
                  </Alert>
                ) : null}
                {result.exemption ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* The category first, in the municipality's own words: "Discapacidad" is what the
                        officer says out loud, and the written reason is what backs it up. Whose permit
                        it is deliberately never reaches this screen. */}
                    {result.exemption.typeName ? (
                      <span className="lx-text-body">
                        <strong>{result.exemption.typeName}</strong>
                      </span>
                    ) : null}
                    <span className="lx-text-body">
                      {t('inspector.lookup.exemption.reason', { reason: result.exemption.reason })}
                    </span>
                    {result.exemption.documentRef ? (
                      <span className="lx-text-meta">
                        {t('inspector.lookup.exemption.document', { ref: result.exemption.documentRef })}
                      </span>
                    ) : null}
                    <span className="lx-text-meta">
                      {result.exemption.validTo
                        ? t('inspector.lookup.exemption.until', {
                            date: formatDate(result.exemption.validTo, locale),
                          })
                        : t('inspector.lookup.exemption.noEnd')}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          {result.otherStays.length > 0 ? (
            <Card>
              <SectionHeader title={t('inspector.lookup.otherStays')} />
              {result.otherStays.map((stay) => (
                <ListRow
                  key={stay.sessionId}
                  title={t('inspector.lookup.stayRow', {
                    zone: stay.zoneName,
                    bay: stay.spaceCode,
                    time: formatTime(stay.expiresAt, locale),
                  })}
                  meta={t('inspector.lookup.useThisBay')}
                  // One tap turns an AMBIGUOUS answer into a conclusive one, with the bay the
                  // server itself just named — no retyping a code the officer never saw painted.
                  onClick={() => {
                    setZoneId(stay.zoneId);
                    setBay(stay.spaceCode);
                    runLookup(stay.zoneId, stay.spaceCode);
                  }}
                />
              ))}
            </Card>
          ) : null}

          {/* AMBIGUOUS means the server refused to answer without the bay, so there is nothing to
              act on yet — offering the ticket there invited one written off an answer nobody gave.
              EXEMPT and COVERED both mean no non-payment citation is due. */}
          {result.verdict === 'AMBIGUOUS' ? (
            <Alert tone="warning">{t('inspector.lookup.needBayToCite')}</Alert>
          ) : null}
          {result.verdict === 'EXPIRED' || result.verdict === 'BAY_MISMATCH' || result.verdict === 'NOT_COVERED' ? (
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() =>
                navigate('/cite', {
                  state: {
                    plate: result.plateNormalized,
                    zoneId: result.bay?.zoneId ?? zoneId ?? '',
                    spaceCode: result.bay?.spaceCode ?? bay,
                    spaceId: result.bay?.spaceId ?? '',
                    // The consultation this ticket is being written from (CONTRACT.md v0.29).
                    checkId: result.checkId ?? undefined,
                  },
                })
              }
            >
              {t('inspector.lookup.cite')}
            </Button>
          ) : null}
        </>
      ) : null}

      {/*
        «Última consulta» (07-10-2026).

        Sólo cuando no hay un veredicto en pantalla: con uno, la última consulta ES ésa y repetirla
        debajo sería decir dos veces lo mismo. Y sólo si existe de verdad —el documento dice
        «únicamente si existe»—; si este aparato no consultó nada todavía, lo que se dibuja es el
        estado vacío, no una placa de ejemplo.

        Lo que muestra sale de la respuesta que el servidor ya dio, guardada por el propio aparato
        (ver lib/lastLookup.ts). NO hay endpoint de historial de consultas, así que no hay ninguna
        otra fuente real: el bloque de la referencia que muestra marca, modelo y color del vehículo
        se queda sin dibujar, porque esos tres datos no existen en ninguna respuesta del servidor y
        pintarlos sería exactamente la maqueta que el documento prohíbe.
      */}
      {!result ? (
        <Card className="lx-card--dense lx-last-card">
          <SectionHeader title={t('inspector.home.last.title')} />
          {ultima ? (
            <button
              type="button"
              className="lx-last-check"
              onClick={() => {
                setPlate(ultima.plate);
                lookup.reset();
                plateRef.current?.focus();
              }}
              aria-label={t('inspector.home.last.again', { plate: ultima.plate })}
            >
              <span style={{ minWidth: 0 }}>
                <span className="lx-last-check__head">
                  <span className="lx-last-check__plate">{ultima.plate}</span>
                  <Badge tone={verdictTone(ultima.verdict) === 'success' ? 'success' : 'warning'}>
                    {t(plateVerdictKey(ultima.verdict))}
                  </Badge>
                </span>
                <span className="lx-last-check__facts">
                  {ultima.zoneName ? (
                    <span className="lx-last-check__fact">
                      <IconPin size={14} />
                      <span>
                        {ultima.spaceCode
                          ? t('inspector.lookup.stay.zone', { zone: ultima.zoneName, bay: ultima.spaceCode })
                          : ultima.zoneName}
                      </span>
                    </span>
                  ) : null}
                  {ultima.expiresAt ? (
                    <span className="lx-last-check__fact">
                      <IconClock size={14} />
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {t(
                          ultima.verdict === 'EXPIRED'
                            ? 'inspector.lookup.stay.expiredAt'
                            : 'inspector.lookup.stay.expiresAt',
                          { datetime: formatDateTime(ultima.expiresAt, locale) },
                        )}
                      </span>
                    </span>
                  ) : null}
                  {ultima.exemptUntil ? (
                    <span className="lx-last-check__fact">
                      <IconCheck size={14} />
                      <span>
                        {t('inspector.lookup.exemption.until', {
                          date: formatDate(ultima.exemptUntil, locale),
                        })}
                      </span>
                    </span>
                  ) : null}
                  <span className="lx-last-check__fact">
                    <IconClock size={14} />
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t('inspector.home.last.checkedAt', { time: formatTime(ultima.checkedAt, locale) })}
                    </span>
                  </span>
                </span>
              </span>
              <IconChevronRight size={18} aria-hidden="true" />
            </button>
          ) : (
            <p className="lx-last-card__empty">{t('inspector.home.last.empty')}</p>
          )}
        </Card>
      ) : null}

    </InspectorShell>
  );
}

/**
 * The sentence under the verdict. Kept as a table of keys rather than built from fragments so
 * every language can rewrite the whole sentence — `BAY_MISMATCH` in particular needs both bay
 * numbers in an order Spanish and English do not agree on.
 */
function cardToneFor(verdict: PlateVerdict): CardTone {
  const tone = verdictTone(verdict);
  return tone === 'success' || tone === 'warning' ? tone : 'default';
}

const VERDICT_DETAIL_KEYS: Record<PlateVerdict, TranslationKey> = {
  EXEMPT: 'inspector.lookup.verdict.exempt.detail',
  EXPIRED: 'inspector.lookup.verdict.expired.detail',
  COVERED: 'inspector.lookup.verdict.covered.detail',
  BAY_MISMATCH: 'inspector.lookup.verdict.bay_mismatch.detail',
  NOT_COVERED: 'inspector.lookup.verdict.not_covered.detail',
  AMBIGUOUS: 'inspector.lookup.verdict.ambiguous.detail',
};
