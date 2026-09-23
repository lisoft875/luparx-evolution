import * as React from 'react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
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
import { BarChart, Card, EmptyState, SectionHeader, StatCard } from '@luparx/ui';
import type { BarChartDatum } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

/**
 * Los actos que esta lista muestra, y cómo se llaman en castellano.
 *
 * <p>El rastro de auditoría guarda ochenta y pico de acciones, y la mayoría son de sistema: cada
 * inicio de sesión, cada cambio de municipalidad activa. Una lista de «actividad reciente» llena de
 * `LOGIN_SUCCEEDED` no le dice nada a quien administra un cantón. Acá viven las que SÍ son
 * actividad del municipio, y el mapa hace dos trabajos a la vez: decide qué se muestra y cómo se
 * nombra. Un acto que no esté acá no se cuela sin traducir —se filtra— así que la pantalla no puede
 * terminar mostrando `PLATE_EXEMPTION_AMENDED` en la cara de nadie.</p>
 */
const ACTOS: Readonly<Record<string, TranslationKey>> = {
  WALLET_TOPUP_RECORDED: 'admin.home.activity.WALLET_TOPUP_RECORDED',
  CITATION_ISSUED: 'admin.home.activity.CITATION_ISSUED',
  CITATION_PAID: 'admin.home.activity.CITATION_PAID',
  CITATION_CANCELLED: 'admin.home.activity.CITATION_CANCELLED',
  CITATION_APPEAL_FILED: 'admin.home.activity.CITATION_APPEAL_FILED',
  CITATION_APPEAL_RESOLVED: 'admin.home.activity.CITATION_APPEAL_RESOLVED',
  PLATE_EXEMPTION_GRANTED: 'admin.home.activity.PLATE_EXEMPTION_GRANTED',
  PARKING_SPACE_CREATED: 'admin.home.activity.PARKING_SPACE_CREATED',
  PARKING_ZONE_UPDATED: 'admin.home.activity.PARKING_ZONE_UPDATED',
  PARKING_RATE_UPDATED: 'admin.home.activity.PARKING_RATE_UPDATED',
  PARKING_POLICY_UPDATED: 'admin.home.activity.PARKING_POLICY_UPDATED',
  PARKING_SCHEDULE_UPDATED: 'admin.home.activity.PARKING_SCHEDULE_UPDATED',
};

/** Cuántos eventos se piden para poder filtrar y que igual queden seis que mostrar. */
const EVENTOS_A_PEDIR = 40;
const EVENTOS_A_MOSTRAR = 6;

/** Desde qué porcentaje una zona deja de estar cómoda. */
const OCUPACION_ALTA = 85;
const OCUPACION_MEDIA = 70;

/** Cuántas zonas caben en la tarjeta antes de que sea una lista y no un resumen. */
const ZONAS_EN_PORTADA = 6;

/** Los últimos siete días, contados desde hoy inclusive. */
const DIAS_DEL_GRAFICO = 7;

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * La portada del portal de administración.
 *
 * <h2>Qué había acá antes</h2>
 *
 * <p>El título de la aplicación, el nombre de quien entró y tres enlaces sueltos —Usuarios,
 * Auditoría, Reportes— sobre un espacio vacío. Un administrador que entraba a las ocho de la mañana
 * no se enteraba de nada: ni cuánto se recaudó ayer, ni cuántos carros hay parqueados ahora, ni que
 * entraron cuatro reclamos durante la noche. Tenía que ir a buscarlo pantalla por pantalla.
 * (Especificación del 23-09-2026.)</p>
 *
 * <h2>Cada número es una fila que alguien puede ir a leer</h2>
 *
 * <p>Ninguna cifra de esta pantalla es un índice, un puntaje ni una tendencia trazada entre tres
 * puntos. Son conteos y sumas que existen en una tabla, y por eso cada bloque lleva al listado que
 * los contiene. Es la misma regla con la que está escrito el servicio del panel, y es lo que
 * distingue un tablero que una municipalidad puede <em>comprobar</em> de uno que sólo puede mirar.</p>
 *
 * <h2>Lo que NO se inventó</h2>
 *
 * <p>La franja de estado del mockup traía cuatro servicios. Sólo tres son comprobables desde este
 * portal: que la API contesta y que la base respondió (si no, la consulta habría fallado) y si hubo
 * fiscalización hoy. La pasarela de pagos no tiene ningún endpoint que la reporte, así que se
 * muestra como lo que es —sin fuente— en vez de pintarle un punto verde que nadie verificó. Un
 * indicador que dice «Operativo» sin haber preguntado es peor que no tener indicador: hace que
 * alguien confíe.</p>
 */
export function HomePage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { activeTenant, apiClient } = useAuth();
  const permissions = usePermissions();
  const puedeVerCifras = permissions.has('AUDIT_READ');

  const ahora = new Date();

  // Los límites de «hoy» según el reloj de quien mira. El dinero NO se calcula así —la serie la
  // corta el servidor con la zona horaria de la municipalidad— pero el conteo de boletas sí, y un
  // administrador que esté en otro país podría ver el corte del día desplazado unas horas. Se deja
  // dicho acá en vez de resolverse con una llamada extra sólo para averiguar la zona.
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

  // --- KPIs -------------------------------------------------------------------------------------

  /**
   * Lo recaudado hoy y cuánto cambió contra ayer, los dos de la misma fuente.
   *
   * <p>Sale de la serie y no del bloque `revenue` del panel, aunque los dos contestarían lo mismo:
   * dos fuentes para el mismo número es cómo una pantalla termina mostrando dos cifras que no
   * coinciden y nadie logra explicar cuál está mal.</p>
   */
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
   * La ocupación del cantón: estadías corriendo sobre bahías en servicio.
   *
   * <p>Sólo entran las zonas que tienen bahías numeradas. Una zona que se cobra por sector sin
   * pintar números no tiene denominador, y meterla con cero capacidad haría ver al municipio más
   * lleno de lo que está justo en la semana en que más importa.</p>
   */
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
      // Fecha corta bajo la barra: «17 sep». La completa vive en el rótulo y en la tabla.
      label: formatDate(`${day.date}T12:00:00`, locale, { day: 'numeric', month: 'short' }),
      value: day.totalMinor,
      valueLabel: formatCurrencyMinor(day.totalMinor, currency, locale),
      ariaLabel: `${formatDate(`${day.date}T12:00:00`, locale, {
        dateStyle: 'long',
      })}: ${formatCurrencyMinor(day.totalMinor, currency, locale)}`,
    }));
  }, [serie.data, locale]);

  const eventos: AuditEvent[] = useMemo(
    () =>
      (actividad.data?.items ?? [])
        .filter((evento) => evento.action in ACTOS)
        .slice(0, EVENTOS_A_MOSTRAR),
    [actividad.data],
  );

  // --- estado del sistema -----------------------------------------------------------------------

  /**
   * Lo único comprobable desde acá, y nada más.
   *
   * <p>Si `panel` respondió, la API contestó y leyó la base: son dos hechos, no dos suposiciones.
   * Fiscalización se lee de la actividad de inspectores que ya viene en el panel. La pasarela no
   * tiene endpoint en este portal —el de salud vive en el portal de plataforma— y se muestra sin
   * estado a propósito.</p>
   */
  const servicios = useMemo(() => {
    const respondio = panel.isSuccess;
    const fallo = panel.isError;
    const inspectoresActivos = (panel.data?.inspectors ?? []).length;
    const fallos = panel.data?.paymentFailures.count ?? 0;
    return [
      {
        clave: 'api' as const,
        etiqueta: t('admin.home.system.api'),
        estado: fallo ? ('bad' as const) : respondio ? ('ok' as const) : ('none' as const),
        texto: fallo ? t('admin.home.system.down') : respondio ? t('admin.home.system.up') : t('common.loading'),
      },
      {
        clave: 'db' as const,
        etiqueta: t('admin.home.system.database'),
        estado: fallo ? ('bad' as const) : respondio ? ('ok' as const) : ('none' as const),
        texto: fallo ? t('admin.home.system.unknown') : respondio ? t('admin.home.system.up') : t('common.loading'),
      },
      {
        clave: 'enforcement' as const,
        etiqueta: t('admin.home.system.enforcement'),
        // Sin actividad hoy NO es una falla: es un dato. Gris, no ámbar.
        estado: inspectoresActivos > 0 ? ('ok' as const) : ('none' as const),
        texto:
          inspectoresActivos > 0
            ? t('admin.home.system.enforcementActive', { count: String(inspectoresActivos) })
            : t('admin.home.system.enforcementIdle'),
      },
      {
        clave: 'gateway' as const,
        etiqueta: t('admin.home.system.gateway'),
        estado: 'none' as const,
        texto: t('admin.home.system.noSource'),
      },
      {
        clave: 'alerts' as const,
        etiqueta: t('admin.home.system.alerts'),
        estado: fallos > 0 ? ('warn' as const) : ('ok' as const),
        texto:
          fallos > 0
            ? t('admin.home.system.failedPayments', { count: String(fallos) })
            : t('admin.home.system.noAlerts'),
      },
    ];
  }, [panel.isSuccess, panel.isError, panel.data, t]);

  const municipalidad = activeTenant?.name ?? t('app.name');

  return (
    <AdminShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
        {/* --- encabezado (§3) ------------------------------------------------------------------ */}
        <header className="lx-shell-header-row" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0 }}>{municipalidad}</h1>
            <p className="lx-text-meta" style={{ margin: '4px 0 0' }}>
              {t('admin.home.subtitle', { date: formatDate(ahora, locale, { dateStyle: 'full' }) })}
            </p>
          </div>
          {/* La hora del reloj de quien mira, no una fecha escrita a mano. */}
          <p className="lx-text-meta" style={{ margin: 0, whiteSpace: 'nowrap' }}>
            {formatTime(ahora, locale)}
          </p>
        </header>

        {puedeVerCifras ? (
          <>
            {/* --- estado del sistema (§4) ------------------------------------------------------ */}
            <Card>
              <div className="lx-status-strip">
                {servicios.map((servicio) => (
                  <span key={servicio.clave} className="lx-status-strip__item">
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
            </Card>

            {/* --- los cuatro KPIs (§5) --------------------------------------------------------- */}
            <div className="lx-home-kpis">
              <StatCard
                label={t('admin.home.kpi.revenue')}
                value={
                  recaudacion ? dinero(recaudacion.totalMinor, recaudacion.currencyCode) : t('common.loading')
                }
                hint={
                  recaudacion?.variacion != null
                    ? t('admin.home.kpi.vsYesterday', {
                        delta: `${recaudacion.variacion > 0 ? '+' : ''}${recaudacion.variacion}%`,
                      })
                    : undefined
                }
              />
              <StatCard
                label={t('admin.home.kpi.activeSessions')}
                value={panel.data ? String(panel.data.occupancy.activeSessions) : t('common.loading')}
                hint={t('admin.home.kpi.rightNow')}
              />
              <StatCard
                label={t('admin.home.kpi.citations')}
                value={panel.data ? String(boletasHoy) : t('common.loading')}
              />
              <StatCard
                label={t('admin.home.kpi.occupancy')}
                value={
                  panel.data
                    ? ocupacion != null
                      ? `${ocupacion}%`
                      : t('admin.home.kpi.noBays')
                    : t('common.loading')
                }
                hint={panel.data && ocupacion == null ? t('admin.home.kpi.noBaysHint') : undefined}
              />
            </div>

            {/* --- analítica: 2/3 + 1/3 (§6, §7) ------------------------------------------------ */}
            <div className="lx-home-split">
              <Card>
                <SectionHeader
                  title={t('admin.home.revenue.title')}
                  description={t('admin.home.revenue.description')}
                />
                <BarChart
                  title={t('admin.home.revenue.title')}
                  data={barras}
                  loading={serie.isLoading}
                  loadingLabel={t('common.loading')}
                  emptyLabel={t('admin.home.revenue.empty')}
                  formatAxis={(valor) =>
                    dinero(Math.round(valor), serie.data?.currencyCode ?? 'CRC')
                  }
                  tableHeaders={{
                    label: t('admin.home.revenue.columnDay'),
                    value: t('admin.home.revenue.columnAmount'),
                  }}
                />
              </Card>

              <Card>
                <SectionHeader
                  title={t('admin.home.zones.title')}
                  description={t('admin.home.zones.description')}
                />
                <ZonesOccupancy
                  zones={panel.data?.occupancy.zones ?? []}
                  loading={panel.isLoading}
                  loadingLabel={t('common.loading')}
                  emptyLabel={t('admin.home.zones.empty')}
                  noBaysLabel={t('admin.home.zones.noBays')}
                />
              </Card>
            </div>

            {/* --- operación: 2/3 + 1/3 (§8, §9) ------------------------------------------------ */}
            <div className="lx-home-split">
              <Card>
                <SectionHeader
                  title={t('admin.home.activity.title')}
                  description={t('admin.home.activity.description')}
                />
                {actividad.isLoading ? (
                  <p className="lx-text-meta">{t('common.loading')}</p>
                ) : eventos.length === 0 ? (
                  <EmptyState
                    title={t('admin.home.activity.emptyTitle')}
                    description={t('admin.home.activity.emptyBody')}
                  />
                ) : (
                  <>
                    {eventos.map((evento) => (
                      <div key={evento.id} className="lx-activity-row">
                        <span>
                          <span className="lx-activity-row__what">{t(ACTOS[evento.action] as TranslationKey)}</span>
                          <br />
                          <span className="lx-activity-row__who">
                            {evento.actorName ?? t('admin.home.activity.system')}
                          </span>
                        </span>
                        <span className="lx-activity-row__when">
                          {formatRelativeTime(evento.occurredAt, locale, ahora) ??
                            formatDate(evento.occurredAt, locale)}
                        </span>
                      </div>
                    ))}
                    <p style={{ margin: 'var(--lx-space-3) 0 0' }}>
                      <Link to="/audit" className="lx-nav-link">
                        {t('admin.home.activity.seeAll')}
                      </Link>
                    </p>
                  </>
                )}
              </Card>

              <Card>
                <SectionHeader title={t('admin.home.quick.title')} />
                <QuickActions />
              </Card>
            </div>
          </>
        ) : (
          /* Sin `AUDIT_READ` no hay cifras que mostrar: el servidor las niega y ofrecerlas sería
             ofrecer un 403. Quedan los accesos, que llevan a lo que esta cuenta sí puede abrir. */
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
 * Una barra por zona, con el porcentaje escrito al lado.
 *
 * <p>El color del lleno dice severidad y no identidad: una zona al tope es una decisión operativa
 * distinta de una a la mitad. Y el porcentaje va SIEMPRE en texto: un tablero que informa por color
 * no le informa a quien no distingue el ámbar del rojo.</p>
 */
function ZonesOccupancy({
  zones,
  loading,
  loadingLabel,
  emptyLabel,
  noBaysLabel,
}: {
  zones: readonly { zoneId: string; code: string; name: string; activeSessions: number; baysInService: number; percent: number | null }[];
  loading: boolean;
  loadingLabel: string;
  emptyLabel: string;
  noBaysLabel: string;
}): React.JSX.Element {
  if (loading) return <p className="lx-text-meta">{loadingLabel}</p>;
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
        const tono = pct == null ? '' : pct >= OCUPACION_ALTA ? ' lx-zone-bar__fill--full' : pct >= OCUPACION_MEDIA ? ' lx-zone-bar__fill--warn' : '';
        return (
          <div key={zona.zoneId} className="lx-zone-bar">
            <span className="lx-zone-bar__name" title={zona.name}>
              {zona.name}
            </span>
            <span className="lx-zone-bar__value">{pct == null ? noBaysLabel : `${pct}%`}</span>
            <span className="lx-zone-bar__track">
              {/* Una zona sin bahías numeradas no tiene barra: no hay proporción que dibujar, y
                  pintarla en cero diría que está vacía. */}
              {pct == null ? null : (
                <span className={`lx-zone-bar__fill${tono}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Cuatro atajos a rutas que ya existen.
 *
 * <p>Cada uno aparece sólo si la cuenta tiene el permiso de la pantalla a la que lleva. Esconder el
 * botón no reemplaza la validación del servidor —que se vuelve a hacer— pero ofrecer un atajo que
 * termina en «no tiene permiso» es una promesa rota en la primera pantalla.</p>
 */
function QuickActions(): React.JSX.Element {
  const { t } = useTranslation();
  const permissions = usePermissions();

  const accesos: { to: string; title: TranslationKey; hint: TranslationKey; visible: boolean }[] = [
    {
      to: '/zones',
      title: 'admin.home.quick.zone',
      hint: 'admin.home.quick.zoneHint',
      visible: permissions.has('TENANT_MANAGE'),
    },
    {
      to: '/spaces',
      title: 'admin.home.quick.space',
      hint: 'admin.home.quick.spaceHint',
      visible: permissions.has('TENANT_MANAGE'),
    },
    {
      to: '/enforcement/citations',
      title: 'admin.home.quick.plate',
      hint: 'admin.home.quick.plateHint',
      visible: permissions.has('CITATION_READ'),
    },
    {
      to: '/reports',
      title: 'admin.home.quick.report',
      hint: 'admin.home.quick.reportHint',
      visible: permissions.has('EXPORT_RUN'),
    },
  ];

  const visibles = accesos.filter((acceso) => acceso.visible);
  if (visibles.length === 0) {
    return <p className="lx-text-meta">{t('admin.home.quick.none')}</p>;
  }

  return (
    <div className="lx-quick-actions">
      {visibles.map((acceso) => (
        <Link key={acceso.to} to={acceso.to} className="lx-quick-action">
          <span className="lx-quick-action__title">{t(acceso.title)}</span>
          <span className="lx-quick-action__hint">{t(acceso.hint)}</span>
        </Link>
      ))}
    </div>
  );
}
