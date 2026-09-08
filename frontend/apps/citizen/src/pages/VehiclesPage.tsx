import * as React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from '@luparx/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardStack,
  Checkbox,
  EmptyState,
  FormField,
  IconCar,
  IconMore,
  IconPlus,
  Input,
  Modal,
} from '@luparx/ui';
import type { CreateVehicleRequest, Vehicle } from '@luparx/api-client';
import { CitizenShell } from '../components/CitizenShell';
import { vehicleDeleteErrorKey, vehiclePlateError } from '../lib/apiErrors';
import { normalizePlate } from '../lib/plate';
import {
  useActiveParkingSessions,
  useCreateVehicle,
  useDeleteVehicle,
  useSetPrimaryVehicle,
  useUpdateVehicle,
  useVehicles,
} from '../lib/queries';

interface VehicleFormState {
  plate: string;
  name: string;
  brand: string;
  model: string;
  year: string;
  isOwner: boolean;
}

const EMPTY_FORM: VehicleFormState = { plate: '', name: '', brand: '', model: '', year: '', isOwner: false };

function formFromVehicle(vehicle: Vehicle): VehicleFormState {
  return {
    plate: vehicle.plate,
    name: vehicle.name ?? '',
    brand: vehicle.brand ?? '',
    model: vehicle.model ?? '',
    year: vehicle.year ? String(vehicle.year) : '',
    isOwner: vehicle.isOwner,
  };
}

function toCreateRequest(form: VehicleFormState): CreateVehicleRequest {
  return {
    plate: normalizePlate(form.plate),
    name: form.name.trim() || undefined,
    brand: form.brand.trim() || undefined,
    model: form.model.trim() || undefined,
    year: form.year.trim() ? Number(form.year) : undefined,
    isOwner: form.isOwner,
  };
}

/**
 * Real CRUD against `/api/v1/citizen/vehicles` (CONTRACT.md v0.2). Only `plate` is required; the
 * server enforces per-user plate uniqueness, surfaced here next to the field (never as a global
 * error) — and rejects deleting a vehicle with an active session, surfaced in the delete dialog.
 */
export function VehiclesPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { data: vehicles } = useVehicles();
  const { data: activeSessions } = useActiveParkingSessions();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const setPrimaryVehicle = useSetPrimaryVehicle();
  const deleteVehicle = useDeleteVehicle();

  // undefined = form closed · null = add mode · Vehicle = edit mode
  const [formVehicle, setFormVehicle] = useState<Vehicle | null | undefined>(undefined);
  const [form, setForm] = useState<VehicleFormState>(EMPTY_FORM);
  const [plateError, setPlateError] = useState<string | undefined>(undefined);
  const [menuVehicle, setMenuVehicle] = useState<Vehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const activeVehicleIds = useMemo(
    () => new Set((activeSessions ?? []).map((session) => session.vehicleId)),
    [activeSessions],
  );

  function openAdd(): void {
    setForm(EMPTY_FORM);
    setPlateError(undefined);
    setFormVehicle(null);
  }

  function openEdit(vehicle: Vehicle): void {
    setForm(formFromVehicle(vehicle));
    setPlateError(undefined);
    setMenuVehicle(null);
    setFormVehicle(vehicle);
  }

  function closeForm(): void {
    setFormVehicle(undefined);
  }

  async function handleSubmit(): Promise<void> {
    setPlateError(undefined);
    const payload = toCreateRequest(form);
    try {
      if (formVehicle) {
        await updateVehicle.mutateAsync({ id: formVehicle.id, payload });
      } else {
        await createVehicle.mutateAsync(payload);
      }
      closeForm();
    } catch (error) {
      setPlateError(vehiclePlateError(error, t) ?? t('common.error.generic'));
    }
  }

  async function handleSetPrimary(vehicle: Vehicle): Promise<void> {
    setMenuVehicle(null);
    await setPrimaryVehicle.mutateAsync(vehicle.id);
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteVehicle.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(t(vehicleDeleteErrorKey(error)));
    }
  }

  const isSaving = createVehicle.isPending || updateVehicle.isPending;

  return (
    <CitizenShell bare>
      <div className="lx-page-header">
        {/* El titulo se queda en una linea: partido en dos ("Mis / vehiculos") se lee como un error. */}
        <h1 className="lx-text-screen-title lx-page-header__title">{t('citizen.vehicles.title')}</h1>
        <Button type="button" variant="solid" onClick={openAdd}>
          <IconPlus size={16} /> {t('citizen.vehicles.addCta')}
        </Button>
      </div>

      {vehicles && vehicles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconCar size={28} />}
            title={t('citizen.vehicles.empty.title')}
            description={t('citizen.vehicles.empty.description')}
          />
        </Card>
      ) : null}

      {vehicles && vehicles.length > 0 ? (
        <CardStack>
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--lx-space-3)' }}>
                <p className="lx-text-amount-lg" style={{ margin: 0 }}>
                  {vehicle.plate}
                </p>
                <div style={{ display: 'flex', gap: 'var(--lx-space-2)' }}>
                  {activeVehicleIds.has(vehicle.id) ? <Badge tone="info">{t('citizen.vehicles.activeSessionBadge')}</Badge> : null}
                  {vehicle.isPrimary ? <Badge tone="success">{t('citizen.vehicles.primaryBadge')}</Badge> : null}
                </div>
              </div>
              <p className="lx-text-meta" style={{ margin: 'var(--lx-space-1) 0 var(--lx-space-3) 0' }}>
                {[vehicle.name, [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || undefined, vehicle.year]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div style={{ display: 'flex', gap: 'var(--lx-space-2)' }}>
                <Button type="button" variant="secondary" onClick={() => openEdit(vehicle)}>
                  {t('citizen.vehicles.editCta')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={t('citizen.vehicles.menuCta')}
                  style={{ paddingInline: 'var(--lx-space-3)' }}
                  onClick={() => setMenuVehicle(vehicle)}
                >
                  <IconMore size={18} />
                </Button>
              </div>
            </Card>
          ))}
        </CardStack>
      ) : null}

      <Modal
        open={formVehicle !== undefined}
        onClose={closeForm}
        title={formVehicle ? t('citizen.vehicles.form.title.edit') : t('citizen.vehicles.form.title.add')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <FormField label={t('citizen.vehicles.form.plateLabel')} hint={t('citizen.vehicles.form.plateHint')} error={plateError}>
            {({ inputId, describedBy }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                invalid={Boolean(plateError)}
                value={form.plate}
                onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}
              />
            )}
          </FormField>
          <FormField label={t('citizen.vehicles.form.nameLabel')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <Input id={inputId} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            )}
          </FormField>
          <FormField label={t('citizen.vehicles.form.brandLabel')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <Input id={inputId} value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
            )}
          </FormField>
          <FormField label={t('citizen.vehicles.form.modelLabel')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <Input id={inputId} value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
            )}
          </FormField>
          <FormField label={t('citizen.vehicles.form.yearLabel')} optionalLabel={t('common.optional')}>
            {({ inputId }) => (
              <Input
                id={inputId}
                type="number"
                inputMode="numeric"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              />
            )}
          </FormField>
          <Checkbox
            label={t('citizen.vehicles.form.isOwnerLabel')}
            checked={form.isOwner}
            onChange={(e) => setForm((f) => ({ ...f, isOwner: e.target.checked }))}
          />
          <Button
            type="button"
            variant="primary"
            fullWidth
            loading={isSaving}
            disabled={!form.plate.trim()}
            onClick={handleSubmit}
            style={{ marginTop: 'var(--lx-space-4)' }}
          >
            {formVehicle ? t('citizen.vehicles.form.submit.edit') : t('citizen.vehicles.form.submit.add')}
          </Button>
        </div>
      </Modal>

      <Modal open={menuVehicle !== null} onClose={() => setMenuVehicle(null)} title={menuVehicle?.plate ?? ''} closeLabel={t('common.close')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)' }}>
          {menuVehicle && !menuVehicle.isPrimary ? (
            <Button type="button" variant="secondary" fullWidth onClick={() => handleSetPrimary(menuVehicle)}>
              {t('citizen.vehicles.actions.setPrimary')}
            </Button>
          ) : null}
          {menuVehicle ? (
            <Button
              type="button"
              variant="danger"
              fullWidth
              onClick={() => {
                setDeleteError(null);
                setDeleteTarget(menuVehicle);
                setMenuVehicle(null);
              }}
            >
              {t('citizen.vehicles.actions.delete')}
            </Button>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('citizen.vehicles.delete.confirmTitle')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
          {deleteError ? <Alert tone="danger">{deleteError}</Alert> : null}
          <p className="lx-text-body" style={{ margin: 0 }}>
            {t('citizen.vehicles.delete.confirmDescription', { plate: deleteTarget?.plate ?? '' })}
          </p>
          <div style={{ display: 'flex', gap: 'var(--lx-space-2)' }}>
            <Button type="button" variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="danger" fullWidth loading={deleteVehicle.isPending} onClick={handleDelete}>
              {t('citizen.vehicles.delete.confirmSubmit')}
            </Button>
          </div>
        </div>
      </Modal>
    </CitizenShell>
  );
}
