import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import {
  useTranslation,
  formatCurrencyMinor,
  formatDateTime,
  formatNumber,
  type SupportedLocale,
  type TranslationKey,
} from '@luparx/i18n';
import { Alert, Button, Card, FormField, Input, SectionHeader, StatCard, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

/**
 * El panel de la municipalidad (CONTRACT.md v0.36; reordenado el 23-09-2026).
 *
 * <h2>«No solamente estadísticas bonitas»</h2>
 *
 * <p>Toda cifra de esta pantalla es un conteo de filas, y toda cifra es un <b>enlace a esas filas</b>,
 * ya filtradas. Acá no hay puntajes, índices ni tendencias trazadas entre tres puntos —la clase de
 * número que parece hallazgo y nadie puede comprobar—. Si una municipalidad lee 47 acá y no puede
 * llegar a los 47, el número es decoración.</p>
 *
 * <h2>Dos relojes, dichos en voz alta</h2>
 *
 * <p>La ocupación y las estadías vigentes son <b>ahora</b>; todo lo demás cubre el período. La
 * pantalla dice cuál es cuál al lado de cada bloque, porque un conteo en vivo junto a un total
 * mensual sin etiqueta es cómo alguien lee uno por el otro.</p>
 *
 * <h2>Qué cambió en el reordenamiento, y qué NO</h2>
 *
 * <p>No cambió ni una cifra, ni un cálculo, ni una llamada, ni un destino de navegación: lo que
 * cambió es que dejaron de ser once tarjetas de ancho completo apiladas en una página que había que
 * recorrer entera para saber cómo fue el mes. Ahora hay cuatro KPIs arriba, los módulos que
 * responden a la misma pregunta viven en la misma fila, y los vacíos ocupan un renglón en vez de
 * una tarjeta.</p>
 *
 * <p>El texto también se acortó. Lo que explicaba POR QUÉ un número se cuenta así —que sigue siendo
 * cierto y sigue importando— vive en los comentarios de este archivo y del servicio que lo calcula,
 * que es donde lo necesita quien lo va a tocar. Un panel municipal no es el lugar para argumentar.</p>
 */
export function DashboardPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();

  /**
   * Dos estados para las fechas: lo que está escrito y lo que se está consultando.
   *
   * <p>Antes eran uno solo, así que cada tecla en el campo de fecha disparaba una consulta —y al
   * escribir «2026» el navegador pasa por «0002», que es un rango de dos mil años—. Con «Aplicar»
   * de por medio, la consulta ocurre cuando la persona terminó de decidir.</p>
   */
  const [desdeBorrador, setDesdeBorrador] = useState('');
  const [hastaBorrador, setHastaBorrador] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  /** Los estados de estadía más allá del principal: plegados salvo que alguien los pida (§6). */
  const [verTodosLosEstados, setVerTodosLosEstados] = useState(false);

  const query = useQuery({
    queryKey: ['admin', 'dashboard', { from, to }],
    queryFn: () =>
      apiClient.adminDashboard.get({
        from: from ? startOfDay(from) : undefined,
        to: to ? startOfNextDay(to) : undefined,
      }),
    // Las cifras en vivo se ponen viejas mientras alguien las lee. Treinta segundos es seguido como
    // para que la ocupación sea de ahora y espaciado como para que una municipalidad con conexión
    // lenta no esté re-dibujando la pantalla bajo sus propias manos.
    refetchInterval: 30_000,
  });

  const data = query.data;
  const currency = data?.currencyCode ?? 'CRC';

  /** Toda cifra va a alguna parte. Es la diferencia entera entre consultar y mirar. */
  function open(path: string, params: Record<string, string | undefined> = {}): void {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    // El período viaja con el enlace, así que la lista abre mostrando el mismo que contó el número.
    if (from) search.set('from', from);
    if (to) search.set('to', to);
    const qs = search.toString();
    navigate(qs ? `${path}?${qs}` : path);
  }

  function aplicar(): void {
    setFrom(desdeBorrador);
    setTo(hastaBorrador);
  }

  /**
   * Los atajos de período.
   *
   * <p>Se aplican de una vez, sin pasar por «Aplicar»: un atajo ES la decisión tomada, y pedir un
   * segundo clic para confirmar lo que ya se eligió con uno sólo agrega un paso.</p>
   */
  function preset(dias: number | 'mes'): void {
    const hoy = new Date();
    const fin = iso(hoy);
    const inicio =
      dias === 'mes'
        ? iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
        : iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1)));
    setDesdeBorrador(inicio);
    setHastaBorrador(fin);
    setFrom(inicio);
    setTo(fin);
  }

  // --- KPIs (§3) ---------------------------------------------------------------------------------

  /**
   * Las estadías pagadas del período.
   *
   * <p>No es un cálculo nuevo: es la fila `PAID` de la misma agrupación que ya se mostraba debajo,
   * subida a la altura de los ojos. Si el servidor deja de mandarla, acá no hay nada que inventar
   * y se dice «Sin datos».</p>
   */
  const pagadas = useMemo(
    () => (data?.parking ?? []).find((fila) => fila.paymentStatus === 'PAID') ?? null,
    [data],
  );

  /**
   * La ocupación del cantón: estadías vigentes sobre bahías en servicio.
   *
   * <p>Es la misma división que ya hace la columna «Ocupación» de la tabla de abajo, agregada sobre
   * las zonas que tienen denominador. Una zona sin bahías numeradas no entra —no tiene con qué
   * medirse— y por eso el total puede no cuadrar con la suma de estadías vigentes, que sí las
   * incluye a todas.</p>
   */
  const ocupacion = useMemo(() => {
    const zonas = (data?.occupancy.zones ?? []).filter((zona) => zona.percent !== null);
    const activas = zonas.reduce((suma, zona) => suma + zona.activeSessions, 0);
    const bahias = zonas.reduce((suma, zona) => suma + zona.baysInService, 0);
    if (bahias === 0) return null;
    return { percent: Math.round((activas / bahias) * 100), activas, bahias };
  }, [data]);

  /** Cuántas boletas se levantaron en el período, en cualquier estado en que estén hoy. */
  const boletas = useMemo(
    () => (data?.citations ?? []).reduce((suma, fila) => suma + fila.count, 0),
    [data],
  );

  const sinDatos = t('admin.dashboard.noData');

  return (
    <AdminShell>
      {/* --- 1. título y filtros --------------------------------------------------------------- */}
      <h1>{t('admin.dashboard.title')}</h1>

      <Card>
        <div className="lx-period-filter">
          {/* Etiquetadas y visibles: dos campos con «dd/mm/aaaa» dentro obligan a deducir cuál es
              el inicio y cuál el fin, y quien deduce mal lee un período que no pidió. */}
          <FormField label={t('admin.audit.filter.from')}>
            {({ inputId }) => (
              <Input
                id={inputId}
                type="date"
                value={desdeBorrador}
                onChange={(e) => setDesdeBorrador(e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t('admin.audit.filter.to')}>
            {({ inputId }) => (
              <Input
                id={inputId}
                type="date"
                value={hastaBorrador}
                onChange={(e) => setHastaBorrador(e.target.value)}
              />
            )}
          </FormField>
          <Button type="button" onClick={aplicar}>
            {t('admin.dashboard.filters.apply')}
          </Button>
          <div className="lx-period-filter__presets">
            <Button type="button" variant="secondary" onClick={() => preset(1)}>
              {t('admin.dashboard.filters.preset.today')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => preset(7)}>
              {t('admin.dashboard.filters.preset.week')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => preset(30)}>
              {t('admin.dashboard.filters.preset.month')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => preset('mes')}>
              {t('admin.dashboard.filters.preset.thisMonth')}
            </Button>
          </div>
        </div>
        {data ? (
          <p className="lx-text-meta" style={{ margin: 'var(--lx-space-2) 0 0' }}>
            {t('admin.dashboard.window', {
              from: formatDateTime(data.from, locale),
              to: formatDateTime(data.to, locale),
            })}
          </p>
        ) : null}
      </Card>

      {query.isError ? <Alert tone="danger">{t('common.error.generic')}</Alert> : null}
      {!data ? (
        <p className="lx-text-meta">{t('common.loading')}</p>
      ) : (
        <>
          {/* --- 2. los cuatro KPIs ------------------------------------------------------------ */}
          <div className="lx-dashboard-kpis">
            <StatCard
              label={t('admin.dashboard.kpi.netRevenue')}
              value={
                <button type="button" className="lx-linklike lx-stat-link" onClick={() => open('/billing')}>
                  {formatCurrencyMinor(data.revenue.capturedNetMinor, currency, locale)}
                </button>
              }
              hint={t('admin.billing.totals.netHint')}
            />
            <StatCard
              label={t('admin.dashboard.kpi.paidStays')}
              value={pagadas ? formatNumber(pagadas.count, locale) : sinDatos}
              hint={
                pagadas ? formatCurrencyMinor(pagadas.totalMinor, currency, locale) : t('admin.dashboard.kpi.inPeriod')
              }
            />
            <StatCard
              label={t('admin.dashboard.kpi.occupancy')}
              value={ocupacion ? `${ocupacion.percent}%` : sinDatos}
              hint={
                ocupacion
                  ? t('admin.dashboard.occupancy.overBays', {
                      active: formatNumber(ocupacion.activas, locale),
                      bays: formatNumber(ocupacion.bahias, locale),
                    })
                  : t('admin.dashboard.kpi.rightNow')
              }
            />
            <StatCard
              label={t('admin.dashboard.kpi.citations')}
              value={
                <button
                  type="button"
                  className="lx-linklike lx-stat-link"
                  onClick={() => open('/enforcement/citations')}
                >
                  {formatNumber(boletas, locale)}
                </button>
              }
              hint={t('admin.dashboard.kpi.inPeriod')}
            />
          </div>

          {/* --- 3. finanzas: recaudación y billetera, lado a lado ----------------------------- */}
          <div className="lx-dashboard-split">
            <Card>
              <SectionHeader
                title={t('admin.dashboard.revenue.title')}
                description={t('admin.dashboard.revenue.description')}
              />
              <div className="lx-figure-row">
                <Figure
                  label={t('admin.dashboard.revenue.captured')}
                  value={formatCurrencyMinor(data.revenue.capturedGrossMinor, currency, locale)}
                  meta={t('admin.dashboard.revenue.capturedCount', { count: data.revenue.capturedCount })}
                  onOpen={() => open('/billing')}
                />
                <Figure
                  label={t('admin.dashboard.revenue.net')}
                  value={formatCurrencyMinor(data.revenue.capturedNetMinor, currency, locale)}
                  meta={t('admin.billing.totals.netHint')}
                />
                {/* Verde sólo cuando está en cero, que es el estado correcto; ámbar —no rojo— cuando
                    hay pendiente: lo que falta confirmar no es un error, es trabajo por hacer. */}
                <Figure
                  label={t('admin.dashboard.revenue.unsettled')}
                  value={formatCurrencyMinor(data.revenue.unsettledGrossMinor, currency, locale)}
                  tone={data.revenue.unsettledGrossMinor > 0 ? 'warning' : 'success'}
                  onOpen={() => open('/billing')}
                />
              </div>
            </Card>

            <Card>
              <SectionHeader
                title={t('admin.dashboard.transactions.title')}
                description={t('admin.dashboard.transactions.description')}
              />
              <GroupRow
                rows={data.transactions.map((row) => ({
                  key: row.type ?? row.labelKey,
                  label: t(row.labelKey as TranslationKey),
                  count: row.count,
                  // Con signo a propósito: un cargo es negativo en este libro.
                  money: formatCurrencyMinor(row.totalMinor, currency, locale),
                }))}
                emptyLabel={t('admin.dashboard.empty')}
                onOpen={() => open('/billing')}
                locale={locale}
              />
            </Card>
          </div>

          {/* --- estacionamientos: compacto, y el resto se despliega (§6) ---------------------- */}
          <Card>
            <SectionHeader
              title={t('admin.dashboard.parking.title')}
              description={t('admin.dashboard.parking.description')}
            />
            <GroupRow
              rows={(verTodosLosEstados || !pagadas ? data.parking : [pagadas]).map((row) => ({
                key: row.paymentStatus ?? row.labelKey,
                label: t(row.labelKey as TranslationKey),
                count: row.count,
                money: formatCurrencyMinor(row.totalMinor, currency, locale),
              }))}
              emptyLabel={t('admin.dashboard.empty')}
              locale={locale}
            />
            {/* El desplegable sólo aparece si hay algo escondido: un botón que no revela nada es
                una promesa vacía. */}
            {pagadas && data.parking.length > 1 ? (
              <p style={{ margin: 'var(--lx-space-2) 0 0' }}>
                <button
                  type="button"
                  className="lx-linklike"
                  onClick={() => setVerTodosLosEstados((actual) => !actual)}
                >
                  {t(
                    verTodosLosEstados
                      ? 'admin.dashboard.parking.collapse'
                      : 'admin.dashboard.parking.expand',
                  )}
                </button>
              </p>
            ) : null}
          </Card>

          {/* --- 4. operación: ocupación (2/3) + fiscalización y exoneraciones (1/3) ----------- */}
          <div className="lx-dashboard-split lx-dashboard-split--wide">
            <Card>
              <SectionHeader
                title={t('admin.dashboard.occupancy.title')}
                description={t('admin.dashboard.occupancy.description')}
              />
              {/* Dicho en voz alta, porque este bloque no cubre el período de arriba. */}
              <p className="lx-text-meta" style={{ margin: 0 }}>
                {t('admin.dashboard.occupancy.asOf', { time: formatDateTime(data.now, locale) })}
              </p>
              <p className="lx-dashboard-figure">
                {formatNumber(data.occupancy.activeSessions, locale)}{' '}
                <span className="lx-dashboard-figure__unit">{t('admin.dashboard.occupancy.active')}</span>
              </p>
              {data.occupancy.unzonedActive > 0 ? (
                // Reportadas, nunca escondidas: un carro parqueado en algún lado sigue siendo un
                // carro parqueado en algún lado.
                <p className="lx-text-meta" style={{ margin: 0 }}>
                  {t('admin.dashboard.occupancy.unzoned', { count: data.occupancy.unzonedActive })}
                </p>
              ) : null}
              <Table
                loadingLabel={t('common.loading')}
                emptyLabel={t('admin.dashboard.occupancy.noZones')}
                rows={data.occupancy.zones}
                rowKey={(row) => row.zoneId}
                columns={[
                  {
                    key: 'zone',
                    header: t('admin.dashboard.column.zone'),
                    render: (row) => (
                      <button type="button" className="lx-linklike" onClick={() => open('/zones')}>
                        {row.name} ({row.code})
                      </button>
                    ),
                  },
                  {
                    key: 'active',
                    header: t('admin.dashboard.column.active'),
                    render: (row) => formatNumber(row.activeSessions, locale),
                  },
                  {
                    key: 'bays',
                    header: t('admin.dashboard.column.bays'),
                    render: (row) => formatNumber(row.baysInService, locale),
                  },
                  {
                    key: 'percent',
                    header: t('admin.dashboard.column.occupancy'),
                    // Ausente no es cero. Una zona sin bahías numeradas lleva raya y su explicación,
                    // nunca «0%», que sería una cifra equivocada en vez de una que falta.
                    render: (row) =>
                      row.percent === null ? (
                        <span className="lx-text-meta" title={t('admin.dashboard.occupancy.noBays')}>
                          —
                        </span>
                      ) : (
                        // Barra Y número: el porcentaje se lee de un vistazo y además se puede
                        // leer exacto. La barra sola obligaría a estimar; el número solo obliga a
                        // comparar de memoria entre filas.
                        <span className="lx-occupancy-cell">
                          <span className="lx-occupancy-cell__track">
                            <span
                              className={
                                row.percent >= 90
                                  ? 'lx-occupancy-cell__fill lx-occupancy-cell__fill--full'
                                  : row.percent >= 70
                                    ? 'lx-occupancy-cell__fill lx-occupancy-cell__fill--warn'
                                    : 'lx-occupancy-cell__fill'
                              }
                              style={{ width: `${Math.min(row.percent, 100)}%` }}
                            />
                          </span>
                          <span className="lx-occupancy-cell__value">{row.percent}%</span>
                        </span>
                      ),
                  },
                ]}
              />
            </Card>

            <div className="lx-dashboard-stack">
              <Card>
                <SectionHeader
                  title={t('admin.dashboard.checks.title')}
                  description={t('admin.dashboard.checks.description')}
                />
                <GroupRow
                  rows={data.checks.map((row) => ({
                    key: row.verdict ?? row.labelKey,
                    label: t(row.labelKey as TranslationKey),
                    count: row.count,
                  }))}
                  emptyLabel={t('admin.dashboard.empty')}
                  onOpen={(key) => open('/enforcement/checks', { verdict: key })}
                  locale={locale}
                />
              </Card>

              <Card>
                <SectionHeader
                  title={t('admin.dashboard.exemptions.title')}
                  description={t('admin.dashboard.exemptions.description')}
                />
                <GroupRow
                  rows={data.exemptions.map((row) => ({
                    key: row.status ?? row.labelKey,
                    label: t(row.labelKey as TranslationKey),
                    count: row.count,
                  }))}
                  emptyLabel={t('admin.dashboard.empty')}
                  onOpen={(key) => open('/exemptions', { status: key })}
                  locale={locale}
                />
              </Card>
            </div>
          </div>

          {/* --- 5. infracciones: una fila de fichas, con cantidad y monto --------------------- */}
          <Card>
            <SectionHeader
              title={t('admin.dashboard.citations.title')}
              description={t('admin.dashboard.citations.description')}
            />
            {data.citations.length === 0 ? (
              <p className="lx-text-meta">{t('admin.dashboard.empty')}</p>
            ) : (
              <div className="lx-chip-row">
                {data.citations.map((row) => (
                  <button
                    key={row.status ?? row.labelKey}
                    type="button"
                    className="lx-stat-chip"
                    onClick={() => open('/enforcement/citations', { status: row.status })}
                  >
                    <span className="lx-stat-chip__label">{t(row.labelKey as TranslationKey)}</span>
                    <span className="lx-stat-chip__value">{formatNumber(row.count, locale)}</span>
                    <span className="lx-stat-chip__money">
                      {formatCurrencyMinor(row.totalMinor, currency, locale)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* --- 6. actividad por inspector ---------------------------------------------------- */}
          <Card>
            <SectionHeader
              title={t('admin.dashboard.inspectors.title')}
              description={t('admin.dashboard.inspectors.description')}
            />
            <Table
              loadingLabel={t('common.loading')}
              emptyLabel={t('admin.dashboard.inspectors.none')}
              rows={data.inspectors}
              rowKey={(row) => row.inspectorUserId}
              columns={[
                {
                  key: 'name',
                  header: t('admin.audit.column.actor'),
                  render: (row) => (
                    <button
                      type="button"
                      className="lx-linklike"
                      onClick={() => open('/enforcement/checks', { inspectorUserId: row.inspectorUserId })}
                    >
                      {row.name ?? row.inspectorUserId.slice(0, 8)}
                    </button>
                  ),
                },
                {
                  key: 'checks',
                  header: t('admin.dashboard.column.checks'),
                  render: (row) => formatNumber(row.checks, locale),
                },
                {
                  key: 'citations',
                  header: t('admin.dashboard.column.citations'),
                  render: (row) => formatNumber(row.citations, locale),
                },
                {
                  key: 'last',
                  header: t('admin.dashboard.column.lastCheck'),
                  render: (row) => (row.lastCheckAt ? formatDateTime(row.lastCheckAt, locale) : '—'),
                },
              ]}
            />
            {/* Los dos números juntos son una pregunta; por separado no dicen nada. Se deja escrito
                en una línea, sin el párrafo que antes explicaba de qué podría acusarse a quién. */}
            {data.inspectors.length > 0 ? (
              <p className="lx-text-meta" style={{ margin: 'var(--lx-space-2) 0 0' }}>
                {t('admin.dashboard.inspectors.notice')}
              </p>
            ) : null}
          </Card>

          {/* --- 7. fallos de pago: una línea cuando no hay ------------------------------------ */}
          <Card>
            <SectionHeader
              title={t('admin.dashboard.failures.title')}
              description={t('admin.dashboard.failures.description')}
            />
            {data.paymentFailures.count === 0 ? (
              <p className="lx-text-meta" style={{ margin: 0 }}>
                <span className="lx-status-strip__dot lx-status-strip__dot--ok" aria-hidden="true" />{' '}
                {t('admin.dashboard.failures.none')}
              </p>
            ) : (
              <>
                <p className="lx-dashboard-figure">
                  {formatNumber(data.paymentFailures.count, locale)}{' '}
                  <span className="lx-dashboard-figure__unit">
                    {t('admin.dashboard.failures.count', {
                      amount: formatCurrencyMinor(data.paymentFailures.amountMinor, currency, locale),
                    })}
                  </span>
                </p>
                <Table
                  loadingLabel={t('common.loading')}
                  emptyLabel={t('admin.dashboard.empty')}
                  rows={data.paymentFailures.byReason}
                  rowKey={(row) => `${row.code}-${row.reason}`}
                  columns={[
                    { key: 'code', header: t('admin.dashboard.column.code'), render: (row) => row.code },
                    { key: 'reason', header: t('admin.dashboard.column.reason'), render: (row) => row.reason || '—' },
                    {
                      key: 'count',
                      header: t('admin.dashboard.column.attempts'),
                      render: (row) => formatNumber(row.count, locale),
                    },
                    {
                      key: 'amount',
                      header: t('admin.billing.column.gross'),
                      render: (row) => formatCurrencyMinor(row.amountMinor, currency, locale),
                    },
                  ]}
                />
              </>
            )}
          </Card>
        </>
      )}
    </AdminShell>
  );
}

/** `YYYY-MM-DD` del calendario de quien mira, que es el que escriben los campos de fecha. */
function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * A row of counts, each one a door.
 *
 * <p>When {@code onOpen} is given every count becomes a button carrying its own enumerated value, so
 * the list it opens is filtered by exactly what the number counted. Without it the counts render as
 * plain text — used where there is no screen listing those rows yet, which is honest: a link that
 * went nowhere useful would be worse than none.</p>
 */
function GroupRow({
  rows,
  emptyLabel,
  onOpen,
  locale,
}: {
  rows: { key: string; label: string; count: number; money?: string }[];
  emptyLabel: string;
  onOpen?: (key: string) => void;
  locale: SupportedLocale;
}): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="lx-text-meta">{emptyLabel}</p>;
  }
  return (
    <div style={{ display: 'flex', gap: 'var(--lx-space-4)', flexWrap: 'wrap' }}>
      {rows.map((row) => (
        <div key={row.key} style={{ minWidth: 150 }}>
          <p className="lx-text-meta" style={{ margin: 0 }}>
            {row.label}
          </p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {onOpen ? (
              <button type="button" className="lx-linklike" onClick={() => onOpen(row.key)}>
                {formatNumber(row.count, locale)}
              </button>
            ) : (
              formatNumber(row.count, locale)
            )}
          </p>
          {row.money ? (
            <p className="lx-text-meta" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {row.money}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** One figure, big enough to read across a desk, and clickable when there is somewhere to go. */
function Figure({
  label,
  value,
  meta,
  tone,
  onOpen,
}: {
  label: string;
  value: string;
  meta?: string;
  /**
   * `warning` y no `danger` para lo que está pendiente: la §4 pide verde para lo correcto y ámbar
   * o rojo para lo pendiente «según semántica». Plata que un proveedor todavía no confirmó es
   * trabajo por hacer, no un fallo, y pintarla de rojo hace que se deje de mirar el rojo.
   */
  tone?: 'danger' | 'warning' | 'success';
  onOpen?: () => void;
}): React.JSX.Element {
  return (
    <div style={{ minWidth: 180 }}>
      <p className="lx-text-meta" style={{ margin: 0 }}>
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 26,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color:
            tone === 'danger'
              ? 'var(--lx-danger)'
              : tone === 'warning'
                ? 'var(--lx-warning)'
                : tone === 'success'
                  ? 'var(--lx-success)'
                  : undefined,
        }}
      >
        {onOpen ? (
          <button type="button" className="lx-linklike" style={{ font: 'inherit', color: 'inherit' }} onClick={onOpen}>
            {value}
          </button>
        ) : (
          value
        )}
      </p>
      {meta ? (
        <p className="lx-text-meta" style={{ margin: 0 }}>
          {meta}
        </p>
      ) : null}
    </div>
  );
}

/** Local midnight, written out for the same reason as on the audit screen (v0.33). */
function startOfDay(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString();
}

function startOfNextDay(date: string): string {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
}
