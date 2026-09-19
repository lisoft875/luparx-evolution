import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { citationStatusKey, citationStatusTone } from '@luparx/features';
import { formatDate, useTranslation } from '@luparx/i18n';
import { AmountText, Badge, Card, ChipGroup, EmptyState, IconCheck, IconFine, ListRow, Pagination } from '@luparx/ui';
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
                    meta={[
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
    </CitizenShell>
  );
}
