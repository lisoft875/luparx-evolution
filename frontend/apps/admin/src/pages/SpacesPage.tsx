import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequirePermission, useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import { ApiError, type ParkingSpace } from '@luparx/api-client';
import { Alert, Badge, Button, Combobox, FormField, Input, Modal, Pagination, Select, Table } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

const PAGE_SIZE = 50;
/** Cuántas sugerencias se ofrecen. Una lista que hay que recorrer ya no es un atajo. */
const SUGERENCIAS = 10;

/**
 * The bays of a zone (CONTRACT.md v0.16).
 *
 * <p>Scoped to one zone and paginated, because this is the collection that actually grows: a
 * municipality operates a handful of sectors and San José alone has five thousand bays. The chosen
 * zone lives in the URL (`?zone=`) so the screen can be linked to from the zone list and survives a
 * reload.</p>
 *
 * <p>A bay's identity is the row, not the string written on it: since v0.25 the code can be corrected
 * when the municipality repaints one, because a repainted bay is the same bay and splitting its record
 * in two to describe a coat of paint helps nobody. What makes that safe is that nothing already
 * charged reads the code live — every stay and every citation carries its own copy — so the dialog
 * says so out loud rather than leaving the operator to guess whether last year's receipt just moved.</p>
 *
 * <p>Nothing is ever deleted. A bay that is dug up goes out of service, and every stay paid on it and
 * every citation written at it keeps resolving.</p>
 */
export function SpacesPage(): React.JSX.Element {
  const { t, tPlural } = useTranslation();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const zoneId = params.get('zone') ?? '';

  const [page, setPage] = useState(0);
  // La búsqueda por código. `busqueda` es lo que se ve escrito; `buscado` es lo que ya se le
  // preguntó al servidor, 250 ms después de la última tecla: sin ese retardo, escribir «A-0147»
  // son seis consultas de las que cinco no le importan a nadie.
  const [busqueda, setBusqueda] = useState('');
  const [buscado, setBuscado] = useState('');
  // La bahía escogida entre las sugerencias. Mientras haya una, la tabla muestra esa y nada más:
  // buscar un código concreto y recibir de vuelta la página donde cae es devolver el problema.
  const [elegida, setElegida] = useState<ParkingSpace | null>(null);

  useEffect(() => {
    const temporizador = window.setTimeout(() => setBuscado(busqueda.trim()), 250);
    return () => window.clearTimeout(temporizador);
  }, [busqueda]);

  function limpiarBusqueda(): void {
    setElegida(null);
    setBusqueda('');
    setBuscado('');
  }
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  // The bay being renumbered, and the code being typed for it. Held apart from the create form so
  // that closing one dialog never half-fills the other.
  const [renaming, setRenaming] = useState<ParkingSpace | null>(null);
  const [newCode, setNewCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const zonesQuery = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => apiClient.adminParking.zones() });
  const formatQuery = useQuery({
    queryKey: ['admin', 'space-format'],
    queryFn: () => apiClient.adminParking.spaceFormat(),
  });
  const query = useQuery({
    queryKey: ['admin', 'spaces', { zoneId, page }],
    queryFn: () => apiClient.adminParking.spaces({ zoneId: zoneId || undefined, page, size: PAGE_SIZE }),
    // Con una bahía escogida la tabla no muestra la zona, así que tampoco hace falta traerla.
    enabled: zoneId !== '' && elegida === null,
  });
  const sugerenciasQuery = useQuery({
    queryKey: ['admin', 'spaces', 'buscar', buscado],
    // Sin `zoneId`: el código es único en toda la municipalidad, de modo que se puede encontrar
    // una bahía sin saber de antemano en qué zona está, que es justamente el caso que duele.
    queryFn: () => apiClient.adminParking.spaces({ code: buscado, page: 0, size: SUGERENCIAS }),
    enabled: buscado.length >= 2 && elegida === null,
  });
  // Para poner el nombre de la zona bajo cada código: el código solo no dice dónde está la bahía.
  const zonaPorId = useMemo(
    () => new Map((zonesQuery.data ?? []).map((zone) => [zone.id, zone] as const)),
    [zonesQuery.data],
  );

  function invalidate(message: TranslationKey): void {
    setError(null);
    setFeedback(t(message));
    void queryClient.invalidateQueries({ queryKey: ['admin', 'spaces'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'zones'] });
  }
  function onFailure(err: unknown): void {
    setFeedback(null);
    const code = err instanceof ApiError ? err.code : '';
    setError(
      code === 'PARKING_SPACE_CODE_TAKEN'
        ? t('admin.spaces.error.codeTaken')
        : code === 'PARKING_SPACE_CODE_INVALID'
          ? t('admin.spaces.error.codeInvalid', { example: formatQuery.data?.example ?? '' })
          : t('admin.zones.error.generic'),
    );
  }

  const createMutation = useMutation({
    mutationFn: () => apiClient.adminParking.createSpace({ zoneId, code: code.trim() }),
    onSuccess: () => {
      setCreating(false);
      setCode('');
      invalidate('admin.spaces.created');
    },
    onError: onFailure,
  });
  const toggleMutation = useMutation({
    mutationFn: (space: ParkingSpace) =>
      apiClient.adminParking.updateSpace(space.id, {
        status: space.status === 'AVAILABLE' ? 'OUT_OF_SERVICE' : 'AVAILABLE',
      }),
    onSuccess: (space) => {
      // Si la tabla está mostrando solo esa bahía, la fila tiene que reflejar el cambio. La
      // respuesta ya trae el estado nuevo, así que no hace falta volver a buscarla.
      setElegida((actual) => (actual && actual.id === space.id ? space : actual));
      invalidate('admin.spaces.updated');
    },
    onError: onFailure,
  });
  const renameMutation = useMutation({
    mutationFn: ({ space, value }: { space: ParkingSpace; value: string }) =>
      apiClient.adminParking.updateSpace(space.id, { code: value.trim() }),
    onSuccess: (space) => {
      setRenaming(null);
      setNewCode('');
      setElegida((actual) => (actual && actual.id === space.id ? space : actual));
      // El código escrito arriba era el viejo. Dejarlo ahí después de renumerar sería mentira.
      setBusqueda((actual) => (elegida && elegida.id === space.id ? space.code : actual));
      invalidate('admin.spaces.renamed');
    },
    onError: onFailure,
  });

  const data = query.data;

  return (
    <AdminShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1>{t('admin.spaces.title')}</h1>
        <RequirePermission permission="TENANT_MANAGE">
          {/* Disabled until a zone is chosen: a bay without a sector is not a thing that exists. */}
          <Button type="button" disabled={!zoneId} onClick={() => setCreating(true)}>
            {t('admin.spaces.create')}
          </Button>
        </RequirePermission>
      </div>
      <p className="lx-text-meta">{t('admin.spaces.description')}</p>

      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div style={{ maxWidth: 360, margin: '12px 0' }}>
        <FormField label={t('admin.spaces.search.label')} hint={t('admin.spaces.search.hint')}>
          {({ inputId, describedBy }) => (
            <Combobox
              label={t('admin.spaces.search.label')}
              inputId={inputId}
              describedBy={describedBy}
              placeholder={
                formatQuery.data
                  ? t('admin.spaces.search.placeholder', { example: formatQuery.data.example })
                  : undefined
              }
              value={busqueda}
              onChange={(texto) => {
                setBusqueda(texto);
                // Volver a escribir deshace la elección: la tabla regresa a la zona entera en
                // cuanto el texto deja de ser el código que se escogió.
                if (elegida) setElegida(null);
              }}
              onSelect={(id) => {
                const bahia = (sugerenciasQuery.data?.items ?? []).find((espacio) => espacio.id === id);
                if (!bahia) return;
                setError(null);
                setFeedback(null);
                setElegida(bahia);
                setBusqueda(bahia.code);
                setPage(0);
                // La zona de la bahía pasa a la URL, de modo que el selector de zona, el botón de
                // agregar y el «ver todas» hablen de la zona donde la bahía efectivamente está.
                setParams({ zone: bahia.zoneId });
              }}
              options={(sugerenciasQuery.data?.items ?? []).map((bahia) => ({
                value: bahia.id,
                label: bahia.code,
                detail: zonaPorId.get(bahia.zoneId)?.name,
              }))}
              loading={sugerenciasQuery.isFetching}
              emptyLabel={t('admin.spaces.search.empty', { query: buscado })}
              moreLabel={
                (sugerenciasQuery.data?.totalElements ?? 0) > SUGERENCIAS
                  ? t('admin.spaces.search.more')
                  : undefined
              }
            />
          )}
        </FormField>
      </div>

      <div style={{ maxWidth: 360, margin: '12px 0' }}>
        <Select
          aria-label={t('admin.spaces.zoneLabel')}
          value={zoneId}
          onChange={(value) => {
            setPage(0);
            setParams(value ? { zone: value } : {});
          }}
          placeholder={t('admin.spaces.zonePlaceholder')}
          options={(zonesQuery.data ?? []).map((zone) => ({
            value: zone.id,
            label: `${zone.code} — ${zone.name}`,
            detail: tPlural('admin.zones.spaceCount', zone.spaceCount),
          }))}
        />
      </div>

      {!zoneId ? (
        <Alert tone="info">{t('admin.spaces.pickZone')}</Alert>
      ) : (
        <>
          {elegida ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 'var(--lx-space-2)',
                marginBottom: 'var(--lx-space-3)',
              }}
            >
              <Alert tone="info">{t('admin.spaces.search.showingOne', { code: elegida.code })}</Alert>
              <Button type="button" variant="secondary" onClick={limpiarBusqueda}>
                {t('admin.spaces.search.clear')}
              </Button>
            </div>
          ) : null}
          <Table
            loading={elegida ? false : query.isLoading}
            loadingLabel={t('common.loading')}
            emptyLabel={t('admin.spaces.empty')}
            rows={elegida ? [elegida] : (data?.items ?? [])}
            rowKey={(space) => space.id}
            columns={[
              { key: 'code', header: t('admin.spaces.column.code'), render: (space) => <strong>{space.code}</strong> },
              {
                key: 'status',
                header: t('admin.spaces.column.status'),
                render: (space) => (
                  <Badge tone={space.status === 'AVAILABLE' ? 'success' : 'neutral'}>
                    {t(`admin.spaces.status.${space.status}` as TranslationKey)}
                  </Badge>
                ),
              },
              {
                key: 'actions',
                header: t('admin.staff.column.actions'),
                render: (space) => (
                  <RequirePermission permission="TENANT_MANAGE">
                    <div style={{ display: 'flex', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}>
                      <Button type="button" variant="secondary" onClick={() => toggleMutation.mutate(space)}>
                        {t(
                          space.status === 'AVAILABLE'
                            ? 'admin.spaces.action.outOfService'
                            : 'admin.spaces.action.backInService',
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setError(null);
                          setFeedback(null);
                          setRenaming(space);
                          // Prefilled with what the bay carries today: a renumbering is usually one
                          // digit away from the current code, and retyping it invites a typo.
                          setNewCode(space.code);
                        }}
                      >
                        {t('admin.spaces.action.editCode')}
                      </Button>
                    </div>
                  </RequirePermission>
                ),
              },
            ]}
          />
          {data && !elegida ? (
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
        </>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('admin.spaces.create')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <FormField
            label={t('admin.spaces.column.code')}
            // The municipality's own format, so the code is typed right the first time instead of
            // being refused at submit by a pattern the administrator cannot see.
            hint={
              formatQuery.data
                ? t('admin.spaces.codeHint', { example: formatQuery.data.example })
                : t('common.loading')
            }
          >
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                value={code}
                autoCapitalize="characters"
                maxLength={24}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </FormField>
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              fullWidth
              loading={createMutation.isPending}
              disabled={!code.trim()}
              onClick={() => createMutation.mutate()}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t('admin.spaces.editCode.title')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          {/* Said before the field, not after: what the operator needs to know to decide is whether
              this rewrites the past, and by the time they have typed they have already decided. */}
          <Alert tone="info">{t('admin.spaces.editCode.notice')}</Alert>
          <FormField
            label={t('admin.spaces.column.code')}
            hint={
              renaming
                ? t('admin.spaces.editCode.current', { code: renaming.code })
                : t('common.loading')
            }
          >
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                value={newCode}
                autoCapitalize="characters"
                maxLength={24}
                onChange={(e) => setNewCode(e.target.value)}
              />
            )}
          </FormField>
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setRenaming(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              fullWidth
              loading={renameMutation.isPending}
              // Nothing to send when the code has not moved: the server would accept it as a no-op,
              // but a success message about a change that did not happen is a small lie.
              disabled={!newCode.trim() || newCode.trim() === renaming?.code}
              onClick={() => {
                if (renaming) renameMutation.mutate({ space: renaming, value: newCode });
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
