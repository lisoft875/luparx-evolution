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
  IconFine,
  IconGauge,
  IconPark,
  IconPin,
  IconReports,
  IconSearch,
  IconTopUp,
  MetricCard,
  SectionHeader,
  Skeleton,
} from '@luparx/ui';
import type { BarChartDatum, MetricTone } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

/**
 * Los actos que la actividad muestra: cómo se llaman y con qué icono.
 *
 * <p>El rastro guarda ochenta y pico de acciones y la mayoría son de sistema. Este mapa hace tres
 * trabajos a la vez —decide qué se muestra, cómo se nombra y con qué se dibuja— y por eso un acto
 * que no esté acá no puede colarse sin traducir ni sin icono.</p>
 */
const ACTOS: Readonly<Record<string, { key: TranslationKey; icon: React.ReactNode }>> = {
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
const EVENTOS_A_MOSTRAR = 3;
const OCUPACION_ALTA = 85;
const OCUPACION_MEDIA = 70;
const ZONAS_EN_PORTADA = 6;
const DIAS_DEL_GRAFICO = 7;

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * La portada del portal de administración (especificación v3, 23-09-2026).
 *
 * <h2>Qué cambió respecto de la v2, y por qué no alcanzaba con «agregar datos»</h2>
 *
 * <p>La v2 puso las cifras correctas en la pantalla y aun así se leía como la original: cuatro
 * tarjetas de texto plano en fila, un gráfico que desaparecía cuando no había recaudación, un vacío
 * de actividad que ocupaba media pantalla y los accesos en una columna de botones. Los datos
 * estaban; la composición no.</p>
 *
 * <p>Lo que hace la v3 es estructura: cada métrica tiene icono y acento propios —se reconoce antes
 * de leerla—, la analítica y la operación viven en dos columnas de proporción distinta, la
 * actividad es un feed y los accesos una cuadrícula. El fondo, los tokens y los endpoints son los
 * mismos.</p>
 *
 * <h2>Las tres reglas que no se negocian</h2>
 *
 * <p><b>Ninguna cifra es inventada.</b> Los montos de la referencia visual —₡1.248.350, 342, 28,
 * 78%— no están en este archivo ni en ningún otro: cada número sale de su endpoint. El arnés
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
  const { t, locale } = useTranslation();
  const { activeTenant, apiClient } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const puedeVerCifras = permissions.has('AUDIT_READ');

  const ahora = new Date();
  const desdeHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

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

  const actividad = useQuery({
    queryKey: ['admin', 'home', 'actividad'],
    queryFn: () => apiClient.adminAudit.list({ page: 0, size: EVENTOS_A_PEDIR }),
    enabled: puedeVerCifras,
    refetchInterval: 60_000,
  });

  const dinero = (minor: number, currency: string): string => formatCurrencyMinor(minor, currency, locale);

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

  const ocupacion = useMemo(() => {
    const zones = (panel.data?.occupancy.zones ?? []).filter((zona) => zona.percent !== null);
    if (zones.length === 0) return null;
    const activas = zones.reduce((suma, zona) => suma + zona.activeSessions, 0);
    const bahias = zones.reduce((suma, zona) => suma + zona.baysInService, 0);
    if (bahias === 0) return null;
    return Math.round((activas / bahias) * 100);
  }, [panel.data]);

  const barras: BarChartDatum[] = useMemo(() => {
    const days = serie.data?.days ?? [];
    const currency = serie.data?.currencyCode ?? 'CRC';
    return days.map((day) => ({
      key: day.date,
      label: formatDate(`${day.date}T12:00:00`, locale, { day: 'numeric', month: 'numeric' }),
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

  const municipalidad = activeTenant?.name ?? t('app.name');
  const pie = (
    <>
      <span>{t('admin.home.footer.product')}</span>
      <span>{municipalidad}</span>
    </>
  );

  return (
    <AdminShell footer={pie}>
      <div className="lx-home">
        {/* --- A. encabezado Y estado del sistema, en un renglón -------------------------------
            La v4 §1 pide que el contenido operativo entre sin scroll en una laptop. Medido en
            staging, el encabezado apilado sobre la franja de estado gastaba ~160px antes del
            primer número: más que la fila entera de KPI. Ninguno de los dos es un dato del
            negocio —uno dice dónde estás, el otro si los servicios responden—, así que comparten
            renglón y el alto recuperado se lo queda el gráfico. Nada se eliminó: están los
            cuatro indicadores, el nombre, la fecha y la hora. */}
        <header className="lx-home__top">
          <div className="lx-home__title">
            <h1>{municipalidad}</h1>
            <p className="lx-text-meta lx-home__when">
              {t('admin.home.subtitle', { date: formatDate(ahora, locale, { dateStyle: 'long' }) })}
              {' · '}
              {formatTime(ahora, locale)}
            </p>
          </div>
          {puedeVerCifras ? (
            <div className="lx-home__status" aria-busy={panel.isLoading}>
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
            </div>
          ) : null}
        </header>

        {puedeVerCifras ? (
          <>
            {/* --- C. los cuatro KPIs --------------------------------------------------------- */}
            <div className="lx-home-kpis">
              <MetricCard
                icon={<IconChart size={20} />}
                tone="primary"
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
                // La variación existe SÓLO acá, que es donde hay un ayer con el cual comparar.
                delta={
                  recaudacion?.variacion != null
                    ? t('admin.home.kpi.vsYesterday', {
                        delta: `${recaudacion.variacion > 0 ? '+' : ''}${recaudacion.variacion}%`,
                      })
                    : undefined
                }
                // v4 §5: sin un ayer contra el cual comparar NO se calcula un porcentaje. Decirlo
                // cuesta un renglón que igual está reservado; inventarlo cuesta que alguien repita
                // la cifra en una reunión.
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
                openLabel={t('admin.home.kpi.revenue')}
              />
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
              />
              <MetricCard
                icon={<IconFine size={20} />}
                tone="warning"
                label={t('admin.home.kpi.citations')}
                value={panel.isLoading ? <Skeleton height="1.5rem" width="40%" /> : String(boletasHoy)}
                hint={t('admin.home.kpi.inPeriod')}
              />
              <MetricCard
                icon={<IconGauge size={20} />}
                tone={ocupacionTone(ocupacion)}
                label={t('admin.home.kpi.occupancy')}
                value={
                  panel.isLoading ? (
                    <Skeleton height="1.5rem" width="40%" />
                  ) : ocupacion != null ? (
                    `${ocupacion}%`
                  ) : (
                    t('admin.dashboard.noData')
                  )
                }
                hint={ocupacion != null ? t('admin.home.kpi.rightNow') : t('admin.home.kpi.noBaysHint')}
              />
            </div>

            {/* --- D. analítica: gráfico 65% + ocupación 35% ---------------------------------- */}
            <div className="lx-home-grid">
              <Card className="lx-card--dense">
                <SectionHeader
                  title={t('admin.home.revenue.title')}
                  description={t('admin.home.revenue.description')}
                />
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

              <Card className="lx-card--dense">
                <SectionHeader
                  title={t('admin.home.zones.title')}
                  description={t('admin.home.zones.description')}
                />
                {panel.isLoading ? (
                  <>
                    <Skeleton height="2.5rem" />
                    <Skeleton height="2.5rem" />
                    <Skeleton height="2.5rem" />
                  </>
                ) : (
                  <ZonesOccupancy
                    zones={panel.data?.occupancy.zones ?? []}
                    emptyLabel={t('admin.home.zones.empty')}
                    noBaysLabel={t('admin.home.zones.noBays')}
                  />
                )}
              </Card>
            </div>

            {/* --- E. operación: actividad 60% + accesos 40% ---------------------------------- */}
            <div className="lx-home-grid lx-home-grid--operation">
              <Card className="lx-card--dense">
                <SectionHeader
                  title={t('admin.home.activity.title')}
                  description={t('admin.home.activity.description')}
                  // El enlace al registro completo va en el renglón del título y no debajo de la
                  // lista: ahí cuesta 0px de alto en vez de 30, y queda al lado de lo que nombra.
                  aside={
                    eventos.length > 0 ? (
                      <Link to="/audit" className="lx-linklike">
                        {t('admin.home.activity.seeAll')}
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
                  <>
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
                  </>
                )}
              </Card>

              <Card className="lx-card--dense">
                <SectionHeader title={t('admin.home.quick.title')} />
                <QuickActions />
              </Card>
            </div>
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

/** El acento del KPI de ocupación: es la única métrica cuyo valor sí tiene estado. */
function ocupacionTone(percent: number | null): MetricTone {
  if (percent == null) return 'primary';
  if (percent >= OCUPACION_ALTA) return 'warning';
  return 'success';
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
      {ordenadas.map((zona) => {
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
