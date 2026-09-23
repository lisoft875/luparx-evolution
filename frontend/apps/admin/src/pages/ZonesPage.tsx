import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequirePermission, useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import { ApiError, type AdminParkingZone } from '@luparx/api-client';
import { Alert, Badge, Button, FormField, Input, Modal, Table,
  ConfirmDialog,
} from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { ZoneRulesDialog } from '../components/ZoneRulesDialog';

interface ZoneDraft {
  code: string;
  name: string;
  description: string;
}

const EMPTY_DRAFT: ZoneDraft = { code: '', name: '', description: '' };

/**
 * The municipality's sectors (CONTRACT.md v0.16).
 *
 * <p>Deactivated zones are listed too. A zone is never deleted — every stay ever paid in it, and
 * every citation ever written there, still resolves to it — so "not operated any more" has to be a
 * state you can see and reverse, not a row that vanished.</p>
 *
 * <p>The code is editable only while creating. Afterwards it is what every report is grouped by and
 * what an operator says on the radio; a zone whose code moves takes the meaning of every past report
 * with it. Renaming is what the name is for.</p>
 */
export function ZonesPage(): React.JSX.Element {
  const { t, tPlural } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminParkingZone | null>(null);
  const [rulesFor, setRulesFor] = useState<AdminParkingZone | null>(null);
  /*
    Desactivar una zona la saca de servicio: deja de aceptar estacionamientos y de recaudar. Hasta
    ahora se hacía con un solo clic y sin decir nada (auditoría del 22-09-2026, P0). Confirmar no
    es burocracia acá: un clic por error en la fila equivocada apaga una zona entera y nadie lo
    nota hasta el cierre del mes.
  */
  const [toggling, setToggling] = useState<AdminParkingZone | null>(null);
  const [draft, setDraft] = useState<ZoneDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const query = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => apiClient.adminParking.zones() });

  function invalidate(message: TranslationKey): void {
    setError(null);
    setFeedback(t(message));
    void queryClient.invalidateQueries({ queryKey: ['admin', 'zones'] });
  }
  function onFailure(err: unknown): void {
    setFeedback(null);
    // The one refusal an administrator can act on is a code that is already somebody's; anything
    // else is stated generically rather than as a code nobody can do anything with.
    setError(
      err instanceof ApiError && err.code === 'PARKING_ZONE_CODE_TAKEN'
        ? t('admin.zones.error.codeTaken')
        : t('admin.zones.error.generic'),
    );
  }

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.adminParking.createZone({
        code: draft.code.trim(),
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
      }),
    onSuccess: () => {
      setCreating(false);
      setDraft(EMPTY_DRAFT);
      invalidate('admin.zones.created');
    },
    onError: onFailure,
  });

  const updateMutation = useMutation({
    mutationFn: (zone: AdminParkingZone) =>
      apiClient.adminParking.updateZone(zone.id, {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        divisionId: zone.divisionId ?? undefined,
        active: zone.active,
      }),
    onSuccess: () => {
      setEditing(null);
      invalidate('admin.zones.updated');
    },
    onError: onFailure,
  });

  const toggleMutation = useMutation({
    mutationFn: (zone: AdminParkingZone) =>
      apiClient.adminParking.updateZone(zone.id, {
        name: zone.name,
        description: zone.description ?? undefined,
        divisionId: zone.divisionId ?? undefined,
        active: !zone.active,
      }),
    onSuccess: () => invalidate('admin.zones.updated'),
    onError: onFailure,
  });

  return (
    <AdminShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1>{t('admin.zones.title')}</h1>
        <RequirePermission permission="TENANT_MANAGE">
          <Button
            type="button"
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setCreating(true);
            }}
          >
            {t('admin.zones.create')}
          </Button>
        </RequirePermission>
      </div>
      <p className="lx-text-meta">{t('admin.zones.description')}</p>

      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.zones.empty')}
        rows={query.data ?? []}
        rowKey={(zone) => zone.id}
        columns={[
          {
            key: 'zone',
            header: t('admin.zones.column.zone'),
            render: (zone) => (
              <>
                <div>
                  <strong>{zone.code}</strong> — {zone.name}
                </div>
                {zone.description ? <div className="lx-text-meta">{zone.description}</div> : null}
              </>
            ),
          },
          {
            key: 'spaces',
            header: t('admin.zones.column.spaces'),
            render: (zone) => tPlural('admin.zones.spaceCount', zone.spaceCount),
          },
          {
            key: 'status',
            header: t('admin.zones.column.status'),
            render: (zone) => (
              <Badge tone={zone.active ? 'success' : 'neutral'}>
                {t(zone.active ? 'admin.zones.status.active' : 'admin.zones.status.inactive')}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: t('admin.staff.column.actions'),
            render: (zone) => (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button type="button" variant="secondary" onClick={() => navigate(`/spaces?zone=${zone.id}`)}>
                  {t('admin.zones.action.spaces')}
                </Button>
                <RequirePermission permission="TENANT_MANAGE">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDraft({ code: zone.code, name: zone.name, description: zone.description ?? '' });
                      setEditing(zone);
                    }}
                  >
                    {t('admin.zones.edit')}
                  </Button>
                  {/* The hours and the maximum stay of THIS zone (v0.31) — the two levers that
                      actually manage rotation, and until now the same number for the whole canton. */}
                  <Button type="button" variant="secondary" onClick={() => setRulesFor(zone)}>
                    {t('admin.zones.action.rules')}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setToggling(zone)}>
                    {t(zone.active ? 'admin.zones.action.deactivate' : 'admin.zones.action.activate')}
                  </Button>
                </RequirePermission>
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('admin.zones.create')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          <FormField label={t('admin.zones.field.code')} hint={t('admin.zones.field.codeHint')}>
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                value={draft.code}
                autoCapitalize="characters"
                maxLength={32}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, code: e.target.value }))}
              />
            )}
          </FormField>
          <FormField label={t('admin.zones.field.name')}>
            {({ inputId }) => (
              <Input
                id={inputId}
                value={draft.name}
                maxLength={120}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            )}
          </FormField>
          <FormField label={t('admin.zones.field.description')}>
            {({ inputId }) => (
              <Input
                id={inputId}
                value={draft.description}
                maxLength={500}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
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
              disabled={!draft.code.trim() || !draft.name.trim()}
              onClick={() => createMutation.mutate()}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t('admin.zones.edit')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
          {/* The code is shown and not editable — the sentence under it says why, where the
              administrator would otherwise go looking for the field. */}
          <FormField label={t('admin.zones.field.code')} hint={t('admin.zones.field.codeFixed')}>
            {({ inputId, describedBy }) => (
              <Input id={inputId} aria-describedby={describedBy} value={draft.code} disabled readOnly />
            )}
          </FormField>
          <FormField label={t('admin.zones.field.name')}>
            {({ inputId }) => (
              <Input
                id={inputId}
                value={draft.name}
                maxLength={120}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            )}
          </FormField>
          <FormField label={t('admin.zones.field.description')}>
            {({ inputId }) => (
              <Input
                id={inputId}
                value={draft.description}
                maxLength={500}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
              />
            )}
          </FormField>
          <div className="lx-dialog-actions">
            <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              fullWidth
              loading={updateMutation.isPending}
              disabled={!draft.name.trim()}
              onClick={() => editing && updateMutation.mutate(editing)}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
      <ZoneRulesDialog
        zoneId={rulesFor?.id ?? null}
        zoneName={rulesFor ? `${rulesFor.code} — ${rulesFor.name}` : ''}
        onClose={() => setRulesFor(null)}
      />
      {/*
        El mismo diálogo para activar y desactivar: el texto cambia, el patrón no. Desactivar va en
        tono `danger` porque saca la zona de servicio; activar es un guardado corriente.
      */}
      <ConfirmDialog
        open={toggling !== null}
        onClose={() => setToggling(null)}
        title={t(toggling?.active ? 'admin.zones.deactivate.title' : 'admin.zones.activate.title')}
        message={t(toggling?.active ? 'admin.zones.deactivate.body' : 'admin.zones.activate.body')}
        changes={
          toggling
            ? [
                {
                  label: t('admin.zones.field.state'),
                  before: t(toggling.active ? 'admin.zones.state.active' : 'admin.zones.state.inactive'),
                  after: t(toggling.active ? 'admin.zones.state.inactive' : 'admin.zones.state.active'),
                },
              ]
            : undefined
        }
        tone={toggling?.active ? 'danger' : 'primary'}
        confirmLabel={t(toggling?.active ? 'admin.zones.deactivate.confirm' : 'admin.zones.activate.confirm')}
        cancelLabel={t('common.cancel')}
        closeLabel={t('common.close')}
        loading={toggleMutation.isPending}
        onConfirm={() => {
          if (!toggling) return;
          toggleMutation.mutate(toggling, { onSettled: () => setToggling(null) });
        }}
      />
    </AdminShell>
  );
}
