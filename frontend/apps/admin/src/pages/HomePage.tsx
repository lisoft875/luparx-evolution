import * as React from 'react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AuditEvent } from '@luparx/api-client';
import { useQuery } from '@tanstack/react-query';
import { useAuth, usePermissions } from '@luparx/auth';
import {
  formatCurrencyMinor,
  formatDate,
  formatRelativeTime,
  formatTime,
  useTranslation,
  type TranslationKey,
} from '@luparx/i18n';
import {
  BarChart,
  Button,
  Card,
  IconCar,
  IconChart,
  IconChevronRight,
  IconClock,
  IconFine,
  IconPark,
  IconPin,
  IconReports,
  IconSearch,
  IconShield,
  IconTopUp,
  IconUsers,
  MetricCard,
  OccupancyDonut,
  SectionHeader,
  Skeleton,
} from '@luparx/ui';
import type { BarChartDatum } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

/**
 * Los actos que la actividad muestra: cómo se llaman y con qué icono.
 *
 * <p>El rastro guarda ochenta y pico de acciones y la mayoría son de sistema. Este mapa hace tres
 * trabajos a la vez —decide qué se muestra, cómo se nombra y con qué se dibuja— y por eso un acto
 * que no esté acá no puede colarse sin traducir ni sin icono.</p>
 */
const ACTOS: Readonly<Record<string, { key: TranslationKey; icon: React.ReactNode }>> = {
  /*
    Los cinco de abajo entraron el 08-10-2026, y el motivo es un defecto medido, no una opinión.

    La tarjeta «Actividad reciente» salía VACÍA en staging. El arnés lo imprimió —«actos visibles:
    ninguno»— y la causa estaba acá: la lista blanca tenía doce actos y el servidor escribe
    ochenta y ocho, y entre los setenta y seis que faltaban estaba `PARKING_SESSION_STARTED`, que
    es el acto MÁS frecuente de una municipalidad de estacionamiento. Una portada que no puede
    mostrar que alguien se estacionó no es una portada de actividad.

    Y no es una suposición sobre qué debería salir: la referencia visual aprobada dibuja cinco
    filas, y cuatro de ellas —«Nuevo estacionamiento iniciado», «Multa emitida», «Usuario
    registrado» y «Restablecer acceso»— necesitan tres actos que la lista no aceptaba. Se
    comprobó además que los cinco EXISTEN en `AuditAction` del servidor y que hay código que los
    graba; añadir un nombre que nadie escribe habría dejado la tarjeta igual de vacía.

    Lo que sigue fuera, y a propósito: inicios de sesión, fallos de contraseña, reutilización de
    refresco, exportaciones, purgas y todo lo de plataforma. La lista blanca existe para que el
    rastro de sistema no inunde la portada, y eso no cambia — lo que cambia es que los actos del
    NEGOCIO ahora están todos.
  */
  PARKING_SESSION_STARTED: { key: 'admin.home.activity.PARKING_SESSION_STARTED', icon: <IconPark size={16} /> },
  PARKING_SESSION_FINISHED: { key: 'admin.home.activity.PARKING_SESSION_FINISHED', icon: <IconClock size={16} /> },
  PARKING_ZONE_CREATED: { key: 'admin.home.activity.PARKING_ZONE_CREATED', icon: <IconPin size={16} /> },
  USER_REGISTERED: { key: 'admin.home.activity.USER_REGISTERED', icon: <IconUsers size={16} /> },
  USER_PASSWORD_RESET_REQUESTED: {
    key: 'admin.home.activity.USER_PASSWORD_RESET_REQUESTED',
    icon: <IconShield size={16} />,
  },
  WALLET_TOPUP_RECORDED: { key: 'admin.home.activity.WALLET_TOPUP_RECORDED', icon: <IconTopUp size={16} /> },
  CITATION_ISSUED: { key: 'admin.home.activity.CITATION_ISSUED', icon: <IconFine size={16} /> },
  CITATION_PAID: { key: 'admin.home.activity.CITATION_PAID', icon: <IconFine size={16} /> },
  CITATION_CANCELLED: { key: 'admin.home.activity.CITATION_CANCELLED', icon: <IconFine size={16} /> },
  CITATION_APPEAL_FILED: { key: 'admin.home.activity.CITATION_APPEAL_FILED', icon: <IconFine size={16} /> },
  CITATION_APPEAL_RESOLVED: { key: 'admin.home.activity.CITATION_APPEAL_RESOLVED', icon: <IconFine size={16} /> },
  PLATE_EXEMPTION_GRANTED: { key: 'admin.home.activity.PLATE_EXEMPTION_GRANTED', icon: <IconCar size={16} /> },
  PARKING_SPACE_CREATED: { key: 'admin.home.activity.PARKING_SPACE_CREATED', icon: <IconPark size={16} /> },
  PARKING_ZONE_UPDATED: { key: 'admin.home.activity.PARKING_ZONE_UPDATED', icon: <IconPin size={16} /> },
  PARKING_RATE_UPDATED: { key: 'admin.home.activity.PARKING_RATE_UPDATED', icon: <IconChart size={16} /> },
  PARKING_POLICY_UPDATED: { key: 'admin.home.activity.PARKING_POLICY_UPDATED', icon: <IconPark size={16} /> },
  PARKING_SCHEDULE_UPDATED: { key: 'admin.home.activity.PARKING_SCHEDULE_UPDATED', icon: <IconPark size={16} /> },
};

const EVENTOS_A_PEDIR = 40;
/**
 * Cuántos eventos entran en la portada.
 *
 * <p>Tres y no cinco (v4 §5: «maximo 3-4 filas en Inicio»). Cada fila cuesta ~53px y el Inicio no
 * es el registro de auditoría: es la señal de que algo se movió, con el enlace a la lista
 * completa debajo. Con cinco, la tarjeta de actividad medía 434px —más que el gráfico y la
 * ocupación juntos— y era ella sola la que decidía el alto de la fila inferior.</p>
 */
/* Cinco desde el 08-10-2026, y el motivo es estructural y no de gusto. Eran tres porque la fila
   inferior tenía dos tarjetas —actividad y accesos— y con cinco eventos la de actividad medía
   434px y decidía ella sola el alto de la fila. La referencia aprobada reparte esa fila en tres
   bloques: actividad a la izquierda y DOS tarjetas apiladas a la derecha (accesos rápidos y el
   ranking de zonas). Con la derecha apilada, la izquierda necesita el alto, y el documento pide
   «4-5 eventos reales con hora». */
const EVENTOS_A_MOSTRAR = 5;
const OCUPACION_ALTA = 85;
const OCUPACION_MEDIA = 70;
const ZONAS_EN_PORTADA = 5;
/** Cuántas zonas entran en el ranking «Zonas más utilizadas». La referencia muestra cuatro. */
const ZONAS_EN_RANKING = 4;
const DIAS_DEL_GRAFICO = 7;

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * La portada del portal de administración (referencia visual exacta, 08-10-2026).
 *
 * <h2>Qué compone esta pantalla, en orden</h2>
 *
 * <p>Saludo con la fecha y la hora a la derecha; cuatro KPI —estacionamientos activos, usuarios
 * registrados, multas emitidas e ingresos del día—; una fila con la ocupación en tiempo real
 * (dónut y zonas) a lo ancho y los ingresos de la semana al lado; y una fila con la actividad
 * reciente a la izquierda y, apilados a la derecha, los accesos rápidos y el ranking de zonas más
 * utilizadas. El estado de los servicios cierra la página en un renglón.</p>
 *
 * <h2>Por qué la composición y no la paleta</h2>
 *
 * <p>El encargo decía que la pantalla se percibía «demasiado azul-gris y uniforme» y pedía
 * superficies «más oscuras y contrastadas». Eso se midió antes de tocar un hexadecimal: la propia
 * referencia aprobada tiene una separación fondo↔superficie de 1.15, la MISMA que ya estaba
 * desplegada. La sensación no venía del color sino del reparto —un gráfico de recaudación con el
 * 65% del ancho, los estados técnicos encabezando la pantalla, cuatro KPI de los que uno no se
 * podía abrir—, y es el reparto lo que cambió.</p>
 *
 * <h2>Las tres reglas que no se negocian</h2>
 *
 * <p><b>Ninguna cifra es inventada.</b> Los montos de la referencia visual —342, 8.524, 56,
 * ₡1.428.500, 78%— no están en este archivo ni en ningún otro: cada número sale de su endpoint. Y
 * donde no hay endpoint no hay número: el documento pide «dejar el bloque pendiente de integración
 * en vez de simular producción», y por eso no existe acá ninguna tarjeta de las que la referencia
 * dibuja sin que el servidor las sepa contestar. El arnés
 * `inicio-admin.cjs` lo comprueba en cada corrida.</p>
 *
 * <p><b>La variación sólo aparece si existe.</b> Se muestra en recaudación, donde hay un ayer con
 * el cual comparar. Estadías activas y ocupación son valores de AHORA, sin historia: ahí no hay
 * variación que mostrar y no se muestra ninguna.</p>
 *
 * <p><b>Cargando no es lo mismo que vacío, y vacío no es lo mismo que cero.</b> Mientras viene el
 * dato hay un bloque del tamaño del dato; un cero medido se escribe 0; y lo que no tiene fuente
 * dice que no la tiene.</p>
 */
export function HomePage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const { activeTenant, apiClient, me } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const puedeVerCifras = permissions.has('AUDIT_READ');

  const ahora = new Date();
  const desdeHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const desdeAyer = new Date(desdeHoy.getFullYear(), desdeHoy.getMonth(), desdeHoy.getDate() - 1);

  const panel = useQuery({
    queryKey: ['admin', 'home', 'panel', isoDate(desdeHoy)],
    queryFn: () => apiClient.adminDashboard.get({ from: desdeHoy.toISOString(), to: ahora.toISOString() }),
    enabled: puedeVerCifras,
    refetchInterval: 60_000,
  });

  const serie = useQuery({
    queryKey: ['admin', 'home', 'serie', isoDate(desdeHoy)],
    queryFn: () => {
      const inicio = new Date(desdeHoy);
      inicio.setDate(inicio.getDate() - (DIAS_DEL_GRAFICO - 1));
      return apiClient.adminDashboard.revenueSeries({ from: isoDate(inicio), to: isoDate(desdeHoy) });
    },
    enabled: puedeVerCifras,
  });

  /*
    «Usuarios registrados» (08-10-2026), el KPI nuevo de la referencia.

    No hay endpoint de conteo, y no hace falta inventarlo: `/api/v1/admin/users` es una respuesta
    paginada y trae `totalElements`, que es el total REAL de cuentas de esta municipalidad. Se pide
    `size: 1` a propósito —se quiere el total, no la lista—, así que la página viaja con una fila y
    el número es el del servidor.

    Sin filtro de portal: el rótulo dice «usuarios registrados», que es toda la gente con cuenta
    acá. Filtrar por `CITIZEN` daría otro número y otro nombre.

    Cinco minutos de `staleTime`: un total de cuentas no cambia de un minuto a otro, y esta
    pantalla se refresca cada sesenta segundos por el panel.
  */
  const usuarios = useQuery({
    queryKey: ['admin', 'home', 'usuarios'],
    queryFn: () => apiClient.adminUsers.list({ page: 0, size: 1 }),
    enabled: puedeVerCifras,
    staleTime: 5 * 60 * 1000,
  });

  /*
    El panel de AYER, sólo para la variación de multas emitidas.

    La referencia pone «↓ 8% vs. ayer» en esa tarjeta y hasta hoy no había con qué: el panel sólo
    se pedía para hoy. Esto es una llamada más, una sola vez por sesión —`staleTime: Infinity`,
    porque ayer ya no cambia— y sin refresco periódico. Las otras dos tarjetas siguen sin
    variación y eso es deliberado: estacionamientos activos es un valor de AHORA sin historia, y el
    total de usuarios registrados no tiene un «ayer» que el servidor sepa contar. La regla 7 del
    documento es explícita: si no hay comparación real, se omite el porcentaje.
  */
  const panelAyer = useQuery({
    queryKey: ['admin', 'home', 'panel-ayer', isoDate(desdeAyer)],
    queryFn: () =>
      apiClient.adminDashboard.get({
        from: desdeAyer.toISOString(),
        to: new Date(desdeHoy.getTime() - 1).toISOString(),
      }),
    enabled: puedeVerCifras,
    staleTime: Infinity,
  });

  const actividad = useQuery({
    queryKey: ['admin', 'home', 'actividad'],
    queryFn: () => apiClient.adminAudit.list({ page: 0, size: EVENTOS_A_PEDIR }),
    enabled: puedeVerCifras,
    refetchInterval: 60_000,
  });

  const dinero = (minor: number, currency: string): string => formatCurrencyMinor(minor, currency, locale);

  /**
   * Adónde lleva cada KPI, y por qué a ese sitio y no a otro (especificación del 06-10-2026).
   *
   * <p>Hasta hoy sólo «Recaudación» llevaba a alguna parte. Las otras tres eran cifras que no se
   * podían comprobar, que es la misma regla que el Panel cumple desde la v0.36: un número del que
   * no se puede llegar a las filas que lo forman es decoración.</p>
   *
   * <p>Los destinos se auditaron contra las rutas que EXISTEN, no contra las que el documento
   * nombra:</p>
   *
   * <ul>
   *   <li><b>Recaudación</b> → Conciliación. Ya era así; no se tocó.</li>
   *   <li><b>Boletas de hoy</b> → la lista de boletas, acotada desde la medianoche de hoy. La
   *       pantalla ya tenía los campos «Desde» y «Hasta»; lo único que le faltaba era leerlos de la
   *       dirección, así que se completó eso en vez de inventarle un filtro. Va `from` y no `to`:
   *       no hay boletas en el futuro, y con `to` la fecha mostrada en el campo saltaría al día
   *       siguiente cada tarde, porque el campo rotula en UTC y acá son las seis menos.</li>
   *   <li><b>Estadías activas</b> y <b>Ocupación</b> → el Panel. Es la ÚNICA pantalla que tiene
   *       estadías vigentes y ocupación por zona; «Zonas» lista zonas, bahías y estado, y no
   *       muestra ocupación. Mandar la ocupación a Zonas se vería bien en el documento y dejaría a
   *       la municipalidad en una pantalla que no contesta la pregunta.</li>
   * </ul>
   *
   * <p>No se pasa período al Panel: su selector arranca con su propia ventana y la ocupación es de
   * ahora en las dos pantallas, así que no hay nada que sincronizar.</p>
   */
  const irALasBoletasDeHoy = (): void =>
    navigate(`/enforcement/citations?from=${encodeURIComponent(desdeHoy.toISOString())}`);

  const recaudacion = useMemo(() => {
    const days = serie.data?.days ?? [];
    if (days.length === 0) return null;
    const hoy = days[days.length - 1];
    const ayer = days.length > 1 ? days[days.length - 2] : null;
    if (!hoy) return null;
    // Sin nada ayer no hay porcentaje: dividir entre cero daría infinito, y «+∞%» no es un dato.
    const variacion =
      ayer && ayer.totalMinor > 0
        ? Math.round(((hoy.totalMinor - ayer.totalMinor) / ayer.totalMinor) * 100)
        : null;
    return { totalMinor: hoy.totalMinor, currencyCode: serie.data?.currencyCode ?? 'CRC', variacion };
  }, [serie.data]);

  const boletasHoy = useMemo(
    () => (panel.data?.citations ?? []).reduce((suma, grupo) => suma + grupo.count, 0),
    [panel.data],
  );

  /**
   * La variación de multas contra ayer (08-10-2026).
   *
   * <p>`null` —y entonces la tarjeta no muestra porcentaje— en los dos casos en que un porcentaje
   * no significaría nada: mientras la respuesta de ayer viaja, y cuando ayer hubo cero. Dividir
   * entre cero da infinito, y «+∞%» no es un dato; de dos a cero tampoco es «−200%». El documento
   * lo dice en su regla 7: si no hay comparación real, se omite.</p>
   */
  const multasVariacion = useMemo(() => {
    if (!panelAyer.data) return null;
    const ayer = panelAyer.data.citations.reduce((suma, grupo) => suma + grupo.count, 0);
    if (ayer === 0) return null;
    return Math.round(((boletasHoy - ayer) / ayer) * 100);
  }, [panelAyer.data, boletasHoy]);

  /**
   * Las zonas ordenadas por ocupación, que alimentan los dos bloques de la referencia: la lista del
   * dónut y el ranking «Zonas más utilizadas».
   *
   * <p>Se calculan una vez y se reparten: son la misma pregunta hecha dos veces, y tener dos
   * ordenaciones distintas del mismo dato en la misma pantalla es cómo se termina con la zona más
   * llena en segundo lugar en una tarjeta y en primero en la otra.</p>
   *
   * <p>Sólo las que tienen porcentaje. Una zona sin bahías numeradas no está vacía: no tiene con
   * qué medirse, y meterla en un ranking de «más utilizadas» la pondría última por una ausencia.</p>
   */
  const zonasPorUso = useMemo(
    () =>
      (panel.data?.occupancy.zones ?? [])
        .filter((zona) => zona.percent !== null)
        .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0)),
    [panel.data],
  );

  /**
   * La ocupación total, y de qué se compone.
   *
   * <p>Devuelve las tres cifras y no sólo el porcentaje: la referencia pone «1.402 / 2.000
   * espacios» bajo el número del dónut, y ese reparto ya se calculaba acá para dividir — sólo se
   * tiraba. Es dato real del panel, no una cifra nueva.</p>
   */
  const ocupacion = useMemo(() => {
    const zones = (panel.data?.occupancy.zones ?? []).filter((zona) => zona.percent !== null);
    if (zones.length === 0) return null;
    const activas = zones.reduce((suma, zona) => suma + zona.activeSessions, 0);
    const bahias = zones.reduce((suma, zona) => suma + zona.baysInService, 0);
    if (bahias === 0) return null;
    return { pct: Math.round((activas / bahias) * 100), activas, bahias };
  }, [panel.data]);

  const barras: BarChartDatum[] = useMemo(() => {
    const days = serie.data?.days ?? [];
    const currency = serie.data?.currencyCode ?? 'CRC';
    return days.map((day) => ({
      key: day.date,
      /* Lun, Mar, Mié… y no «5/10» (08-10-2026). La referencia rotula el bloque «Ingresos esta
         semana» con los días de la semana, y para siete barras es la etiqueta correcta: dice qué
         día de la semana fue sin hacer la cuenta. La fecha completa no se pierde —va en
         `labelLong` y en `ariaLabel`, que es lo que se lee al pasar por encima y lo que anuncia un
         lector de pantalla. */
      label: formatDate(`${day.date}T12:00:00`, locale, { weekday: 'short' }),
      labelLong: formatDate(`${day.date}T12:00:00`, locale, { day: 'numeric', month: 'long' }),
      value: day.totalMinor,
      valueLabel: formatCurrencyMinor(day.totalMinor, currency, locale),
      ariaLabel: `${formatDate(`${day.date}T12:00:00`, locale, {
        dateStyle: 'long',
      })}: ${formatCurrencyMinor(day.totalMinor, currency, locale)}`,
    }));
  }, [serie.data, locale]);

  const eventos: AuditEvent[] = useMemo(
    () => (actividad.data?.items ?? []).filter((e) => e.action in ACTOS).slice(0, EVENTOS_A_MOSTRAR),
    [actividad.data],
  );

  const servicios = useMemo(() => {
    const respondio = panel.isSuccess;
    const fallo = panel.isError;
    const inspectoresActivos = (panel.data?.inspectors ?? []).length;
    const fallos = panel.data?.paymentFailures.count ?? 0;
    return [
      {
        clave: 'api',
        etiqueta: t('admin.home.system.api'),
        estado: fallo ? 'bad' : respondio ? 'ok' : 'none',
        texto: fallo ? t('admin.home.system.down') : respondio ? t('admin.home.system.up') : '…',
      },
      {
        clave: 'db',
        etiqueta: t('admin.home.system.database'),
        estado: fallo ? 'bad' : respondio ? 'ok' : 'none',
        texto: fallo ? t('admin.home.system.unknown') : respondio ? t('admin.home.system.up') : '…',
      },
      {
        clave: 'enforcement',
        etiqueta: t('admin.home.system.enforcement'),
        // Sin actividad hoy NO es una falla: es un dato. Gris, no ámbar.
        estado: inspectoresActivos > 0 ? 'ok' : 'none',
        texto:
          inspectoresActivos > 0
            ? t('admin.home.system.enforcementActive', { count: String(inspectoresActivos) })
            : t('admin.home.system.enforcementIdle'),
      },
      {
        clave: 'gateway',
        etiqueta: t('admin.home.system.gateway'),
        estado: 'none',
        texto: t('admin.home.system.noSource'),
      },
      {
        clave: 'alerts',
        etiqueta: t('admin.home.system.alerts'),
        estado: fallos > 0 ? 'warn' : 'ok',
        texto:
          fallos > 0
            ? t('admin.home.system.failedPayments', { count: String(fallos) })
            : t('admin.home.system.noAlerts'),
      },
    ] as const;
  }, [panel.isSuccess, panel.isError, panel.data, t]);

  /**
   * «Atención requerida» (§12): sólo con una condición REAL que pida acción del administrador.
   *
   * <p>El documento es explícito en los dos sentidos: «sólo aparece si existe una condición que
   * requiere acción» y «si no hay nada que atender, no reservar un bloque vacío y no inventar
   * alertas». Así que esta lista puede quedar en cero, y entonces el bloque no se dibuja.</p>
   *
   * <p>Las dos que el panel sabe contestar hoy, y ninguna más:</p>
   * <ul>
   *   <li><b>Pagos rechazados</b> — `paymentFailures` del panel. Pide acción: alguien no pudo
   *       pagar y la municipalidad no cobró.</li>
   *   <li><b>Ninguna zona con bahías numeradas</b> — es configuración incompleta, que el propio
   *       documento nombra como ejemplo válido, y además es la causa de que la ocupación no se
   *       pueda calcular. Lleva a Zonas, que es donde se arregla.</li>
   * </ul>
   *
   * <p>Lo que la referencia dibuja y NO está: «5 boletas sin sincronizar» —la cola vive en el
   * teléfono del fiscalizador, el servidor no la conoce— y «2 reportes de ciudadanos», que no
   * existe como concepto en la plataforma. Inventarlas sería exactamente la alerta ficticia que el
   * documento prohíbe.</p>
   */
  const atencion = useMemo(() => {
    const items: { clave: string; texto: string; ruta: string }[] = [];
    const fallos = panel.data?.paymentFailures.count ?? 0;
    if (fallos > 0) {
      items.push({
        clave: 'payments',
        texto: tPlural('admin.home.attention.payments', fallos),
        ruta: '/billing',
      });
    }
    if (panel.isSuccess && ocupacion === null) {
      items.push({ clave: 'zones', texto: t('admin.home.attention.noZones'), ruta: '/zones' });
    }
    return items;
  }, [panel.data, panel.isSuccess, ocupacion, t, tPlural]);

  const municipalidad = activeTenant?.name ?? t('app.name');
  const nombre = me?.user.givenName ?? null;
  const pie = (
    <>
      <span>{t('admin.home.footer.product')}</span>
      <span>{municipalidad}</span>
    </>
  );

  return (
    <AdminShell footer={pie}>
      <div className="lx-home">
        {/* --- B. el saludo ----------------------------------------------------------------
            La referencia usa este bloque como entrada humana al tablero: «Hola, [nombre]» y
            debajo «Administración municipal · Escazú», con la fecha y la hora a la derecha.

            Antes acá estaba el nombre de la municipalidad como `h1` y, en el mismo renglón, la
            franja de estado de los servicios. La franja se fue al final de la página: la sección 6
            del documento pide que los estados técnicos «no dominen la cabecera» y que, si se
            mantienen, sean «secundarios y compactos». Ninguno se eliminó — están los cuatro, en
            una línea, donde se consultan cuando se buscan y no cuando no.

            El nombre es el de verdad cuando la sesión lo trae. La municipalidad no se pierde: pasa
            al renglón de abajo, que es donde la referencia la pone. */}
        <header className="lx-home__top">
          <div className="lx-home__title">
            <h1>
              {nombre ? t('admin.home.greeting', { name: nombre }) : t('admin.home.greeting.plain')}
            </h1>
            <p className="lx-text-meta lx-home__when">{t('admin.home.where', { tenant: municipalidad })}</p>
          </div>
          <div className="lx-home__clock">
            <span className="lx-home__date">{formatDate(ahora, locale, { dateStyle: 'full' })}</span>
            <span className="lx-home__hour">{formatTime(ahora, locale)}</span>
          </div>
        </header>

        {puedeVerCifras ? (
          <>
            {/* --- C. los cuatro KPI de la referencia, en su orden -----------------------------
                Cambia el reparto, no el componente: siguen siendo cuatro `MetricCard`, que ya
                traía icono con acento, número grande, variación y chevron. Lo que cambia es QUÉ
                miden. «Ocupación» sale de la fila —pasa a ser el dónut de la fila siguiente, que
                es lo que el documento pide— y entra «Usuarios registrados».

                La variación aparece en dos de las cuatro, y eso es a propósito: recaudación tiene
                la serie de días e ingresos de ayer, y multas tiene el panel de ayer. Los
                estacionamientos activos son un valor de AHORA y el total de cuentas no tiene un
                ayer que el servidor sepa contar; ahí no se dibuja un porcentaje. */}
            <div className="lx-home-kpis">
              <MetricCard
                icon={<IconCar size={20} />}
                tone="info"
                label={t('admin.home.kpi.activeSessions')}
                value={
                  panel.isLoading ? (
                    <Skeleton height="1.5rem" width="50%" />
                  ) : (
                    String(panel.data?.occupancy.activeSessions ?? 0)
                  )
                }
                hint={t('admin.home.kpi.rightNow')}
                onOpen={() => navigate('/dashboard')}
                openLabel={t('admin.home.kpi.open', { label: t('admin.home.kpi.activeSessions') })}
              />
              <MetricCard
                icon={<IconUsers size={20} />}
                tone="primary"
                label={t('admin.home.kpi.registeredUsers')}
                value={
                  usuarios.isLoading ? (
                    <Skeleton height="1.5rem" width="60%" />
                  ) : usuarios.isError ? (
                    t('admin.dashboard.noData')
                  ) : (
                    String(usuarios.data?.totalElements ?? 0)
                  )
                }
                hint={t('admin.home.kpi.registered')}
                onOpen={() => navigate('/users')}
                openLabel={t('admin.home.kpi.open', { label: t('admin.home.kpi.registeredUsers') })}
              />
              <MetricCard
                icon={<IconFine size={20} />}
                tone="warning"
                label={t('admin.home.kpi.citations')}
                value={panel.isLoading ? <Skeleton height="1.5rem" width="40%" /> : String(boletasHoy)}
                delta={
                  multasVariacion != null
                    ? t('admin.home.kpi.vsYesterday', {
                        delta: `${multasVariacion > 0 ? '+' : ''}${multasVariacion}%`,
                      })
                    : undefined
                }
                trend={
                  multasVariacion == null ? 'flat' : multasVariacion > 0 ? 'up' : multasVariacion < 0 ? 'down' : 'flat'
                }
                hint={multasVariacion == null ? t('admin.home.kpi.inPeriod') : undefined}
                onOpen={irALasBoletasDeHoy}
                openLabel={t('admin.home.kpi.open', { label: t('admin.home.kpi.citations') })}
              />
              <MetricCard
                icon={<IconChart size={20} />}
                tone="success"
                label={t('admin.home.kpi.revenue')}
                value={
                  serie.isLoading ? (
                    <Skeleton height="1.5rem" width="70%" />
                  ) : recaudacion ? (
                    dinero(recaudacion.totalMinor, recaudacion.currencyCode)
                  ) : (
                    t('admin.dashboard.noData')
                  )
                }
                delta={
                  recaudacion?.variacion != null
                    ? t('admin.home.kpi.vsYesterday', {
                        delta: `${recaudacion.variacion > 0 ? '+' : ''}${recaudacion.variacion}%`,
                      })
                    : undefined
                }
                hint={recaudacion?.variacion == null ? t('admin.home.kpi.noComparison') : undefined}
                trend={
                  recaudacion?.variacion == null
                    ? 'flat'
                    : recaudacion.variacion > 0
                      ? 'up'
                      : recaudacion.variacion < 0
                        ? 'down'
                        : 'flat'
                }
                onOpen={() => navigate('/billing')}
                openLabel={t('admin.home.kpi.open', { label: t('admin.home.kpi.revenue') })}
              />
            </div>

            {/* --- D. fila 2: ocupación (ancha) + ingresos de la semana -------------------------
                La inversión que pide la sección 6 del documento: el gráfico de recaudación tenía
                el 65% del ancho y la ocupación el 35%; ahora es al revés. «Reducir drásticamente
                su protagonismo» y «llevar la ocupación por zona al bloque de Ocupación en tiempo
                real: dónut + lista de zonas». El gráfico no se elimina ni se reemplaza: es el
                mismo `BarChart` con la misma serie, en la columna angosta. */}
            <div className="lx-home-grid lx-home-grid--analytics">
              <Card className="lx-card--dense">
                <SectionHeader
                  title={t('admin.home.zones.title')}
                  aside={
                    <Link to="/dashboard" className="lx-linklike lx-linklike--go">
                      {t('admin.home.occupancy.detail')}
                      <IconChevronRight size={14} />
                    </Link>
                  }
                />
                {panel.isLoading ? (
                  <div className="lx-occupancy">
                    <Skeleton height={168} width={168} shape="block" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Skeleton height="1.75rem" />
                      <Skeleton height="1.75rem" />
                      <Skeleton height="1.75rem" />
                    </div>
                  </div>
                ) : (
                  <div className="lx-occupancy">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--lx-space-2)' }}>
                      <OccupancyDonut
                        percent={ocupacion?.pct ?? null}
                        caption={t('admin.home.occupancy.total')}
                        emptyLabel={t('admin.home.occupancy.noBase')}
                        title={t('admin.home.zones.title')}
                        /* 136 y no los 168 por omisión. El plan del 09-10 lo pide con su razón:
                           «reducir su diámetro respecto a staging para dar espacio a las zonas».
                           Medido, el anillo soltaba 32px de ancho que la lista de zonas estaba
                           pidiendo —ahí es donde «Escazú centro prueba» y su barra competían—. El
                           componente escala su grosor con el diámetro, así que no hay nada más
                           que ajustar. */
                        size={136}
                      />
                      {/* De qué se compone el porcentaje. La referencia lo pone bajo el número y
                          son dos cifras que el panel ya daba: estadías corriendo sobre bahías en
                          servicio. Sin ellas, «70%» es un número que hay que creerse. */}
                      {ocupacion ? (
                        <span className="lx-text-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {t('admin.home.occupancy.spaces', {
                            activas: ocupacion.activas,
                            bahias: ocupacion.bahias,
                          })}
                        </span>
                      ) : null}
                    </div>
                    <div className="lx-occupancy__zones">
                      <ZonesOccupancy
                        zones={panel.data?.occupancy.zones ?? []}
                        emptyLabel={t('admin.home.zones.empty')}
                        noBaysLabel={t('admin.home.zones.noBays')}
                      />
                    </div>
                  </div>
                )}
              </Card>

              <Card className="lx-card--dense">
                {/* El «rango compacto» que pide la sección 3.D, al lado del título. La referencia
                    lo dibuja como un desplegable; acá es un rótulo, y eso no es una simplificación
                    perezosa: esta tarjeta pide SIEMPRE los mismos siete días
                    (`DIAS_DEL_GRAFICO`), así que un desplegable ofrecería opciones que no cambian
                    nada. Lo que el rótulo hace es decir qué ventana se está mirando, que es la
                    información que faltaba. El selector de período de verdad vive en el Panel, que
                    es la pantalla que lo sabe usar. */}
                <SectionHeader
                  title={t('admin.home.revenue.title')}
                  aside={
                    <span className="lx-text-meta">
                      {t('admin.home.revenue.range', { days: DIAS_DEL_GRAFICO })}
                    </span>
                  }
                />
                {/* El total de la semana, encima del gráfico. La referencia lo pone grande junto
                    al título, y es un dato que la serie ya trae sumado (`totalMinor`): hasta hoy
                    había que leerlo barra por barra. En su propia línea y no dentro del
                    `SectionHeader`, que es lo que el punto 7 pide al decir «no superponer fecha,
                    total y título: cada elemento debe tener su propia zona de layout». */}
                {serie.data && serie.data.totalMinor > 0 ? (
                  <p className="lx-home__week-total">
                    {dinero(serie.data.totalMinor, serie.data.currencyCode)}
                  </p>
                ) : null}
                {serie.isLoading ? (
                  // Un bloque del tamaño del gráfico, no la palabra «Cargando»: así la pantalla no
                  // se reacomoda cuando el dato llega.
                  <Skeleton height={176} shape="block" />
                ) : serie.isError ? (
                  <div className="lx-inline-error">
                    <span>{t('common.error.generic')}</span>
                    <Button type="button" variant="secondary" onClick={() => void serie.refetch()}>
                      {t('common.retry')}
                    </Button>
                  </div>
                ) : (
                  <>
                    <BarChart
                      title={t('admin.home.revenue.title')}
                      data={barras}
                      emptyLabel={t('admin.home.revenue.empty')}
                      formatAxis={(valor) => dinero(Math.round(valor), serie.data?.currencyCode ?? 'CRC')}
                      tableHeaders={{
                        label: t('admin.home.revenue.columnDay'),
                        value: t('admin.home.revenue.columnAmount'),
                      }}
                    />
                    {/* Con TODO en cero el gráfico se queda —los siete días siguen dibujados— y la
                        nota va debajo. Convertir la tarjeta en un párrafo escondería que la semana
                        existe y que la municipalidad no cobró en ella, que es el dato. */}
                    {barras.length > 0 && barras.every((b) => b.value === 0) ? (
                      <p className="lx-text-meta" style={{ margin: 'var(--lx-space-2) 0 0' }}>
                        {t('admin.home.revenue.empty')}
                      </p>
                    ) : null}
                  </>
                )}
              </Card>
            </div>

            {/* --- E. fila 3: actividad | (accesos rápidos + zonas más utilizadas) --------------
                La columna derecha lleva DOS tarjetas apiladas, que es la composición de la
                referencia. Es también lo que justifica subir la actividad de tres eventos a cinco:
                con la derecha apilada, la izquierda tiene el alto para gastarlo. */}
            <div className="lx-home-grid lx-home-grid--operation">
              <Card className="lx-card--dense">
                <SectionHeader
                  title={t('admin.home.activity.title')}
                  // El enlace al registro completo va en el renglón del título y no debajo de la
                  // lista: ahí cuesta 0px de alto en vez de 30, y queda al lado de lo que nombra.
                  aside={
                    eventos.length > 0 ? (
                      <Link to="/audit" className="lx-linklike lx-linklike--go">
                        {t('admin.home.activity.seeAll')}
                        <IconChevronRight size={14} />
                      </Link>
                    ) : undefined
                  }
                />
                {actividad.isLoading ? (
                  <>
                    <Skeleton height="2.5rem" />
                    <Skeleton height="2.5rem" />
                    <Skeleton height="2.5rem" />
                  </>
                ) : eventos.length === 0 ? (
                  // Dos líneas, no un párrafo centrado en media pantalla.
                  <p className="lx-feed__empty">
                    <span className="lx-feed__empty-title">{t('admin.home.activity.emptyTitle')}</span>
                    <span className="lx-feed__empty-body">{t('admin.home.activity.emptyBody')}</span>
                  </p>
                ) : (
                  <div className="lx-feed">
                    {eventos.map((evento) => {
                      const acto = ACTOS[evento.action];
                      return (
                        <div key={evento.id} className="lx-feed__item">
                          <span className="lx-feed__icon" aria-hidden="true">
                            {acto?.icon}
                          </span>
                          <span className="lx-feed__what">
                            <span className="lx-feed__title">{t(acto?.key as TranslationKey)}</span>
                            <span className="lx-feed__context">
                              {evento.actorName ?? t('admin.home.activity.system')}
                            </span>
                          </span>
                          <span className="lx-feed__when">
                            {formatRelativeTime(evento.occurredAt, locale, ahora) ??
                              formatDate(evento.occurredAt, locale)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <div className="lx-home-stack">
                <Card className="lx-card--dense">
                  <SectionHeader title={t('admin.home.quick.title')} />
                  <QuickActions />
                </Card>

                {/* «Zonas más utilizadas»: el bloque nuevo de la referencia. Mismo dato que la
                    lista del dónut —`occupancy.zones`, ordenado una sola vez más arriba— leído de
                    otra manera: ahí es «cuán llena está cada una», acá es «cuáles son las que más
                    se usan». Las dos salen de la misma ordenación a propósito. */}
                <Card className="lx-card--dense">
                  <SectionHeader
                    title={t('admin.home.rank.title')}
                    aside={
                      <Link to="/zones" className="lx-linklike lx-linklike--go">
                        {t('admin.home.rank.detail')}
                        <IconChevronRight size={14} />
                      </Link>
                    }
                  />
                  {panel.isLoading ? (
                    <>
                      <Skeleton height="1.75rem" />
                      <Skeleton height="1.75rem" />
                      <Skeleton height="1.75rem" />
                    </>
                  ) : (
                    <ZoneRanking zonas={zonasPorUso} emptyLabel={t('admin.home.rank.empty')} />
                  )}
                </Card>
              </div>
            </div>

            {/* --- G. Atención requerida, SÓLO con incidencias reales --------------------------
                El punto 12 lo acota en las dos direcciones: aparece si hay algo que atender, y si
                no hay nada no se reserva un bloque vacío. Por eso esto es una lista que puede
                quedar en cero y entonces no se dibuja nada — ni un «todo en orden», que sería un
                bloque ocupando sitio para decir que no hace falta.

                No reemplaza al estado de los servicios: son cosas distintas y van las dos. Éste
                dice «hacé algo»; el de abajo dice «así están las piezas». */}
            {atencion.length > 0 ? (
              <section className="lx-home-attention" aria-label={t('admin.home.attention.title')}>
                <h2 className="lx-home-attention__title">
                  <span className="lx-home-attention__icon" aria-hidden="true">
                    <IconFine size={16} />
                  </span>
                  {t('admin.home.attention.title')}
                  <span className="lx-home-attention__count">{atencion.length}</span>
                </h2>
                {atencion.map((item) => (
                  <button
                    key={item.clave}
                    type="button"
                    className="lx-home-attention__item"
                    onClick={() => navigate(item.ruta)}
                  >
                    <span>{item.texto}</span>
                    <span className="lx-linklike lx-linklike--go">
                      {t('admin.home.attention.review')}
                      <IconChevronRight size={14} />
                    </span>
                  </button>
                ))}
              </section>
            ) : null}

            {/* --- Estado de los servicios, al final y en un renglón ---------------------------
                Estaba en la cabecera, compartiendo fila con el título. La sección 6 del documento
                pide que los estados técnicos no dominen la cabecera y que, si se mantienen, sean
                secundarios y compactos: están los cuatro, en una línea, al pie del tablero.
                Ninguno se eliminó — lo que cambió es el orden de lectura de la pantalla. */}
            <section className="lx-home__status" aria-busy={panel.isLoading}>
              <h2 className="lx-home__status-title">{t('admin.home.system.title')}</h2>
              {servicios.map((servicio) => (
                <span key={servicio.clave} className="lx-status-bar__item">
                  <span
                    className={`lx-status-strip__dot lx-status-strip__dot--${servicio.estado}`}
                    aria-hidden="true"
                  />
                  <span>
                    {servicio.etiqueta}: <strong>{servicio.texto}</strong>
                  </span>
                </span>
              ))}
            </section>
          </>
        ) : (
          <>
            <Card>
              <SectionHeader
                title={t('admin.home.noFigures.title')}
                description={t('admin.home.noFigures.body')}
              />
            </Card>
            <Card>
              <SectionHeader title={t('admin.home.quick.title')} />
              <QuickActions />
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}

/**
 * Una fila por zona: nombre a la izquierda, porcentaje a la derecha, barra fina debajo.
 *
 * <p>Compacta a propósito (§6 de la v3): seis zonas tienen que caber en la columna angosta sin que
 * la tarjeta crezca más que el gráfico de al lado. El porcentaje va SIEMPRE en texto —el color dice
 * severidad, no valor— porque un tablero que informa sólo por color no le informa a quien no
 * distingue el ámbar del rojo.</p>
 */
function ZonesOccupancy({
  zones,
  emptyLabel,
  noBaysLabel,
}: {
  zones: readonly {
    zoneId: string;
    code: string;
    name: string;
    activeSessions: number;
    baysInService: number;
    percent: number | null;
  }[];
  emptyLabel: string;
  noBaysLabel: string;
}): React.JSX.Element {
  if (zones.length === 0) return <p className="lx-text-meta">{emptyLabel}</p>;

  // Las más llenas primero: es la pregunta que trae a alguien a esta tarjeta. Las que no tienen
  // bahías numeradas van al final, porque no tienen porcentaje con el cual ordenarse.
  const ordenadas = [...zones]
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1))
    .slice(0, ZONAS_EN_PORTADA);

  return (
    <div>
      {ordenadas.map((zona, indice) => {
        const pct = zona.percent;
        const tono =
          pct == null
            ? ''
            : pct >= OCUPACION_ALTA
              ? ' lx-zone-row__fill--full'
              : pct >= OCUPACION_MEDIA
                ? ' lx-zone-row__fill--warn'
                : '';
        return (
          <div key={zona.zoneId} className="lx-zone-row">
            <span className="lx-zone-row__name" title={zona.name}>
              {/* El punto de color delante del nombre, como en la referencia. Es decoración y por
                  eso está oculto para un lector de pantalla: el porcentaje de la derecha es lo que
                  informa, y el color no distingue a una zona de otra por sí solo — sirve para
                  seguir una fila con la vista en una lista de cinco. */}
              <span
                className="lx-zone-row__dot"
                style={{ background: `var(--lx-series-${(indice % 5) + 1})` }}
                aria-hidden="true"
              />
              {zona.name}
            </span>
            <span className="lx-zone-row__value">{pct == null ? noBaysLabel : `${pct}%`}</span>
            <span className="lx-zone-row__track">
              {/* Una zona sin bahías numeradas no tiene barra: no hay proporción que dibujar, y
                  pintarla en cero diría que está vacía. */}
              {pct == null ? null : (
                <span
                  className={`lx-zone-row__fill${tono}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Cuatro atajos en cuadrícula 2×2, cada uno con su icono.
 *
 * <p>Era una columna de botones grandes que obligaba a desplazar dentro de la tarjeta. Cada baldosa
 * entera es el enlace —no sólo el título— porque un blanco de 64px es el que no obliga a apuntar.</p>
 *
 * <p>Cada acceso aparece sólo si la cuenta tiene el permiso de la pantalla a la que lleva. Esconder
 * el botón no reemplaza la validación del servidor, que se vuelve a hacer; pero ofrecer un atajo que
 * termina en «no tiene permiso» es una promesa rota en la primera pantalla.</p>
 */
function QuickActions(): React.JSX.Element {
  const { t } = useTranslation();
  const permissions = usePermissions();

  const accesos: {
    to: string;
    title: TranslationKey;
    hint: TranslationKey;
    icon: React.ReactNode;
    visible: boolean;
  }[] = [
    {
      to: '/zones',
      title: 'admin.home.quick.zone',
      hint: 'admin.home.quick.zoneHint',
      icon: <IconPin size={18} />,
      visible: permissions.has('TENANT_MANAGE'),
    },
    {
      to: '/spaces',
      title: 'admin.home.quick.space',
      hint: 'admin.home.quick.spaceHint',
      icon: <IconPark size={18} />,
      visible: permissions.has('TENANT_MANAGE'),
    },
    {
      to: '/enforcement/citations',
      title: 'admin.home.quick.plate',
      hint: 'admin.home.quick.plateHint',
      icon: <IconSearch size={18} />,
      visible: permissions.has('CITATION_READ'),
    },
    {
      to: '/reports',
      title: 'admin.home.quick.report',
      hint: 'admin.home.quick.reportHint',
      icon: <IconReports size={18} />,
      visible: permissions.has('EXPORT_RUN'),
    },
  ];

  const visibles = accesos.filter((acceso) => acceso.visible);
  if (visibles.length === 0) {
    return <p className="lx-text-meta">{t('admin.home.quick.none')}</p>;
  }

  return (
    <div className="lx-quick-grid">
      {visibles.map((acceso) => (
        <Link key={acceso.to} to={acceso.to} className="lx-quick-tile">
          <span className="lx-quick-tile__icon" aria-hidden="true">
            {acceso.icon}
          </span>
          <span className="lx-quick-tile__title">{t(acceso.title)}</span>
          <span className="lx-quick-tile__hint">{t(acceso.hint)}</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * «Zonas más utilizadas»: el mismo dato que la lista del dónut, leído como clasificación.
 *
 * <p>Por qué dos bloques y no uno: son dos preguntas distintas con la misma materia prima. La lista
 * del dónut contesta «cuán llena está cada zona» —y por eso lleva el color de severidad y las zonas
 * sin bahías numeradas al final—; esto contesta «cuáles son las que más se usan», que es una
 * clasificación y se lee por posición. La referencia aprobada las muestra como dos tarjetas
 * separadas, y la ordenación es UNA, calculada en `zonasPorUso`, para que la zona que está primera
 * acá no esté segunda allá.</p>
 *
 * <p>El número de posición va en el marcado y no como un `::before` de CSS: es información —el
 * puesto— y tiene que leerse en voz alta junto al nombre.</p>
 */
function ZoneRanking({
  zonas,
  emptyLabel,
}: {
  zonas: readonly { zoneId: string; name: string; percent: number | null }[];
  emptyLabel: string;
}): React.JSX.Element {
  if (zonas.length === 0) return <p className="lx-text-meta">{emptyLabel}</p>;
  // La barra se mide contra la PRIMERA, no contra 100: en una municipalidad cuya zona más usada va
  // al 42%, cuatro barras contra 100 son cuatro muñones casi iguales y la clasificación no se ve.
  // El porcentaje real va siempre escrito al lado, que es de donde se lee el valor.
  const techo = Math.max(...zonas.map((z) => z.percent ?? 0), 1);
  return (
    <ol className="lx-zone-rank">
      {zonas.slice(0, ZONAS_EN_RANKING).map((zona, indice) => (
        <li key={zona.zoneId} className="lx-zone-rank__row">
          <span className="lx-zone-rank__pos" aria-hidden="true">
            {indice + 1}
          </span>
          <span className="lx-zone-rank__name" title={zona.name}>
            {zona.name}
          </span>
          <span className="lx-zone-rank__track">
            <span
              className="lx-zone-rank__fill"
              style={{ width: `${Math.round(((zona.percent ?? 0) / techo) * 100)}%` }}
            />
          </span>
          <span className="lx-zone-rank__value">{zona.percent ?? 0}%</span>
        </li>
      ))}
    </ol>
  );
}
