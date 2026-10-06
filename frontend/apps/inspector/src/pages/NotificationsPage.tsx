import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification } from '@luparx/api-client';
import { formatDateTime, roleLabel, useTranslation, type TranslationKey } from '@luparx/i18n';
import { Alert, Button, Card, EmptyState, IconBell, IconCheck, IconFine, IconList, ListRow, Pagination } from '@luparx/ui';
import { InspectorShell } from '../components/InspectorShell';
import {
  useCitationQueue,
  useInspectorNotifications,
  useInspectorUnreadCount,
  useMarkAllInspectorNotificationsRead,
  useMarkInspectorNotificationRead,
} from '../lib/queries';

const PAGE_SIZE = 20;

/**
 * A dónde lleva un aviso.
 *
 * <p>Se deriva de `subjectType` y no de una URL que mande el servidor: las rutas son asunto del
 * cliente, y una API que las enviara habría que redesplegarla para mover una pantalla. Un sujeto sin
 * pantalla propia devuelve null y la fila simplemente no navega — que es honesto, y mejor que una fila
 * que parece pulsable y no lleva a ninguna parte.</p>
 *
 * <p>`MEMBERSHIP` no navega a propósito: el puesto de alguien no tiene pantalla en el portal del
 * fiscalizador, y no debería tenerla — eso se administra desde el panel de Funcionarios, que es de
 * otra persona. El aviso se lee y se queda.</p>
 */
function rutaDe(aviso: AppNotification): string | null {
  switch (aviso.subjectType) {
    case 'CITATION':
      return `/citations/${aviso.subjectId}`;
    default:
      return null;
  }
}

/** El icono según de qué habla. Discreto y del mismo juego que el resto. */
function iconoDe(aviso: AppNotification): React.JSX.Element {
  return aviso.subjectType === 'CITATION' ? <IconFine /> : <IconList />;
}

/**
 * Los avisos de trabajo del fiscalizador.
 *
 * <h2>El texto se arma acá</h2>
 *
 * <p>El servidor manda un `type` estable y unos `params` crudos: un número de boleta, una placa, un
 * rol como nombre de enum. La frase se arma en esta pantalla, con el diccionario de esta aplicación y
 * el idioma de quien lee — que es lo que hace que un historial escrito en español se lea en inglés el
 * día que alguien cambie de idioma.</p>
 *
 * <h2>La cola sin conexión va arriba, y no es una notificación</h2>
 *
 * <p>Las boletas que no han salido del teléfono no están en la tabla de notificaciones y no pueden
 * estarlo: son boletas que el servidor todavía no conoce, así que una fila en la base diciendo que
 * existen sería una contradicción. Viven en el aparato, las cuenta el cliente, y van primero porque de
 * todo lo que esta pantalla muestra son lo único que depende de que alguien haga algo.</p>
 *
 * <p>Sí, el número también está en la pestaña «Pendientes». Esto no lo reemplaza: la pestaña es el
 * sitio donde se trabajan y ésta es la lista de lo que requiere atención, así que lo correcto es que
 * aparezca en las dos y que de acá se pueda ir allá.</p>
 */
export function NotificationsPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);

  const query = useInspectorNotifications(page, PAGE_SIZE);
  const unreadQuery = useInspectorUnreadCount();
  const markRead = useMarkInspectorNotificationRead();
  const markAllRead = useMarkAllInspectorNotificationsRead();
  const { pending } = useCitationQueue();

  // El total de no leídos, no los de ESTA página: «marcar todos» actúa sobre todo, así que contar los
  // visibles dejaría el botón apagado en la página 2 habiendo pendientes en la 1.
  const sinLeer = unreadQuery.data?.unread ?? 0;

  /**
   * Una línea, en el idioma de quien lee.
   *
   * <p>Cada parámetro se formatea acá en vez de interpolarse crudo. El rol pasa por `roleLabel`, que
   * es la misma fuente que usa el resto de la aplicación desde la Fase 1: sin eso el aviso diría «tu
   * rol cambió de INSPECTOR a INSPECTOR_LEAD», que es exactamente el defecto que esa fase vino a
   * quitar de la pantalla de Usuarios.</p>
   */
  function describir(aviso: AppNotification): string {
    const params = aviso.params ?? {};
    const zoneCount = typeof params.zoneCount === 'number' ? params.zoneCount : null;
    if (aviso.type === 'POST_ZONES_CHANGED') {
      // Cero sectores no es «ninguno»: es sin restricción, o sea todos. La misma verdad que la
      // columna Sectores del panel de Funcionarios.
      if (zoneCount === 0) return t('notification.type.POST_ZONES_CHANGED.all');
      return tPlural('notification.type.POST_ZONES_CHANGED', zoneCount ?? 0);
    }
    return t(`notification.type.${aviso.type}` as TranslationKey, {
      citationNumber: typeof params.citationNumber === 'string' ? params.citationNumber : '',
      plate: typeof params.plate === 'string' ? params.plate : '',
      previousRole: typeof params.previousRole === 'string' ? roleLabel(t, params.previousRole) : '',
      role: typeof params.role === 'string' ? roleLabel(t, params.role) : '',
    });
  }

  /** El motivo, cuando lo hubo. Segunda línea y no parte de la frase: no siempre existe. */
  function motivoDe(aviso: AppNotification): string | null {
    const reason = (aviso.params ?? {}).reason;
    if (typeof reason !== 'string' || reason.trim() === '') return null;
    const clave = `notification.type.${aviso.type}.reason` as TranslationKey;
    const texto = t(clave, { reason });
    return texto === clave ? reason : texto;
  }

  function abrir(aviso: AppNotification): void {
    // Se marca al salir y sin esperar: quien pulsa pidió ver la cosa, no esperar una anotación. Si
    // falla, la fila queda sin leer, que es el lado inofensivo del error.
    if (!aviso.readAt) {
      markRead.mutate(aviso.id);
    }
    const ruta = rutaDe(aviso);
    if (ruta) navigate(ruta);
  }

  const avisos = query.data?.items ?? [];

  return (
    <InspectorShell
      title={t('inspector.notifications.title')}
      subtitle={t('inspector.notifications.subtitle')}
      onBack={() => navigate('/')}
    >
      {/* Lo único que depende de que alguien haga algo, primero. */}
      {pending > 0 ? (
        <Card>
          <ListRow
            icon={<IconCheck size={18} />}
            title={t('inspector.notifications.queue.title')}
            meta={tPlural('inspector.notifications.queue', pending)}
            value={<Button type="button" variant="secondary" onClick={() => navigate('/queue')}>
              {t('inspector.notifications.queue.action')}
            </Button>}
          />
        </Card>
      ) : null}

      {/*
        Se OCULTA cuando no hay nada que marcar, en vez de quedarse gris: un botón deshabilitado
        invita a pulsarlo y no explica por qué no responde. Mientras el conteo viene en camino tampoco
        se muestra — aparecer y desaparecer es peor que aparecer un instante después.
      */}
      {sinLeer > 0 ? (
        <Button
          type="button"
          variant="secondary"
          loading={markAllRead.isPending}
          onClick={() => markAllRead.mutate()}
        >
          {t('inspector.notifications.markAllRead')}
        </Button>
      ) : null}

      {query.isError ? <Alert tone="danger">{t('common.error.generic')}</Alert> : null}

      {query.isLoading ? <p className="lx-text-meta">{t('common.loading')}</p> : null}

      {!query.isLoading && avisos.length === 0 ? (
        <EmptyState
          icon={<IconBell />}
          title={t('inspector.notifications.empty.title')}
          description={t('inspector.notifications.empty.description')}
        />
      ) : null}

      {avisos.length > 0 ? (
        <Card>
          {avisos.map((aviso) => {
            const motivo = motivoDe(aviso);
            return (
              <ListRow
                key={aviso.id}
                icon={iconoDe(aviso)}
                title={describir(aviso)}
                meta={[motivo, formatDateTime(aviso.createdAt, locale)].filter(Boolean).join(' · ')}
                // Sin leer se dice con una palabra además del peso: un punto de color solo no se lee
                // en voz alta ni se imprime.
                value={!aviso.readAt ? <span className="lx-badge lx-badge--info">{t('inspector.notifications.unread')}</span> : undefined}
                onClick={rutaDe(aviso) || !aviso.readAt ? () => abrir(aviso) : undefined}
              />
            );
          })}
        </Card>
      ) : null}

      {query.data ? (
        <Pagination
          page={query.data.page}
          size={query.data.size}
          totalPages={query.data.totalPages}
          totalElements={query.data.totalElements}
          onPageChange={setPage}
          previousLabel={t('pagination.previous')}
          nextLabel={t('pagination.next')}
          pageLabel={t('pagination.page')}
          ofLabel={t('pagination.of')}
          resultCountLabel={t('pagination.resultCount.other', { count: query.data.totalElements })}
        />
      ) : null}
    </InspectorShell>
  );
}
