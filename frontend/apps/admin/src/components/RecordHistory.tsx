import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDateTime } from '@luparx/i18n';
import { Badge, Skeleton, Table } from '@luparx/ui';

/**
 * Quién cambió este registro, cuándo, y de qué valor a qué valor.
 *
 * <h2>Por qué es un componente y no una sección de una pantalla</h2>
 *
 * La §4 de la guía funcional (24-09-2026) pide esto para «registros sensibles»: tarifas, zonas,
 * política de parqueo, boletas, reclamos. Son cinco pantallas distintas con cinco formas distintas
 * de listar, y la pregunta es la misma en las cinco. Escrita una vez, la sexta sale gratis; escrita
 * cinco veces, la sexta sale mal.
 *
 * <h2>De dónde salen los datos</h2>
 *
 * De la bitácora que ya existía. Cada escritura de `AdminParkingController` y sus vecinos ya
 * registraba `resourceType`, `resourceId` y los cambios campo por campo con valor anterior y nuevo;
 * lo único que faltaba era poder preguntarlo por registro en vez de por fecha. Acá no se guarda
 * nada nuevo ni se calcula nada: se lee.
 *
 * <h2>El motivo</h2>
 *
 * Sale de `metadata.reason` cuando la escritura lo haya guardado, y se muestra sólo si está. Hoy
 * ninguna escritura lo guarda todavía —capturarlo es parte de la §5, que tiene decisiones
 * pendientes con Javier— así que la columna aparece vacía y **eso es lo correcto**: una columna
 * «Motivo» rellenada con la acción o con un guion diría que hubo una razón registrada donde no la
 * hubo.
 */
export function RecordHistory({
  resourceType,
  resourceId,
  emptyLabel,
}: {
  resourceType: string;
  /** Sin registro seleccionado no se consulta nada. */
  resourceId: string | null;
  emptyLabel?: string;
}): React.JSX.Element | null {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();

  const query = useQuery({
    queryKey: ['admin', 'audit-events', 'by-resource', resourceType, resourceId],
    queryFn: () => apiClient.adminAudit.byResource(resourceType, resourceId as string),
    enabled: resourceId !== null,
  });

  if (resourceId === null) return null;

  if (query.isLoading) {
    return (
      <>
        <Skeleton height="2rem" />
        <Skeleton height="2rem" />
      </>
    );
  }

  const eventos = query.data ?? [];

  return (
    <Table
      loadingLabel={t('common.loading')}
      emptyLabel={emptyLabel ?? t('admin.history.empty')}
      rows={eventos}
      rowKey={(evento) => evento.id}
      columns={[
        {
          key: 'when',
          header: t('admin.history.column.when'),
          render: (evento) => formatDateTime(evento.occurredAt, locale),
        },
        {
          key: 'who',
          header: t('admin.history.column.who'),
          // Sin nombre resuelto no es «desconocido»: o fue una tarea programada, o fue alguien que
          // ya no está en el directorio. El backend distingue los dos y acá se respeta.
          render: (evento) =>
            evento.actorUserId === null ? (
              <span className="lx-text-meta">{t('admin.history.system')}</span>
            ) : (
              <>
                {evento.actorName ?? evento.actorUserId.slice(0, 8)}
                {evento.actorActive === false ? (
                  <>
                    {' '}
                    <Badge tone="warning">{t('admin.history.inactive')}</Badge>
                  </>
                ) : null}
              </>
            ),
        },
        {
          key: 'what',
          header: t('admin.history.column.what'),
          render: (evento) => <code>{evento.action}</code>,
        },
        {
          key: 'changes',
          header: t('admin.history.column.changes'),
          render: (evento) =>
            (evento.changes ?? []).length === 0 ? (
              <span className="lx-text-meta">—</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1em' }}>
                {(evento.changes ?? []).map((cambio) => (
                  <li key={cambio.field}>
                    <strong>{cambio.field}</strong>:{' '}
                    {/* Un campo enmascarado se dice enmascarado. Mostrar el valor «porque es
                        auditoría» es exactamente cómo un dato sensible termina en una pantalla que
                        media oficina puede abrir. */}
                    {cambio.masked ? (
                      <span className="lx-text-meta">{t('admin.history.masked')}</span>
                    ) : (
                      <>
                        <span className="lx-text-meta">{cambio.oldValue ?? '∅'}</span>
                        {' → '}
                        <span>{cambio.newValue ?? '∅'}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ),
        },
        {
          key: 'reason',
          header: t('admin.history.column.reason'),
          render: (evento) => {
            const motivo = evento.metadata?.reason;
            return typeof motivo === 'string' && motivo.trim() !== '' ? (
              motivo
            ) : (
              <span className="lx-text-meta">—</span>
            );
          },
        },
      ]}
    />
  );
}
