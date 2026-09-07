import * as React from 'react';
import { useTranslation } from '@luparx/i18n';
import { Badge, Button, Card, CardStack, EmptyState, IconCar, IconMore, IconPlus } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { MOCK_VEHICLES } from '../mocks/parkingDomain';

export function VehiclesPage(): React.JSX.Element {
  const { t } = useTranslation();
  // TODO(domain): `MOCK_VEHICLES` stands in for `/api/v1/citizen/vehicles` (CONTRACT.md §4).
  const vehicles = MOCK_VEHICLES;

  return (
    <CitizenShell bare>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--lx-space-3)' }}>
        <h1 className="lx-text-screen-title">{t('citizen.vehicles.title')}</h1>
        <Button type="button" variant="solid" onClick={() => undefined}>
          <IconPlus size={16} /> {t('citizen.vehicles.addCta')}
        </Button>
      </div>
      {vehicles.length === 0 ? (
        <Card>
          <EmptyState icon={<IconCar size={28} />} title={t('citizen.vehicles.empty.title')} description={t('citizen.vehicles.empty.description')} />
        </Card>
      ) : (
        <CardStack>
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--lx-space-3)' }}>
                <p className="lx-text-amount-lg" style={{ margin: 0 }}>
                  {vehicle.plate}
                </p>
                {vehicle.isPrimary ? <Badge tone="success">{t('citizen.vehicles.primaryBadge')}</Badge> : null}
              </div>
              <p className="lx-text-meta" style={{ margin: 'var(--lx-space-1) 0 var(--lx-space-3) 0' }}>
                {vehicle.brand} {vehicle.model} · {vehicle.color} · {vehicle.year}
              </p>
              <div style={{ display: 'flex', gap: 'var(--lx-space-2)' }}>
                <Button type="button" variant="secondary" onClick={() => undefined}>
                  {t('citizen.vehicles.editCta')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={t('citizen.vehicles.menuCta')}
                  style={{ paddingInline: 'var(--lx-space-3)' }}
                  onClick={() => undefined}
                >
                  <IconMore size={18} />
                </Button>
              </div>
            </Card>
          ))}
        </CardStack>
      )}
    </CitizenShell>
  );
}
