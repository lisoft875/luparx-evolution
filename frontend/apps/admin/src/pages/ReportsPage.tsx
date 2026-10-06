import * as React from 'react';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import type { RegisteredUsersGroupBy } from '@luparx/api-client';
import { Button, FormField, Select, Table } from '@luparx/ui';
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
  const [from] = useState(instanteDiasAtras(365));
  const [to] = useState(instanteDiasAtras(0));

  const query = useQuery({
    queryKey: ['admin', 'reports', 'registered-users', { from, to, groupBy }],
    queryFn: () => apiClient.adminReports.registeredUsers({ from, to, groupBy }),
  });

  const exportMutation = useMutation({
    // TODO(extension): v0.1 exports are synchronous CSV (<=10k rows, CONTRACT.md §4); poll `exportId` once async exports ship.
    mutationFn: () => apiClient.adminExports.create({ type: 'registered-users', filters: { from, to, groupBy } }),
  });

  return (
    <AdminShell>
      <h1>{t('admin.reports.registeredUsers.title')}</h1>
      {/* El período que el reporte cubre, escrito.
          Era invisible —`from`/`to` son fijos, los últimos doce meses, y no hay control para
          cambiarlos— mientras el mensaje de vacío hablaba de «el rango seleccionado». Quien leía eso
          buscaba un selector de rango que no existe. Se dice el período y se deja de prometer un
          filtro. */}
      <p className="lx-text-meta">
        {t('admin.reports.registeredUsers.period', { from: diaDe(from), to: diaDe(to) })}
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
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
        <Button type="button" variant="secondary" onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>
          {t('admin.reports.registeredUsers.export')}
        </Button>
      </div>
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
    </AdminShell>
  );
}
