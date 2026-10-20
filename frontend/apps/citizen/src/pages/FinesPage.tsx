import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { citationStatusKey, citationStatusTone } from '@luparx/features';
import { formatDate, useTranslation } from '@luparx/i18n';
import {
  Alert,
  AmountText,
  Badge,
  Card,
  ChipGroup,
  EmptyState,
  IconCheck,
  IconChevronRight,
  IconFine,
  IconHelp,
  ListRow,
  Pagination,
} from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { QueryBoundary } from '../components/QueryBoundary';
import { useFines } from '../lib/queries';
import { estaAbierta } from '../lib/fineStatus';

type FinesTab = 'pending' | 'history';

const PAGE_SIZE = 20;

/**
 * The citizen's fines, as the server actually holds them.
 *
 * Qué cuenta como «abierta» vive en `../lib/fineStatus`, junto al criterio de «por pagar» que usa
 * la tarjeta del Inicio. Estaban separados y el Inicio ni siquiera consultaba: afirmaba «Ninguna»
 * a mano. Dos pantallas que contestan la misma pregunta comparten el código que la contesta.
 *
 * El filtrado se hace sobre la página que devolvió el servidor y no pidiendo dos páginas filtradas:
 * `GET /citizen/fines` recibe un `status`, no un conjunto, y paginar dos listas que deben coincidir
 * en un total es peor problema que partir veinte filas del lado del cliente.
 */

export function FinesPage(): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<FinesTab>('pending');
  const [page, setPage] = useState(0);
  const query = useFines(page, PAGE_SIZE);
  const totalPages = query.data?.totalPages ?? 1;
  const total = query.data?.totalElements ?? 0;

  const rows = useMemo(() => {
    const items = query.data?.items ?? [];
    return items.filter((fine) =>
      tab === 'pending' ? estaAbierta(fine) : !estaAbierta(fine),
    );
  }, [query.data, tab]);

  return (
    <CitizenShell bare heading={<h1 className="lx-text-screen-title">{t('citizen.fines.title')}</h1>}>
      <ChipGroup
        variant="segmented"
        aria-label={t('citizen.fines.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: t('citizen.fines.tab.pending') },
          { value: 'history', label: t('citizen.fines.tab.history') },
        ]}
      />
      {/*
        El aviso del boceto: cuántas multas hay sin pagar y por qué conviene no dejarlas.

        Es sólo lo que la lista de abajo ya dice, dicho antes y con el tono que corresponde —una
        multa vencida cuesta más—. No agrega ninguna acción nueva: pagar sigue estando donde
        estaba, en el detalle de cada multa, y un botón de pago acá tendría que elegir cuál pagar
        cuando hay varias. En el historial no sale: ahí no hay nada pendiente que avisar.
      */}
      {tab === 'pending' && rows.length > 0 ? (
        <Alert tone="warning">
          {tPlural('citizen.fines.pendingWarning', rows.length)}
        </Alert>
      ) : null}
      <QueryBoundary query={query} errorTitle={t('citizen.fines.title')}>
        {() =>
          rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={<IconCheck size={28} />}
                tone="success"
                title={t('citizen.fines.empty.title')}
                description={
                  tab === 'pending' ? t('citizen.fines.empty.description') : t('citizen.fines.empty.history')
                }
              />
            </Card>
          ) : (
            <>
              <Card>
                {rows.map((fine) => (
                  <ListRow
                    key={fine.id}
                    icon={<IconFine size={18} />}
                    title={
                      <span
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}
                      >
                        <span>{fine.infractionName}</span>
                        <Badge tone={citationStatusTone(fine.status)}>{t(citationStatusKey(fine.status))}</Badge>
                      </span>
                    }
                    /*
                      El número de boleta va primero, como en el boceto: es lo que una persona
                      dicta por teléfono, escribe en un reclamo o busca en un correo. Viene del
                      servidor (`number`) y puede faltar —una boleta sin emitir todavía no lo
                      tiene—, así que se omite en vez de inventar uno.

                      La miniatura de la foto que muestra el boceto NO se puede poner acá: el
                      listado trae `evidenceCount: 0` a propósito (está escrito en el contrato) y
                      las pruebas se leen en el detalle. Pedir la evidencia de cada fila serían N
                      peticiones para una lista, y poner una imagen cualquiera sería fabricarla.
                    */
                    meta={[
                      fine.number ? `#${fine.number}` : null,
                      fine.plate,
                      fine.zoneName,
                      fine.spaceCode,
                      fine.dueAt ? `${t('citizen.fines.dueLabel')} ${formatDate(fine.dueAt, locale)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    value={
                      /*
                        Monto POSITIVO y `sign="charge"` explícito, no un `amountMinor` negado.
                        Negarlo era un truco para conseguir el color rojo, y obligaba a esconder el
                        signo: «−₡25.000» en una multa pendiente se lee como si ya se hubiera
                        pagado. Lo que se debe no es un cargo aplicado; se pinta con el tono de
                        cargo y se dice el número tal cual.
                      */
                      <AmountText
                        amountMinor={fine.amountPayableMinor}
                        currencyCode={fine.currencyCode}
                        locale={locale}
                        sign="charge"
                        showSignPrefix={false}
                      />
                    }
                    onClick={() => navigate(`/fines/${fine.id}`)}
                  />
                ))}
              </Card>
              {/* A control that can only be pressed to no effect is noise; on a phone it is noise
                  that costs a whole row of screen. */}
              {totalPages > 1 ? (
              <Pagination
                page={page}
                size={PAGE_SIZE}
                totalPages={totalPages}
                totalElements={total}
                onPageChange={setPage}
                previousLabel={t('pagination.previous')}
                nextLabel={t('pagination.next')}
                pageLabel={t('pagination.page')}
                ofLabel={t('pagination.of')}
                resultCountLabel={tPlural('pagination.resultCount', total)}
              />
              ) : null}
            </>
          )
        }
      </QueryBoundary>
      {/*
        «¿Tenés una duda? Revisá cómo funcionan las multas», la última fila del boceto.

        No estrena pantalla ni inventa contenido: lleva a la categoría «Multas y boletas» del
        centro de ayuda, que ya existe (`/help/fines`, `citizen.help.cat.fines.*`) con sus cuatro
        temas —me llegó una boleta, quiero apelar, no la entiendo, ya la pagué—. El mismo icono y
        la misma forma de fila que el acceso a la ayuda desde «Más», porque es la misma puerta.
      */}
      <Card>
        <ListRow
          icon={<IconHelp size={18} />}
          title={t('citizen.fines.help.title')}
          meta={t('citizen.fines.help.meta')}
          value={<IconChevronRight size={16} />}
          onClick={() => navigate('/help/fines')}
        />
      </Card>
    </CitizenShell>
  );
}
