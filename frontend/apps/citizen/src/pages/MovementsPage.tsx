import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatDate, type TranslationKey } from '@luparx/i18n';
import { AmountText, Card, ChipGroup, EmptyState, ListRow, IconCar, IconFine, IconTopUp } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { MOCK_MOVEMENTS, type MockMovementKind } from '../mocks/parkingDomain';

type MovementFilter = 'all' | 'parking' | 'topups' | 'fines';

const ICON_BY_KIND: Record<MockMovementKind, React.ReactNode> = {
  parking: <IconCar size={18} />,
  topup: <IconTopUp size={18} />,
  fine: <IconFine size={18} />,
};

export function MovementsPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<MovementFilter>('all');

  // TODO(domain): `MOCK_MOVEMENTS` stands in for a real citizen ledger endpoint (module-parking, CONTRACT.md §4).
  const movements = useMemo(
    () =>
      MOCK_MOVEMENTS.filter((movement) => {
        if (filter === 'all') return true;
        if (filter === 'parking') return movement.kind === 'parking';
        if (filter === 'topups') return movement.kind === 'topup';
        return movement.kind === 'fine';
      }),
    [filter],
  );

  return (
    <CitizenShell title={t('citizen.movements.title')} onBack={() => navigate('/wallet')}>
      <ChipGroup
        aria-label={t('citizen.movements.title')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('citizen.movements.filter.all') },
          { value: 'parking', label: t('citizen.movements.filter.parking') },
          { value: 'topups', label: t('citizen.movements.filter.topups') },
          { value: 'fines', label: t('citizen.movements.filter.fines') },
        ]}
      />
      {movements.length === 0 ? (
        <Card>
          <EmptyState icon={<IconTopUp size={28} />} title={t('citizen.movements.empty.title')} description={t('citizen.movements.empty.description')} />
        </Card>
      ) : (
        <Card>
          {movements.map((movement) => (
            <ListRow
              key={movement.id}
              icon={ICON_BY_KIND[movement.kind]}
              title={t(movement.titleKey as TranslationKey)}
              meta={`${movement.meta} · ${formatDate(movement.occurredAt, locale)}`}
              value={<AmountText amountMinor={movement.amountMinor} currencyCode={movement.currencyCode} locale={locale} />}
            />
          ))}
        </Card>
      )}
    </CitizenShell>
  );
}
