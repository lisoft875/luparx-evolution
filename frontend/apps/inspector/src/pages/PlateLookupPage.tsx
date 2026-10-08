import * as React from 'react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import {
  formatCurrencyMinor,
  formatDate,
  formatDateTime,
  formatTime,
  useTranslation,
  type TranslationKey,
} from '@luparx/i18n';
import { plateVerdictKey } from '@luparx/features';
import type { PlateVerdict } from '@luparx/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  FormField,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconEye,
  IconFine,
  IconPin,
  IconSearch,
  Input,
  ListRow,
  SectionHeader,
  Select,
  type CardTone,
} from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import { VerdictMark, verdictTone } from '../components/VerdictMark';
import { useCitationQueue, useIsOnline, useKnownZones, useLastLookup, usePlateLookup } from '../lib/queries';
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
  const { me, activeTenant } = useAuth();
  const zones = useKnownZones();
  const lookup = usePlateLookup();
  const online = useIsOnline();
  // El conteo real de la cola de este aparato, para la insignia de «Pendientes».
  const { pending } = useCitationQueue();
  const ultima = useLastLookup();
  const nombre = me?.user.givenName ?? null;
  const municipio = activeTenant?.shortName ?? activeTenant?.name ?? null;

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
        El saludo (07-10-2026, especificación visual responsive de Fiscalización).

        Ocupa el sitio donde estaba `<h1>Consulta de placa</h1>`, y eso es textualmente lo que el
        documento pide: «no repetir un gran título genérico como "Consulta de placa" ocupando
        espacio antes de las acciones», y en su lugar «saludo corto: Hola, Inspector» con
        «Fiscalización · Escazú» debajo.

        Sigue siendo el `h1` de la pantalla. No es un detalle de estilo: es el encabezado de nivel 1
        por el que entra un lector de pantalla, y quitarlo para poner un texto decorativo habría
        dejado la pantalla principal del portal sin título.

        El nombre es el de verdad cuando lo hay. El documento escribe «Hola, Inspector» porque es
        una maqueta y no tiene a nadie dentro; nosotros sí —`me.user.givenName`, que ya viaja en la
        sesión— y saludar por el nombre no es inventar un dato, es usar el que está. «Inspector» se
        queda como respaldo para la sesión que todavía no cargó.
      */}
      <header className="lx-inspector-greeting">
        <div style={{ minWidth: 0 }}>
          <h1 className="lx-inspector-greeting__name">
            {nombre ? t('inspector.home.greeting.named', { name: nombre }) : t('inspector.home.greeting')}
          </h1>
          <p className="lx-inspector-greeting__where">
            {municipio
              ? t('inspector.home.where', { tenant: municipio })
              : t('inspector.home.where.noTenant')}
          </p>
        </div>
        {/*
          La ficha verde de «En línea», junto al saludo, como en la referencia aprobada
          (08-10-2026).

          SÓLO cuando hay señal, y eso es el reparto con la barra superior, no un descuido. Con
          señal, «En línea» es una confirmación: vive acá, donde la referencia la pone, y si se va
          al desplazarse no se pierde nada porque no había nada que decidir. Sin señal es una
          ADVERTENCIA —un fiscalizador que no lo sabe da por presentada una boleta que está en el
          teléfono—, y entonces la dibuja la barra fija, que no se va de la pantalla y está en
          todas. Ver la nota larga en InspectorShell.

          Nunca las dos a la vez: un solo indicador en pantalla.
        */}
        {online ? (
          <Badge className="lx-inspector-greeting__state" tone="success">
            {t('inspector.home.online')}
          </Badge>
        ) : null}
      </header>

      {/*
        Las cuatro acciones del turno, con la composición de la referencia aprobada: icono arriba,
        título, ayuda corta y, en las dos que llevan a otra pantalla, un chevron.

        SÓLO mientras no hay veredicto en pantalla, y eso no es un descuido: cuando hay respuesta la
        pantalla tiene una sola decisión encima —levantar la boleta o no— y 220px de lanzador por
        delante la empujarían fuera de la vista en un teléfono de 812px. Las cuatro siguen a un toque
        en la barra inferior, que nunca se va.

        No se crea ninguna ruta: `/cite` y `/queue` ya existen, y la consulta es esta misma pantalla.
      */}
      {!result ? (
        <nav className="lx-quick-grid lx-quick-grid--touch" aria-label={t('inspector.home.quick.label')}>
          {[
            {
              clave: 'lookup' as const,
              icono: <IconSearch />,
              // El acceso «Consultar placa» no navega: ya estamos en su pantalla, así que lleva el
              // cursor al campo —que es la acción— y abre el teclado.
              onClick: () => plateRef.current?.focus(),
              principal: true,
              flecha: true,
            },
            { clave: 'cite' as const, icono: <IconFine />, onClick: () => navigate('/cite'), flecha: true },
            {
              clave: 'queue' as const,
              icono: <IconCheck />,
              onClick: () => navigate('/queue'),
              // El conteo REAL de la cola de este aparato, no un número de maqueta. Sin insignia
              // cuando no hay nada esperando: un «0» es una marca que significa «nada».
              conteo: pending,
            },
            // La evidencia se agrega DENTRO de una boleta: llevar al flujo de boleta es el punto
            // correcto del flujo que ya existe, no un descuido ni una galería nueva.
            { clave: 'evidence' as const, icono: <IconEye />, onClick: () => navigate('/cite') },
          ].map((acceso) => (
            <button
              key={acceso.clave}
              type="button"
              className={[
                'lx-quick-tile',
                'lx-quick-tile--touch',
                'lx-quick-tile--inspector',
                acceso.principal ? 'lx-quick-tile--primary' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={acceso.onClick}
            >
              <span className="lx-quick-tile__icon" aria-hidden="true">
                {acceso.icono}
              </span>
              <span className="lx-quick-tile__title">
                {t(`inspector.home.quick.${acceso.clave}` as TranslationKey)}
              </span>
              <span className="lx-quick-tile__hint">
                {t(`inspector.home.quick.${acceso.clave}.hint` as TranslationKey)}
              </span>
              {acceso.flecha ? (
                <span className="lx-quick-tile__go" aria-hidden="true">
                  <IconChevronRight size={18} />
                </span>
              ) : null}
              {acceso.conteo ? <span className="lx-quick-tile__count">{acceso.conteo}</span> : null}
            </button>
          ))}
        </nav>
      ) : null}

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
        La fila de cuatro métricas de tablet, y por qué NO está (08-10-2026).

        La sección 4 del documento la pide así: «en la pantalla principal usar una fila de 4
        métricas SI EXISTEN DATOS REALES: Consultas hoy, Boletas emitidas, Pendientes, Evidencias.
        Si una métrica no existe en backend, no simularla.»

        Se auditaron las cuatro contra lo que el servidor contesta:

        · «Consultas hoy» — no hay fuente. El servidor registra cada consulta en la bitácora de
          fiscalización (`checkId`, contrato v0.29) pero no publica ninguna ruta para contarlas.
        · «Evidencias» — no hay fuente. Las fotos viven dentro de cada boleta; no hay conteo.
        · «Boletas emitidas» — hay fuente: `inspectorEnforcement.list` es paginada y trae
          `totalElements`. Pero es el total histórico de esta persona, no las de hoy, y puesto en
          una fila donde la vecina dice «hoy» se leería como «hoy».
        · «Pendientes» — hay fuente, y ya está en pantalla: la baldosa del lanzador lleva el
          conteo real de la cola.

        O sea: de las cuatro, una no tiene fuente honesta para el rótulo que le toca, otra ya está
        dibujada, y dos no existen en el servidor. Una fila de métricas con una sola métrica no es
        una fila, y rellenarla sería exactamente lo que el documento prohíbe. Queda PENDIENTE DE
        INTEGRACIÓN, que es lo que la regla 7 pide hacer en este caso en vez de simular.

        Lo que hace falta del lado del servidor para poder dibujarla: un conteo de consultas del día
        por fiscalizador, y un conteo de boletas del día (o un filtro de fechas en el listado que
        ya existe).
      */}

      {/*
        El formulario, con la fila de la referencia: la placa y un botón cuadrado al lado.

        Título «Consultar placa» y una ayuda de un renglón, que es lo que pide la sección 5 del
        documento. Es el título de la TARJETA, no de la pantalla: la pantalla ya la encabeza el
        saludo, y poner los dos habría reintroducido el título genérico que la sección 3 quita.

        La zona y la bahía se quedan, aunque la referencia del teléfono sólo dibuje la placa. No es
        desobedecer el dibujo: sin ese par el servidor NO puede decir «cubierta» —su respuesta es
        `AMBIGUOUS`— y el fiscalizador habría caminado hasta el carro para nada. El documento pide
        no perder funcionalidad existente y no tocar las reglas de validación, y esto es las dos
        cosas. Van debajo y en dos columnas, que es donde no compiten con la acción principal.
      */}
      <Card>
        <SectionHeader title={t('inspector.lookup.title')} description={t('inspector.lookup.help')} />
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <div className="lx-plate-row">
            {/* Sin `FormField` acá, a diferencia de la zona y la bahía: el rótulo visible de este
                campo es el título de la tarjeta («Consultar placa») y el marcador de posición
                («SJP123»), que es como lo dibuja la referencia. Un rótulo encima metería una
                tercera fila en una cuadrícula de dos columnas y desalinearía el botón cuadrado con
                el campo. El nombre accesible no se pierde: va en `aria-label`. */}
            <Input
              ref={plateRef}
              name="plate"
              aria-label={t('inspector.lookup.plateLabel')}
              value={plate}
              onChange={(event) => setPlate(event.target.value.toUpperCase())}
              placeholder={t('inspector.lookup.platePlaceholder')}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              required
              // El único campo que se lee a un brazo de distancia y se escribe sin mirar.
              // Cifras tabulares para que la placa no cambie de ancho mientras se teclea.
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '.08em',
                textAlign: 'center',
                height: 56,
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            {/* Cuadrado, compacto y del mismo alto que el campo, como en la referencia. Es el
                `submit` del formulario: la acción principal de la pantalla es una sola y es ésta,
                así que no hay además un botón ancho debajo repitiéndola. */}
            <button
              type="submit"
              className="lx-plate-row__go"
              aria-label={t('inspector.home.fast.go')}
              aria-busy={lookup.isPending}
              disabled={plate.trim().length === 0 || lookup.isPending}
            >
              <IconSearch size={22} />
            </button>
          </div>

          <div className="lx-grid-2">
            <FormField label={t('inspector.lookup.zoneLabel')} optionalLabel={t('common.optional')}>
              {({ inputId }) => (
                <Select
                  id={inputId}
                  value={zoneId}
                  onChange={setZoneId}
                  options={zoneOptions}
                  placeholder={
                    zoneOptions.length === 0 ? t('inspector.zones.empty') : t('common.select.placeholder')
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
                  style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                />
              )}
            </FormField>
          </div>

          <p className="lx-text-meta" style={{ margin: 0 }}>
            {t('inspector.lookup.bayHint')}
          </p>
          {/* Los seis estados que la sección 5 declara obligatorios. Tres ya estaban —inicial,
              encontrado y error—; «cargando» ahora se dice con palabras además de con el botón
              ocupado, y «sin conexión» no existía: la consulta fallaba con un error de red genérico
              que no distinguía «no hay señal» de «el servidor dijo que no». */}
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
        <Card>
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
            <p className="lx-text-meta" style={{ margin: 0 }}>
              {t('inspector.home.last.empty')}
            </p>
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
