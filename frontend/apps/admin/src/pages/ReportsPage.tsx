import * as React from 'react';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import type { RegisteredUsersGroupBy } from '@luparx/api-client';
import { Alert, Button, FormField, Input, Select, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

/**
 * Las agrupaciones que ESTE servidor implementa (06-10-2026).
 *
 * <p>Había cuatro y sólo una funciona. `tenant` no tiene sentido acá —una municipalidad sólo se ve
 * a sí misma, así que agrupar por municipalidad da una fila— y `month` y `district` contestan 501
 * con un comentario que explica que necesitan una proyección dedicada. El desplegable ofrecía las
 * cuatro y arrancaba en `tenant`, con lo cual la pantalla pedía 400 al abrirse y mostraba un
 * informe vacío sin decir por qué.</p>
 */
const GROUP_BY_OPTIONS: RegisteredUsersGroupBy[] = ['portal'];

/**
 * Los reportes que el servidor expone HOY.
 *
 * <p>La guía del 06-10-2026 pide dejar la pantalla preparada para crecer «sin inventar datos», y
 * ésa es la línea exacta: la arquitectura admite varios tipos y la lista tiene los que de verdad
 * responden. Agregar aquí «Recaudación» antes de que exista el endpoint no prepara nada — produce
 * una opción que al elegirla no hace nada, que es peor que una opción que no está.</p>
 *
 * <p>Para sumar uno: su clave acá, su etiqueta en `admin.reports.type.<clave>`, y la consulta en el
 * `switch` de abajo. Nada más.</p>
 */
const REPORTES = ['registered-users'] as const;
type ClaveDeReporte = (typeof REPORTES)[number];

/** `YYYY-MM-DD` → instante del comienzo de ese día, que es lo que el servidor lee. */
function comienzoDe(dia: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const fecha = new Date(`${dia}T00:00:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

/**
 * El extremo de la ventana, como INSTANTE completo.
 *
 * <p>Devolvía `2026-10-06` por un `slice(0, 10)`, y el servidor lee estos dos parámetros como
 * `Instant`: una fecha sin hora no se puede convertir, así que Spring rechazaba la petición con 400
 * antes de mirar nada más. Ése era el primero de los dos 400 que la consola del admin venía
 * imprimiendo sin decir de qué recurso.</p>
 */
function instanteDiasAtras(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

/** Y la fecha suelta, para enseñársela a quien mira: un instante completo no se lee. */
function diaDe(instante: string): string {
  return instante.slice(0, 10);
}

export function ReportsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  // `portal` y no `tenant`: es la única que este servidor implementa, y pedir `tenant` era el
  // segundo 400 que la pantalla se comía al abrirse.
  const [groupBy, setGroupBy] = useState<RegisteredUsersGroupBy>('portal');
  const [tipo, setTipo] = useState<ClaveDeReporte>('registered-users');
  // El rango ahora se elige. Era fijo —los últimos doce meses— y la pantalla hablaba de «el rango
  // seleccionado» sin ofrecer dónde seleccionarlo.
  const [desde, setDesde] = useState(diaDe(instanteDiasAtras(365)));
  const [hasta, setHasta] = useState(diaDe(instanteDiasAtras(0)));

  const from = comienzoDe(desde);
  const to = comienzoDe(hasta);
  const rangoInvalido = from === null || to === null || from >= to;

  const query = useQuery({
    queryKey: ['admin', 'reports', tipo, { from, to, groupBy }],
    // `enabled`: con un rango al revés no se pregunta. Una petición que el servidor va a rechazar
    // gasta un viaje y vuelve con un error genérico en vez del mensaje que explica qué corregir.
    enabled: !rangoInvalido,
    queryFn: () => apiClient.adminReports.registeredUsers({ from: from as string, to: to as string, groupBy }),
  });

  const exportMutation = useMutation({
    // TODO(extension): v0.1 exports are synchronous CSV (<=10k rows, CONTRACT.md §4); poll `exportId` once async exports ship.
    mutationFn: () => apiClient.adminExports.create({ type: tipo, filters: { from, to, groupBy } }),
  });

  return (
    <AdminShell>
      <h1>{t('admin.reports.title')}</h1>
      <p className="lx-text-meta">{t('admin.reports.subtitle')}</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        {/* El tipo de reporte. Hoy hay uno, y el selector existe igual: es la diferencia entre una
            pantalla que muestra un reporte y una que es el módulo de reportes. */}
        <div style={{ minWidth: 240 }}>
          <FormField label={t('admin.reports.typeLabel')}>
            {({ inputId }) => (
              <Select
                id={inputId}
                aria-label={t('admin.reports.typeLabel')}
                value={tipo}
                onChange={(value) => setTipo(value as ClaveDeReporte)}
                options={REPORTES.map((clave) => ({
                  value: clave,
                  label: t(`admin.reports.type.${clave}` as TranslationKey),
                }))}
              />
            )}
          </FormField>
        </div>
        <FormField label={t('admin.reports.fromLabel')}>
          {({ inputId }) => (
            <Input id={inputId} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          )}
        </FormField>
        <FormField label={t('admin.reports.toLabel')}>
          {({ inputId }) => (
            <Input id={inputId} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          )}
        </FormField>
        {/* Con etiqueta visible y no sólo `aria-label`: sin ella, un desplegable que dice
            «Municipalidad» junto al título «Usuarios registrados» se lee como un selector de
            reportes, y las cuatro opciones parecen cuatro reportes distintos. Son agrupaciones de
            este mismo reporte. */}
        <div style={{ minWidth: 240 }}>
          <FormField label={t('admin.reports.registeredUsers.groupByLabel')}>
            {({ inputId }) => (
              <Select
                id={inputId}
                aria-label={t('admin.reports.registeredUsers.groupByLabel')}
                value={groupBy}
                onChange={(value) => setGroupBy(value as RegisteredUsersGroupBy)}
                options={GROUP_BY_OPTIONS.map((option) => ({
                  value: option,
                  label: t(`admin.reports.registeredUsers.groupBy.${option}` as TranslationKey),
                }))}
              />
            )}
          </FormField>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={rangoInvalido}
          onClick={() => exportMutation.mutate()}
          loading={exportMutation.isPending}
        >
          {t('admin.reports.registeredUsers.export')}
        </Button>
      </div>
      {rangoInvalido ? <Alert tone="danger">{t('admin.reports.rangeInvalid')}</Alert> : null}
      {/* `rows={query.data?.rows}`: el servidor devuelve `{ groupBy, rows }`, no una lista. El
          cliente lo declaraba como lista y la tabla hacía `.map` sobre un objeto. */}
      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.reports.registeredUsers.empty')}
        rows={query.data?.rows ?? []}
        rowKey={(row) => row.group}
        columns={[
          { key: 'group', header: t('admin.reports.registeredUsers.column.group'), render: (row) => row.group },
          { key: 'count', header: t('admin.reports.registeredUsers.column.count'), render: (row) => row.count },
        ]}
      />
      {/* Lo que falta, dicho como lo que es: una lista de reportes que no existen todavía, no una
          promesa de que están. */}
      <p className="lx-text-meta" style={{ marginTop: 'var(--lx-space-4)' }}>
        {t('admin.reports.comingSoon')}
      </p>
    </AdminShell>
  );
}
