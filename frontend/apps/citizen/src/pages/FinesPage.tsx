import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatDate, type TranslationKey } from '@luparx/i18n';
import { AmountText, Card, ChipGroup, EmptyState, ListRow, IconFine } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { MOCK_FINES } from '../mocks/parkingDomain';

type FinesTab = 'pending' | 'history';

export function FinesPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<FinesTab>('pending');

  // TODO(domain): `MOCK_FINES` stands in for the citations/fines side of `module-parking` once it
  // ships a citizen-facing read endpoint (CONTRACT.md §4 "Dominio parquímetros").
  const fines = useMemo(
    () => MOCK_FINES.filter((fine) => (tab === 'pending' ? fine.status === 'PENDING' : fine.status === 'PAID')),
    [tab],
  );

  return (
    <CitizenShell title={t('citizen.fines.title')} onBack={() => navigate('/')}>
      <ChipGroup
        aria-label={t('citizen.fines.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: t('citizen.fines.tab.pending') },
          { value: 'history', label: t('citizen.fines.tab.history') },
        ]}
      />
      {fines.length === 0 ? (
        <Card>
          <EmptyState icon={<IconFine size={28} />} title={t('citizen.fines.empty.title')} description={t('citizen.fines.empty.description')} />
        </Card>
      ) : (
        <Card>
          {fines.map((fine) => (
            <ListRow
              key={fine.id}
              icon={<IconFine size={18} />}
              title={t(fine.reasonKey as TranslationKey)}
              meta={`${fine.plate} · ${t('citizen.fines.dueLabel')} ${formatDate(fine.dueAt, locale)}`}
              value={<AmountText amountMinor={-fine.amountMinor} currencyCode={fine.currencyCode} locale={locale} />}
            />
          ))}
        </Card>
      )}
    </CitizenShell>
  );
}
