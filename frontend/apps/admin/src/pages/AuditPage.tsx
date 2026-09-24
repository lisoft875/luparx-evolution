import * as React from 'react';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDateTime, type TranslationKey } from '@luparx/i18n';
import type { AuditChange, AuditEvent, AuditOriginProbe } from '@luparx/api-client';
import { Alert, Badge, Button, Card, Input, Pagination, SectionHeader, Select, Table } from '@luparx/ui';

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

const PAGE_SIZE = 20;

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

  /** Any filter change puts the reader back on the first page; page 4 of a new filter is nobody's intent. */
  function refilter(change: () => void): void {
    setPage(0);
    change();
  }

  const query = useQuery({
    queryKey: ['admin', 'audit-events', { action, modulo, from, to, actor: actor?.id, ip: origin?.ipHash, page }],
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
        page,
        size: PAGE_SIZE,
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
        columns={[
          {
            key: 'actor',
            header: t('admin.audit.column.actor'),
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
            // Lo que pasó, y debajo el código con el que soporte lo va a buscar. En ese orden: la
            // pantalla la lee una persona que administra una municipalidad, no quien escribió el
            // enum.
            render: (row) => (
              <>
                <div>{auditActionLabel(t, row.action)}</div>
                <div className="lx-text-meta lx-code">{row.action}</div>
              </>
            ),
          },
          {
            key: 'resource',
            header: t('admin.audit.column.resource'),
            // Not every act is about one identified thing — checking an address is about the trail
            // itself. "audit/" with nothing after the slash reads as a lost identifier.
            render: (row) => <ResourceCell row={row} label={moduleLabel(t, row.resourceType)} />,
          },
          {
            key: 'changes',
            header: t('admin.audit.column.changes'),
            // An action with nothing in it is not a gap: most audited acts create or read something
            // rather than altering a value.
            render: (row) =>
              (row.changes ?? []).length === 0 ? (
                <span className="lx-text-meta">—</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {(row.changes ?? []).map((change) => (
                    <ChangeLine
                      key={change.field}
                      change={change}
                      maskedLabel={t('admin.audit.masked')}
                      fieldLabel={fieldLabelOf(t, change.field)}
                      allZonesLabel={t('admin.staff.zones.all')}
                    />
                  ))}
                </div>
              ),
          },
          {
            key: 'origin',
            header: t('admin.audit.column.origin'),
            render: (row) => (
              <OriginCell
                row={row}
                systemLabel={t('admin.audit.origin.system')}
                fingerprintLabel={t('admin.audit.origin.fingerprint')}
              />
            ),
          },
          {
            key: 'occurredAt',
            header: t('admin.audit.column.occurredAt'),
            render: (row) => formatDateTime(row.occurredAt, locale),
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
    </AdminShell>
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
 * Sobre qué fue la acción.
 *
 * <p>Era `membership/01a0a3ac-a7cb-7aa4-a67d-ea708e9ebc3a`, una sola cuerda de cuarenta y cuatro
 * caracteres de los cuales treinta y seis no le dicen nada a nadie. Ahora el tipo va en palabras y
 * el identificador debajo, acortado, con el valor entero en el atributo `title` para copiarlo — y
 * `user-select: all` para que un clic lo seleccione completo, que es lo que hace falta cuando hay
 * que pegarlo en un correo a soporte.</p>
 *
 * <p>El identificador no desaparece: es lo que convierte una entrada de bitácora en una que se puede
 * cotejar contra la base. Lo que cambia es cuál de los dos datos manda.</p>
 */
function ResourceCell({ row, label }: { row: AuditEvent; label: string }): React.JSX.Element {
  if (!row.resourceId) {
    return <span>{label}</span>;
  }
  return (
    <>
      <div>{label}</div>
      <div className="lx-text-meta lx-code lx-selectable" title={row.resourceId}>
        {row.resourceId.length > 12 ? `${row.resourceId.slice(0, 8)}…${row.resourceId.slice(-4)}` : row.resourceId}
      </div>
    </>
  );
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
  allZonesLabel,
}: {
  change: AuditChange;
  maskedLabel: string;
  fieldLabel: string;
  allZonesLabel: string;
}): React.JSX.Element {
  // El servidor escribe «*» cuando la asignación de sectores está vacía, que no es «ninguno» sino
  // «toda la municipalidad». Dejarlo pasar crudo invertiría el sentido del registro.
  const leer = (valor: string | null | undefined): string =>
    valor === '*' && change.field === 'zones' ? allZonesLabel : (valor ?? '—');
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      <strong>{fieldLabel}</strong>: {leer(change.oldValue)} → {leer(change.newValue)}{' '}
      {/* Without this a reader takes a masked value for the address itself. */}
      {change.masked ? <Badge tone="neutral">{maskedLabel}</Badge> : null}
    </span>
  );
}
