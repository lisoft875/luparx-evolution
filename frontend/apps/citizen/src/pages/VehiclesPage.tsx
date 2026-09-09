import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
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
  Select,
} from '@luparx/ui';
import type { CreateVehicleRequest, Vehicle } from '@luparx/api-client';
import { CitizenShell } from '../components/CitizenShell';
import { QueryBoundary } from '../components/QueryBoundary';
import { vehicleDeleteErrorMessage, vehiclePlateError, vehicleSaveErrorMessage } from '../lib/apiErrors';
import { normalizePlate } from '../lib/plate';
import { catalogLabeller, vehicleDescriptor } from '../lib/vehiclePresentation';
import {
  useActiveParkingSessions,
  useCreateVehicle,
  useDeleteVehicle,
  useSetPrimaryVehicle,
  useUpdateVehicle,
  useVehicleColorCatalog,
  useVehicleTypeCatalog,
  useVehicles,
} from '../lib/queries';

interface VehicleFormState {
  plate: string;
  name: string;
  brand: string;
  model: string;
  year: string;
  /** Catalog key. Never a literal in this file — see `DEFAULT_VEHICLE_TYPE`. */
  type: string;
  color: string;
  isOwner: boolean;
}

/**
 * The type the server itself defaults to when a client omits it. Written down once, here, because
 * a form has to preselect *something* before the catalog answers; the moment the catalog arrives,
 * this is only used if it actually lists this key.
 */
const DEFAULT_VEHICLE_TYPE = 'CAR';

const EMPTY_FORM: VehicleFormState = {
  plate: '',
  name: '',
  brand: '',
  model: '',
  year: '',
  type: DEFAULT_VEHICLE_TYPE,
  color: '',
  isOwner: false,
};

function formFromVehicle(vehicle: Vehicle): VehicleFormState {
  return {
    plate: vehicle.plate,
    name: vehicle.name ?? '',
    brand: vehicle.brand ?? '',
    model: vehicle.model ?? '',
    year: vehicle.year ? String(vehicle.year) : '',
    type: vehicle.type || DEFAULT_VEHICLE_TYPE,
    color: vehicle.color ?? '',
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
    type: form.type,
    // An empty pick means "did not say", which is a value the server accepts — not the string "".
    color: form.color || undefined,
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
  const tKey = (key: string): string => t(key as Parameters<typeof t>[0]);
  const vehiclesQuery = useVehicles();
  const typeCatalogQuery = useVehicleTypeCatalog();
  const colorCatalogQuery = useVehicleColorCatalog();
  const typeOf = catalogLabeller(typeCatalogQuery.data, tKey);
  const colorOf = catalogLabeller(colorCatalogQuery.data, tKey);
  const { data: activeSessions } = useActiveParkingSessions();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const setPrimaryVehicle = useSetPrimaryVehicle();
  const deleteVehicle = useDeleteVehicle();

  // undefined = form closed · null = add mode · Vehicle = edit mode
  const [formVehicle, setFormVehicle] = useState<Vehicle | null | undefined>(undefined);
  const [form, setForm] = useState<VehicleFormState>(EMPTY_FORM);
  const [plateError, setPlateError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [menuVehicle, setMenuVehicle] = useState<Vehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const activeVehicleIds = useMemo(
    () => new Set((activeSessions ?? []).map((session) => session.vehicleId)),
    [activeSessions],
  );

  /**
   * A new vehicle starts as a car because that is what the server defaults to — but only if this
   * platform still calls it `CAR`. Once the catalog has answered, an add form holding a key the
   * catalog does not list falls back to the first type it does, so the form can never submit a
   * type this deployment would reject. An *edit* form is left alone: the value came from the
   * server and belongs to the record, whatever the catalog currently lists.
   */
  useEffect(() => {
    const types = typeCatalogQuery.data;
    if (!types || types.length === 0 || formVehicle !== null) return;
    if (types.some((entry) => entry.value === form.type)) return;
    setForm((f) => ({ ...f, type: types[0]!.value }));
  }, [typeCatalogQuery.data, formVehicle, form.type]);

  function openAdd(): void {
    setForm(EMPTY_FORM);
    setPlateError(undefined);
    setSaveError(null);
    setFormVehicle(null);
  }

  function openEdit(vehicle: Vehicle): void {
    setForm(formFromVehicle(vehicle));
    setPlateError(undefined);
    setSaveError(null);
    setMenuVehicle(null);
    setFormVehicle(vehicle);
  }

  function closeForm(): void {
    setFormVehicle(undefined);
  }

  async function handleSubmit(): Promise<void> {
    setPlateError(undefined);
    setSaveError(null);
    const payload = toCreateRequest(form);
    try {
      if (formVehicle) {
        await updateVehicle.mutateAsync({ id: formVehicle.id, payload });
      } else {
        await createVehicle.mutateAsync(payload);
      }
      closeForm();
    } catch (error) {
      // A rejected plate belongs next to the plate field; anything else is not about that input
      // and must not be reported as if it were — it goes above the form, carrying the server's
      // stable code and traceId so a report can be looked up instead of reproduced.
      const plateMessage = vehiclePlateError(error, t);
      if (plateMessage) setPlateError(plateMessage);
      else setSaveError(vehicleSaveErrorMessage(error, t));
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
      setDeleteError(vehicleDeleteErrorMessage(error, t));
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

      <QueryBoundary
        query={vehiclesQuery}
        errorTitle={t('citizen.vehicles.title')}
        isEmpty={(list) => list.length === 0}
        empty={
          <Card>
            <EmptyState
              icon={<IconCar size={28} />}
              title={t('citizen.vehicles.empty.title')}
              description={t('citizen.vehicles.empty.description')}
            />
          </Card>
        }
      >
        {(vehicles) => (
        <CardStack>
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--lx-space-3)' }}>
                <p className="lx-text-amount-lg" style={{ margin: 0 }}>
                  {vehicle.plate}
                </p>
                <div style={{ display: 'flex', gap: 'var(--lx-space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {/* What kind of vehicle it is, in words. A motorcycle and a car are charged and
                      enforced differently, so it belongs where the plate is, not buried in a form. */}
                  {typeOf(vehicle.type) ? <Badge tone="neutral">{typeOf(vehicle.type)}</Badge> : null}
                  {activeVehicleIds.has(vehicle.id) ? <Badge tone="info">{t('citizen.vehicles.activeSessionBadge')}</Badge> : null}
                  {vehicle.isPrimary ? <Badge tone="success">{t('citizen.vehicles.primaryBadge')}</Badge> : null}
                </div>
              </div>
              {/* "Toyota Yaris · Gris · 2015" — the colour is a word in this line and nothing
                  more; no part of the card is ever painted with the colour of the car. */}
              <p className="lx-text-meta" style={{ margin: 'var(--lx-space-1) 0 var(--lx-space-3) 0' }}>
                {vehicleDescriptor(vehicle, { includeName: true, colorLabel: colorOf(vehicle.color) })}
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
        )}
      </QueryBoundary>

      <Modal
        open={formVehicle !== undefined}
        onClose={closeForm}
        title={formVehicle ? t('citizen.vehicles.form.title.edit') : t('citizen.vehicles.form.title.add')}
        closeLabel={t('common.close')}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {saveError ? <Alert tone="danger">{saveError}</Alert> : null}
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
          {/* Both lists are the server's (`/catalog/vehicle-types`, `/catalog/vehicle-colors`),
              translated from the `labelKey` each entry carries. Neither is written down here, so a
              type the platform adds tomorrow appears without a release of this app. */}
          <QueryBoundary query={typeCatalogQuery} errorTitle={t('citizen.vehicles.form.typeLabel')}>
            {(types) => (
              <FormField label={t('citizen.vehicles.form.typeLabel')}>
                {({ inputId }) => (
                  <Select
                    id={inputId}
                    value={form.type}
                    onChange={(value) => setForm((f) => ({ ...f, type: value }))}
                    options={types.map((entry) => ({ value: entry.value, label: tKey(entry.labelKey) }))}
                  />
                )}
              </FormField>
            )}
          </QueryBoundary>
          <QueryBoundary query={colorCatalogQuery} errorTitle={t('citizen.vehicles.form.colorLabel')}>
            {(colors) => (
              <FormField label={t('citizen.vehicles.form.colorLabel')} optionalLabel={t('common.optional')}>
                {({ inputId }) => (
                  <Select
                    id={inputId}
                    value={form.color}
                    onChange={(value) => setForm((f) => ({ ...f, color: value }))}
                    options={[
                      { value: '', label: t('citizen.vehicles.form.colorUnset') },
                      ...colors.map((entry) => ({ value: entry.value, label: tKey(entry.labelKey) })),
                    ]}
                  />
                )}
              </FormField>
            )}
          </QueryBoundary>
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
          <div className="lx-dialog-actions">
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
