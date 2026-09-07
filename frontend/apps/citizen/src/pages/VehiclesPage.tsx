import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@luparx/i18n';
import { Badge, Button, Card, EmptyState, IconCar } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { MOCK_VEHICLES } from '../mocks/parkingDomain';

export function VehiclesPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // TODO(domain): `MOCK_VEHICLES` stands in for `/api/v1/citizen/vehicles` (CONTRACT.md §4).
  const vehicles = MOCK_VEHICLES;

  return (
    <CitizenShell title={t('citizen.vehicles.title')} onBack={() => navigate('/')}>
      <Button type="button" fullWidth>
        {t('citizen.vehicles.addCta')}
      </Button>
      {vehicles.length === 0 ? (
        <Card>
          <EmptyState icon={<IconCar size={28} />} title={t('citizen.vehicles.empty.title')} description={t('citizen.vehicles.empty.description')} />
        </Card>
      ) : (
        <Card>
          {vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--lx-space-3) 0',
                borderBottom: '1px solid var(--lx-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-3)' }}>
                <span className="lx-list-row__icon">
                  <IconCar size={18} />
                </span>
                <div>
                  <p className="lx-list-row__title" style={{ margin: 0 }}>
                    {vehicle.plate}
                  </p>
                  <p className="lx-list-row__meta" style={{ margin: 0 }}>
                    {vehicle.label}
                  </p>
                </div>
              </div>
              <Badge tone="success">{t('profile.verifiedBadge')}</Badge>
            </div>
          ))}
        </Card>
      )}
    </CitizenShell>
  );
}
