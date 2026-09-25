import * as React from 'react';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDateTime, type TranslationKey } from '@luparx/i18n';
import type { AuditChange, AuditEvent, AuditOriginProbe } from '@luparx/api-client';
import type { BadgeTone } from '@luparx/ui';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Pagination,
  SectionHeader,
  Select,
  SummaryList,
  SummaryRow,
  Table,
} from '@luparx/ui';

/**
 * Los tipos de recurso que las escrituras de esta plataforma registran hoy.
 *
 * Escritos a mano y no derivados de la página cargada: un desplegable cuyas opciones salen de lo
 * que ya se ve sólo permite filtrar por lo que ya se ve, que es el filtro que nadie necesita.
 */
const MODULOS = [
  'parking-rate',
  'parking-zone',
  'parking-policy',
  'parking-space',
  'parking-space-format',
  'citation',
  'exemption',
  'user',
  'membership',
  'settlement',
] as const;
import { AdminShell } from '../components/AdminShell';
import { startOfDay, startOfNextDay } from '../lib/dateRange';
import { AUDIT_ACTIONS, auditActionLabel } from '../lib/auditActions';
import { useMediaQuery } from '@luparx/features';

/** Los tamaños de página que ofrece el selector. El servidor recorta cualquier cosa por encima de 100. */
const TAMANOS_DE_PAGINA = [20, 50, 100] as const;

/**
 * The audit trail (CONTRACT.md §7, v0.32 and v0.33).
 *
 * <p>The five things a government buyer asks of this screen are: who did it, when, what it was
 * before, what it is now, and where it came from — and then, separately, whether anybody could have
 * quietly removed a line. v0.32 answered the before/after and the tamper-evidence. v0.33 answers the
 * other two properly: the actor is a person's name rather than an identifier nobody can read, and
 * the origin is a device and a fingerprint rather than a column that existed only in the
 * database.</p>
 *
 * <p>The chain is stated at the top, in words, before the table. Somebody who opens this screen in
 * front of an auditor should be able to point at one line.</p>
 */
export function AuditPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actor, setActor] = useState<{ id: string; name: string } | null>(null);
  /**
   * El módulo, que en esta bitácora es el `resourceType` que cada escritura ya guarda.
   *
   * No hay taxonomía nueva: la §4 de la guía funcional pide filtrar por módulo y la columna existe
   * desde el primer día. Agrupar acciones en «módulos» inventados por encima habría creado una
   * segunda clasificación que se desincroniza de la que las escrituras usan de verdad.
   */
  const [modulo, setModulo] = useState('');
  const [origin, setOrigin] = useState<{ ipHash: string; fingerprint: string } | null>(null);
  const [page, setPage] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [tamano, setTamano] = useState<number>(TAMANOS_DE_PAGINA[0]);
  /** La fila que el panel lateral está mostrando, o `null` si está cerrado. */
  const [detalle, setDetalle] = useState<AuditEvent | null>(null);
  /**
   * Por debajo de este ancho la columna Origen no se dibuja.
   *
   * <p>No es `display:none`: la columna no se construye. Ocultarla con CSS la deja en el DOM, así
   * que un lector de pantalla sigue anunciando una cabecera que nadie ve y la tabla sigue
   * declarando seis columnas mientras muestra cinco.</p>
   */
  const angosto = useMediaQuery('(max-width: 1100px)');

  /** Any filter change puts the reader back on the first page; page 4 of a new filter is nobody's intent. */
  function refilter(change: () => void): void {
    setPage(0);
    change();
  }

  const query = useQuery({
    queryKey: ['admin', 'audit-events', { action, modulo, from, to, actor: actor?.id, ip: origin?.ipHash, q: busqueda, page, tamano }],
    queryFn: () =>
      apiClient.adminAudit.list({
        action: action || undefined,
        resourceType: modulo || undefined,
        actor: actor?.id,
        ipHash: origin?.ipHash,
        // A date is what the person types; the API takes instants, and its window is half-open
        // (>= from, < to). So the closing day is included by asking for the start of the next one:
        // a "hasta el 9" that excluded everything that happened on the 9th would be a quiet lie.
        from: startOfDay(from),
        to: startOfNextDay(to),
        // La búsqueda sale sólo cuando hay algo escrito: una cadena vacía es «sin filtro» y no
        // «recursos cuyo id empieza con nada», que es lo mismo pero le cuesta a la base.
        q: busqueda.trim() || undefined,
        page,
        size: tamano,
      }),
  });
  const chainQuery = useQuery({
    queryKey: ['admin', 'audit-events', 'chain'],
    queryFn: () => apiClient.adminAudit.chain(),
  });
  const data = query.data;
  const chain = chainQuery.data;

  return (
    <AdminShell>
      <h1>{t('admin.audit.title')}</h1>

      {/* --- the chain, said before anything else ------------------------------------------------ */}
      <Card>
        <SectionHeader
          title={t('admin.audit.chain.title')}
          description={t('admin.audit.chain.description')}
        />
        {chain ? (
          <>
            <Alert tone={chain.intact ? 'success' : 'danger'}>
              {chain.intact
                ? t('admin.audit.chain.intact', {
                    entries: chain.entryCount,
                    seals: chain.sealCount,
                  })
                : t('admin.audit.chain.broken', { problems: chain.problems.length })}
            </Alert>
            {/* Not a verdict on its own: entries newer than this are protected by the database but
                not yet covered by a seal, and saying so is what stops the green badge being read as
                "everything ever written is proven". */}
            <p className="lx-text-meta">
              {chain.sealedThrough
                ? t('admin.audit.chain.sealedThrough', {
                    date: formatDateTime(chain.sealedThrough, locale),
                  })
                : t('admin.audit.chain.notSealedYet')}
            </p>
            {chain.problems.map((problem) => (
              <p key={`${problem.seq}-${problem.kind}`} className="lx-text-meta">
                <strong>#{problem.seq}</strong> · {t(`admin.audit.chain.problem.${problem.kind}` as TranslationKey)}{' '}
                · {problem.detail}
              </p>
            ))}
            {chain.recentSeals.length > 0 ? (
              <p className="lx-text-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {t('admin.audit.chain.lastSeal', {
                  seq: chain.recentSeals[0]!.seq,
                  digest: chain.recentSeals[0]!.digest.slice(0, 16),
                })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="lx-text-meta">{t('common.loading')}</p>
        )}
      </Card>

      {/* --- filters ----------------------------------------------------------------------------- */}
      {/* Anchos declarados y no heredados del contenido (24-09-2026).
          Antes era un flex sin medidas, así que cada control se encogía hasta caber en su valor:
          elegir «Zonas» dejaba el desplegable de módulos en noventa píxeles y, con él, su lista.
          `minmax(Npx, 1fr)` da una medida estable que no depende de lo que esté seleccionado, y en
          un teléfono cada control ocupa la fila entera en vez de partirse en cuatro trozos. */}
      {/* Buscar y cuántas filas por página: la fila de arriba de los filtros, porque no son
          filtros del mismo tipo. Los de abajo acotan QUÉ se busca; éstos, cómo se recorre. */}
      <div className="lx-filter-row lx-filter-row--tools">
        <Input
          placeholder={t('admin.audit.search.placeholder')}
          aria-label={t('admin.audit.search.label')}
          value={busqueda}
          onChange={(e) => refilter(() => setBusqueda(e.target.value))}
        />
        <Select
          aria-label={t('admin.audit.pageSize.label')}
          value={String(tamano)}
          onChange={(value) => refilter(() => setTamano(Number(value)))}
          options={TAMANOS_DE_PAGINA.map((n) => ({
            value: String(n),
            label: t('admin.audit.pageSize.option', { count: n }),
          }))}
        />
      </div>

      <div className="lx-filter-row">
        <Select
          aria-label={t('admin.audit.filter.action')}
          value={action}
          onChange={(value) => refilter(() => setAction(value))}
          options={[
            { value: '', label: t('admin.audit.filter.action.all') },
            // El código interno va de detalle, no de etiqueta: quien lo conoce lo sigue viendo y
            // quien no, ya no lo necesita para encontrar nada.
            ...AUDIT_ACTIONS.map((codigo) => ({
              value: codigo,
              label: auditActionLabel(t, codigo),
              detail: codigo,
            })),
          ]}
        />
        <Select
          aria-label={t('admin.audit.filter.module')}
          value={modulo}
          onChange={(value) => refilter(() => setModulo(value))}
          options={[
            { value: '', label: t('admin.audit.filter.module.all') },
            ...MODULOS.map((tipo) => ({ value: tipo, label: t(`admin.audit.module.${tipo}` as TranslationKey) })),
          ]}
        />
        <Input
          type="date"
          value={from}
          onChange={(e) => refilter(() => setFrom(e.target.value))}
          aria-label={t('admin.audit.filter.from')}
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => refilter(() => setTo(e.target.value))}
          aria-label={t('admin.audit.filter.to')}
        />
      </div>

      {/* Active filters that were not typed into a box are said out loud, with a way out of each.
          A screen silently showing one person's actions is how somebody concludes the trail is
          empty. */}
      {actor ? (
        <p className="lx-text-meta" data-testid="audit-actor-filter">
          {t('admin.audit.filter.onlyPerson', { name: actor.name })}{' '}
          <Button variant="ghost" onClick={() => refilter(() => setActor(null))}>
            {t('admin.audit.filter.clear')}
          </Button>
        </p>
      ) : null}
      {origin ? (
        <p className="lx-text-meta" data-testid="audit-origin-filter">
          {t('admin.audit.filter.onlyOrigin', { fingerprint: origin.fingerprint })}{' '}
          <Button variant="ghost" onClick={() => refilter(() => setOrigin(null))}>
            {t('admin.audit.filter.clear')}
          </Button>
        </p>
      ) : null}

      <OriginProbe
        onMatch={(probe) =>
          refilter(() => setOrigin({ ipHash: probe.ipHash, fingerprint: probe.fingerprint }))
        }
      />

      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.audit.empty')}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        // Si en una pantalla angosta hay que desplazarse, que al menos el actor no se vaya: una
        // fila cuyo «quién» quedó fuera de la vista es una acción sin dueño, y reconstruirla
        // obliga a ir y volver. En escritorio no debería hacer falta —las columnas ya caben— y
        // esto no estorba.
        stickyFirstColumn
        // Seis columnas que hay que leer juntas: el aire de una tabla ancha es lo que obligaba a
        // arrastrarla en un portátil.
        compact
        columns={[
          {
            key: 'actor',
            header: t('admin.audit.column.actor'),
            width: '190px',
            // "Quién realizó cada acción." A UUID is not an answer to that question, and this is the
            // screen a municipality shows an auditor.
            render: (row) => (
              <ActorCell
                row={row}
                systemLabel={t('admin.audit.actor.system')}
                inactiveLabel={t('admin.audit.actor.inactive')}
                onlyLabel={t('admin.audit.filter.only')}
                onPick={(picked) => refilter(() => setActor(picked))}
              />
            ),
          },
          {
            key: 'action',
            header: t('admin.audit.column.action'),
            width: '170px',
            // Sólo el texto amigable. El código técnico estuvo acá debajo desde el 24-09 y era
            // información duplicada: quien administra una municipalidad no lo necesita para
            // entender la fila, y quien sí lo necesita —soporte— lo tiene en Ver detalle. Dos
            // renglones por fila multiplicados por veinte filas son cuarenta renglones de ruido.
            render: (row) => auditActionLabel(t, row.action),
          },
          {
            key: 'changes',
            header: t('admin.audit.column.changes'),
            // SIN ancho declarado a propósito: es la única columna elástica, así que se queda con
            // todo el espacio que las demás no piden. Es la que contiene lo que el funcionario de
            // verdad tiene que interpretar.
            render: (row) => <ChangesCell row={row} t={t} />,
          },
          // Origen es lo primero que se va cuando no hay ancho. No se pierde: está en Ver detalle.
          // Antes que degradar «Qué cambió», que es la columna por la que alguien entra a esta
          // pantalla.
          ...(angosto
            ? []
            : [
                {
                  key: 'origin',
                  header: t('admin.audit.column.origin'),
                  width: '170px',
                  render: (row: AuditEvent) => (
                    <OriginCell
                      row={row}
                      systemLabel={t('admin.audit.origin.system')}
                      fingerprintLabel={t('admin.audit.origin.fingerprint')}
                    />
                  ),
                },
              ]),
          {
            key: 'occurredAt',
            header: t('admin.audit.column.occurredAt'),
            width: '150px',
            render: (row) => formatDateTime(row.occurredAt, locale),
          },
          {
            key: 'detalle',
            header: '',
            width: '52px',
            // Un botón de verdad y no una fila clickeable: una `<tr>` con `onClick` no la alcanza
            // el teclado, no se anuncia como acción y compite con los botones que ya viven dentro
            // de la celda de Actor. La especificación admite las dos formas; ésta es la que
            // funciona sin ratón.
            //
            // Y un botón y no un menú «•••» con una sola opción: el menú es un clic de más para
            // llegar al mismo lugar.
            render: (row) => (
              <button
                type="button"
                className="lx-row-detail"
                aria-label={t('admin.audit.detail.open')}
                title={t('admin.audit.detail.open')}
                onClick={() => setDetalle(row)}
              >
                <span aria-hidden="true">···</span>
              </button>
            ),
          },
        ]}
      />
      {data ? (
        <Pagination
          page={data.page}
          size={data.size}
          totalPages={data.totalPages}
          totalElements={data.totalElements}
          onPageChange={setPage}
          previousLabel={t('pagination.previous')}
          nextLabel={t('pagination.next')}
          pageLabel={t('pagination.page')}
          ofLabel={t('pagination.of')}
          resultCountLabel={t('pagination.resultCount.other', { count: data.totalElements })}
        />
      ) : null}

      {/* El detalle de UNA fila, al lado y no encima: un modal centrado tapa la lista, que es
          justamente el contexto que hace útil al detalle. Acá está todo lo que la tabla dejó de
          mostrar — y nada de eso se dejó de registrar: sigue entero en la base. */}
      <Modal
        open={detalle !== null}
        onClose={() => setDetalle(null)}
        variant="drawer"
        title={t('admin.audit.detail.title')}
        closeLabel={t('common.close')}
      >
        {detalle ? (
          <SummaryList>
            <SummaryRow
              label={t('admin.audit.detail.actor')}
              value={detalle.actorName ?? detalle.actorUserId ?? t('admin.audit.actor.system')}
            />
            <SummaryRow label={t('admin.audit.detail.action')} value={auditActionLabel(t, detalle.action)} />
            <SummaryRow
              label={t('admin.audit.detail.module')}
              value={moduleLabel(t, detalle.resourceType)}
            />
            <SummaryRow
              label={t('admin.audit.detail.changes')}
              // Entero, sin recortar: la tabla recorta a dos líneas y éste es el lugar donde el
              // valor completo tiene que estar.
              value={
                (detalle.changes ?? []).length === 0 ? (
                  <span className="lx-text-meta">—</span>
                ) : (
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(detalle.changes ?? []).map((change) => (
                      <ChangeLine
                        key={change.field}
                        change={change}
                        maskedLabel={t('admin.audit.masked')}
                        fieldLabel={fieldLabelOf(t, change.field)}
                        t={t}
                      />
                    ))}
                  </span>
                )
              }
            />
            <SummaryRow
              label={t('admin.audit.detail.occurredAt')}
              value={formatDateTime(detalle.occurredAt, locale)}
            />
            <SummaryRow
              label={t('admin.audit.detail.origin')}
              value={detalle.device ?? detalle.userAgent ?? t('admin.audit.origin.system')}
            />
            {/* Lo técnico, junto y al final. Sigue estando; sólo dejó de competir por el ancho de
                la tabla con lo que alguien lee de corrido. */}
            <SummaryRow
              label={t('admin.audit.detail.resourceId')}
              value={
                detalle.resourceId ? (
                  <span className="lx-code lx-selectable">{detalle.resourceId}</span>
                ) : (
                  <span className="lx-text-meta">—</span>
                )
              }
            />
            <SummaryRow
              label={t('admin.audit.detail.technicalEvent')}
              value={<span className="lx-code lx-selectable">{detalle.action}</span>}
            />
            <SummaryRow
              label={t('admin.audit.detail.fingerprint')}
              value={
                detalle.ipFingerprint ? (
                  <span className="lx-code lx-selectable">{detalle.ipFingerprint}</span>
                ) : (
                  <span className="lx-text-meta">—</span>
                )
              }
            />
          </SummaryList>
        ) : null}
      </Modal>
    </AdminShell>
  );
}

/**
 * Lo que cambió, recortado a dos líneas.
 *
 * <p>Dos y no más porque una descripción de zona son dos renglones de prosa y la tabla pone
 * `white-space: nowrap`: sin recortar, una sola celda mide cuatrocientos píxeles y empuja lo que
 * viene después fuera de la pantalla. El valor entero está en el `title` y, completo y sin
 * recortar, en Ver detalle.</p>
 */
function ChangesCell({
  row,
  t,
}: {
  row: AuditEvent;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}): React.JSX.Element {
  const changes = row.changes ?? [];
  if (changes.length === 0) {
    // Una acción sin cambios no es un hueco: la mayoría de los actos auditados crean o consultan
    // algo en vez de alterar un valor.
    return <span className="lx-text-meta">—</span>;
  }
  return (
    <div className="lx-table-cell-clamp" title={cambiosEnTexto(t, changes)}>
      {changes.map((change) => (
        <ChangeLine
          key={change.field}
          change={change}
          maskedLabel={t('admin.audit.masked')}
          fieldLabel={fieldLabelOf(t, change.field)}
          t={t}
        />
      ))}
    </div>
  );
}

/**
 * Who acted.
 *
 * <p>Three cases and each one says something different: a named person, a person the platform could
 * not resolve (shown as the short id, so the entry is still traceable), and no person at all — which
 * is the platform itself and is written as such rather than left blank, because a blank actor reads
 * as a missing value.</p>
 */
function ActorCell({
  row,
  systemLabel,
  inactiveLabel,
  onlyLabel,
  onPick,
}: {
  row: AuditEvent;
  systemLabel: string;
  inactiveLabel: string;
  onlyLabel: string;
  onPick: (actor: { id: string; name: string }) => void;
}): React.JSX.Element {
  const actorUserId = row.actorUserId;
  if (!actorUserId) {
    return <span className="lx-text-meta">{systemLabel}</span>;
  }
  // The short id is the fallback for a person the server could not name. It is not decoration: an
  // entry whose actor cannot be resolved must still be traceable to something.
  const name = row.actorName ?? actorUserId.slice(0, 8);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        className="lx-linklike"
        title={onlyLabel}
        onClick={() => onPick({ id: actorUserId, name })}
      >
        {name}
      </button>
      {/* An act performed by somebody who no longer has access is a different fact from one performed
          by a current employee, and often the more interesting of the two. */}
      {row.actorActive === false ? <Badge tone="warning">{inactiveLabel}</Badge> : null}
    </span>
  );
}

/**
 * Where the act came from — "IP/dispositivo cuando aplique".
 *
 * <p>"Cuando aplique" is doing real work in that sentence: a scheduled job has no device and no
 * address, and this says so instead of showing an empty cell that looks like a lost value.</p>
 *
 * <p>The address itself is never here, because the platform does not keep it. What is here is a
 * fingerprint of the hash, which is enough to see that forty lookups came from one place.</p>
 */
function OriginCell({
  row,
  systemLabel,
  fingerprintLabel,
}: {
  row: AuditEvent;
  systemLabel: string;
  fingerprintLabel: string;
}): React.JSX.Element {
  if (!row.ipFingerprint && !row.device && !row.userAgent) {
    return <span className="lx-text-meta">{systemLabel}</span>;
  }
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* The full header on hover: the summary is a rendering, the header is the evidence. */}
      <span title={row.userAgent ?? undefined}>{row.device ?? row.userAgent ?? '—'}</span>
      {row.ipFingerprint ? (
        <span className="lx-text-meta" style={{ fontVariantNumeric: 'tabular-nums' }} title={fingerprintLabel}>
          {row.ipFingerprint}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Checks one address against the trail.
 *
 * <p>The address is typed here and sent in a request body — never in the URL, and never kept by the
 * platform. What comes back is how many entries it matches, and the fingerprint the reader can then
 * recognise in the table.</p>
 *
 * <p>Zero matches is shown as plainly as a hit. Ruling an address out is most of what this is for,
 * and a form that only celebrated hits would push somebody towards reading the whole trail by
 * hand.</p>
 */
function OriginProbe({ onMatch }: { onMatch: (probe: AuditOriginProbe) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<AuditOriginProbe | null>(null);

  const probe = useMutation({
    mutationFn: (ip: string) => apiClient.adminAudit.checkOrigin({ ip }),
    onSuccess: (found) => setResult(found),
  });

  return (
    <Card>
      <SectionHeader
        title={t('admin.audit.origin.probe.title')}
        description={t('admin.audit.origin.probe.description')}
      />
      <form
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
        onSubmit={(event) => {
          event.preventDefault();
          if (address.trim()) {
            probe.mutate(address.trim());
          }
        }}
      >
        <Input
          placeholder={t('admin.audit.origin.probe.placeholder')}
          aria-label={t('admin.audit.origin.probe.placeholder')}
          value={address}
          onChange={(e) => {
            setResult(null);
            setAddress(e.target.value);
          }}
        />
        <Button type="submit" disabled={probe.isPending || !address.trim()}>
          {t('admin.audit.origin.probe.submit')}
        </Button>
      </form>
      {probe.isError ? (
        <Alert tone="danger">{t('admin.audit.origin.probe.failed')}</Alert>
      ) : null}
      {result ? (
        <div data-testid="audit-probe-result">
        <Alert tone={result.matches > 0 ? 'info' : 'success'}>
          {result.matches > 0
            ? t('admin.audit.origin.probe.found', {
                count: result.matches,
                fingerprint: result.fingerprint,
              })
            : t('admin.audit.origin.probe.none')}{' '}
          {result.matches > 0 ? (
            <Button variant="ghost" onClick={() => onMatch(result)}>
              {t('admin.audit.origin.probe.filter')}
            </Button>
          ) : null}
        </Alert>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * El nombre humano de un tipo de recurso, o el tipo crudo si no hay traducción.
 *
 * <p>La lista `MODULOS` de arriba es la del desplegable —lo que se puede filtrar—, y la bitácora
 * registra más tipos que ésos. Un recurso sin etiqueta se muestra como viene: es peor inventarle un
 * nombre que mostrar el técnico.</p>
 */
function moduleLabel(t: (key: TranslationKey) => string, resourceType: string): string {
  const clave = `admin.audit.module.${resourceType}` as TranslationKey;
  const texto = t(clave);
  return texto === clave ? resourceType : texto;
}

/**
 * El nombre humano de un campo que cambió, o el campo crudo.
 *
 * <p>Mismo criterio que con las acciones y los módulos: traducción si la hay, valor técnico si no.
 * Nunca un espacio en blanco, que es lo único que no se puede interpretar.</p>
 */
function fieldLabelOf(t: (key: TranslationKey) => string, field: string): string {
  const clave = `admin.audit.field.${field}` as TranslationKey;
  const texto = t(clave);
  return texto === clave ? field : texto;
}

/**
 * One changed field, as "name: before → after".
 *
 * <p>An empty value is written as an em dash rather than left blank: "→" with nothing after it reads
 * as a rendering failure, and it means the field was cleared — which is often the change that
 * matters.</p>
 */
function ChangeLine({
  change,
  maskedLabel,
  fieldLabel,
  t,
}: {
  change: AuditChange;
  maskedLabel: string;
  fieldLabel: string;
  t: (key: TranslationKey) => string;
}): React.JSX.Element {
  const desde = valorLegible(t, change.field, change.oldValue);
  const hasta = valorLegible(t, change.field, change.newValue);
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {/* El nombre del campo es un chip de color por TIPO de cambio, no un `<strong>`.
          El color acá es información: deja recorrer veinte filas y ver de un vistazo cuáles tocaron
          dinero y cuáles sólo un nombre, sin leer ninguna. El texto dice lo mismo que el color, así
          que quien no distingue los tonos no pierde nada. */}
      <Badge tone={tonoDelCampo(change)}>{fieldLabel}</Badge> {desde} → {hasta}{' '}
      {/* Without this a reader takes a masked value for the address itself. */}
      {change.masked ? <Badge tone="neutral">{maskedLabel}</Badge> : null}
    </span>
  );
}

/**
 * De qué tipo es un cambio, en un color.
 *
 * <h2>Por qué una tabla explícita y no una regla</h2>
 *
 * <p>Porque los nombres de campo vienen del servidor y no siguen ninguna convención que se pueda
 * deducir: `amountMinor` es dinero, `chargesAllDay` es horario, `active` es un estado. Una
 * heurística sobre el nombre acertaría hoy y se equivocaría en silencio con el primer campo nuevo
 * — y equivocarse en silencio, acá, es pintar un cambio de tarifa como si fuera otra cosa.</p>
 *
 * <p>Lo que no está en la tabla sale neutro, que es la respuesta correcta para «no sé de qué tipo
 * es esto»: el chip sigue diciendo el nombre del campo.</p>
 */
const TONO_POR_CAMPO: Record<string, BadgeTone> = {
  // Identidad
  name: 'info',
  code: 'info',
  // Dinero
  amountMinor: 'amber',
  // Tiempo y horario
  minutes: 'teal',
  week: 'teal',
  chargesAllDay: 'teal',
  exceptions: 'teal',
  sessionMinMinutes: 'teal',
  sessionMaxMinutes: 'teal',
  sessionIncrementsMinutes: 'teal',
  extensionMaxTotalMinutes: 'teal',
  // Texto largo
  description: 'violet',
};

/**
 * El tono del chip. Un estado es el único caso donde el color depende del VALOR y no del campo:
 * pasar a activo es verde y dejar de estarlo es rojo, que es justamente lo que alguien busca
 * cuando recorre la bitácora.
 */
function tonoDelCampo(change: AuditChange): BadgeTone {
  if (change.field === 'active' || change.field === 'status') {
    const hacia = String(change.newValue ?? '').toUpperCase();
    const encendido = hacia === 'TRUE' || hacia === 'ACTIVE' || hacia === 'ACTIVA';
    const apagado =
      hacia === 'FALSE' || hacia === 'INACTIVE' || hacia === 'REVOKED' || hacia === 'SUSPENDED';
    if (encendido) return 'success';
    if (apagado) return 'danger';
    return 'neutral';
  }
  return TONO_POR_CAMPO[change.field] ?? 'neutral';
}

/**
 * El valor de un campo, en el idioma de quien lo lee.
 *
 * <p>«active: true → false» es correcto y es ilegible para quien administra una municipalidad: hay
 * que saber que el campo se llama `active` y que `false` quiere decir que la zona dejó de operar.
 * Son dos traducciones mentales para un dato que la pantalla ya podía dar hecho.</p>
 *
 * <p>Sólo se traduce lo que es un ENUMERADO: un booleano, un estado, un centinela. Un nombre o una
 * descripción se muestran tal cual, porque son lo que alguien escribió y cambiarlos sería
 * falsificar la evidencia. El código técnico no se pierde: la fila entera sigue disponible en el
 * `title` de la celda.</p>
 */
function valorLegible(
  t: (key: TranslationKey) => string,
  field: string,
  value: string | null | undefined,
): string {
  if (field === 'active' && (value === 'true' || value === 'false')) {
    return t(`admin.audit.value.active.${value}` as TranslationKey);
  }
  // El servidor escribe «*» cuando la asignación de sectores está vacía, que no es «ninguno» sino
  // «toda la municipalidad». Dejarlo pasar crudo invertiría el sentido del registro.
  if (field === 'zones' && value === '*') {
    return t('admin.staff.zones.all');
  }
  return value ?? '—';
}

/** La fila de cambios en una sola cadena, para el `title` de la celda. */
function cambiosEnTexto(
  t: (key: TranslationKey) => string,
  changes: readonly AuditChange[],
): string {
  return changes
    .map(
      (change) =>
        `${fieldLabelOf(t, change.field)}: ${valorLegible(t, change.field, change.oldValue)}`
        + ` → ${valorLegible(t, change.field, change.newValue)}`,
    )
    .join('\n');
}
