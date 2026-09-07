import * as React from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { ChipGroup, Button, Input, Select, Table } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

type CatalogTab = 'countries' | 'adminLevels' | 'divisions' | 'documentTypes';

function CountriesTab(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['platform', 'catalog', 'countries'], queryFn: () => apiClient.platformCatalog.countries() });

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [dialCode, setDialCode] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('');
  const [defaultLocale, setDefaultLocale] = useState('');
  const [defaultTimeZone, setDefaultTimeZone] = useState('');

  const upsertMutation = useMutation({
    mutationFn: () =>
      apiClient.platformCatalog.upsertCountry({
        code: code.toUpperCase(),
        name,
        dialCode,
        defaultCurrency: defaultCurrency.toUpperCase(),
        defaultLocale,
        defaultTimeZone,
        active: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'catalog', 'countries'] });
      setCode('');
      setName('');
      setDialCode('');
      setDefaultCurrency('');
      setDefaultLocale('');
      setDefaultTimeZone('');
    },
  });

  return (
    <>
      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('common.empty')}
        rows={query.data ?? []}
        rowKey={(row) => row.code}
        columns={[
          { key: 'code', header: t('platform.catalogs.countries.column.code'), render: (row) => row.code },
          { key: 'name', header: t('platform.catalogs.countries.column.name'), render: (row) => row.name },
          { key: 'dialCode', header: t('platform.catalogs.countries.column.dialCode'), render: (row) => row.dialCode },
          { key: 'currency', header: t('platform.catalogs.countries.column.currency'), render: (row) => row.defaultCurrency },
          { key: 'locale', header: t('platform.catalogs.countries.column.locale'), render: (row) => row.defaultLocale },
          { key: 'timeZone', header: t('platform.catalogs.countries.column.timeZone'), render: (row) => row.defaultTimeZone },
        ]}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <Input placeholder={t('platform.catalogs.countries.column.code')} value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 80 }} />
        <Input placeholder={t('platform.catalogs.countries.column.name')} value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder={t('platform.catalogs.countries.column.dialCode')} value={dialCode} onChange={(e) => setDialCode(e.target.value)} style={{ width: 100 }} />
        <Input placeholder={t('platform.catalogs.countries.column.currency')} value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} style={{ width: 90 }} />
        <Input placeholder={t('platform.catalogs.countries.column.locale')} value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value)} style={{ width: 100 }} />
        <Input placeholder={t('platform.catalogs.countries.column.timeZone')} value={defaultTimeZone} onChange={(e) => setDefaultTimeZone(e.target.value)} />
        <Button type="button" onClick={() => upsertMutation.mutate()} loading={upsertMutation.isPending} disabled={!code || !name}>
          {t('common.save')}
        </Button>
      </div>
    </>
  );
}

function CountryScopedTab({ tab }: { tab: 'adminLevels' | 'divisions' | 'documentTypes' }): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const [countryCode, setCountryCode] = useState('CR');

  const countriesQuery = useQuery({ queryKey: ['platform', 'catalog', 'countries'], queryFn: () => apiClient.platformCatalog.countries() });
  const adminLevelsQuery = useQuery({
    queryKey: ['platform', 'catalog', 'admin-levels', countryCode],
    queryFn: () => apiClient.platformCatalog.adminLevels(countryCode),
    enabled: tab === 'adminLevels',
  });
  const divisionsQuery = useQuery({
    queryKey: ['platform', 'catalog', 'divisions', countryCode],
    queryFn: () => apiClient.platformCatalog.divisions(countryCode, {}),
    enabled: tab === 'divisions',
  });
  const documentTypesQuery = useQuery({
    queryKey: ['platform', 'catalog', 'document-types', countryCode],
    queryFn: () => apiClient.platformCatalog.documentTypes(countryCode),
    enabled: tab === 'documentTypes',
  });

  return (
    <>
      <div style={{ marginBottom: 16, maxWidth: 260 }}>
        <Select
          aria-label={t('platform.catalogs.selectCountry')}
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          options={(countriesQuery.data ?? []).map((c) => ({ value: c.code, label: `${c.flagEmoji} ${c.name}`.trim() }))}
        />
      </div>
      {tab === 'adminLevels' ? (
        <Table
          loading={adminLevelsQuery.isLoading}
          loadingLabel={t('common.loading')}
          emptyLabel={t('common.empty')}
          rows={adminLevelsQuery.data ?? []}
          rowKey={(row) => String(row.level)}
          columns={[
            { key: 'level', header: t('platform.catalogs.adminLevels.column.level'), render: (row) => row.level },
            { key: 'labelKey', header: t('platform.catalogs.adminLevels.column.labelKey'), render: (row) => row.labelKey },
            { key: 'required', header: t('platform.catalogs.adminLevels.column.required'), render: (row) => (row.required ? t('common.yes') : t('common.no')) },
          ]}
        />
      ) : null}
      {tab === 'divisions' ? (
        <Table
          loading={divisionsQuery.isLoading}
          loadingLabel={t('common.loading')}
          emptyLabel={t('common.empty')}
          rows={divisionsQuery.data ?? []}
          rowKey={(row) => row.id}
          columns={[
            { key: 'code', header: t('platform.catalogs.divisions.column.code'), render: (row) => row.code },
            { key: 'name', header: t('platform.catalogs.divisions.column.name'), render: (row) => row.name },
            { key: 'level', header: t('platform.catalogs.divisions.column.level'), render: (row) => row.level },
          ]}
        />
      ) : null}
      {tab === 'documentTypes' ? (
        <Table
          loading={documentTypesQuery.isLoading}
          loadingLabel={t('common.loading')}
          emptyLabel={t('common.empty')}
          rows={documentTypesQuery.data ?? []}
          rowKey={(row) => row.type}
          columns={[
            { key: 'type', header: t('platform.catalogs.documentTypes.column.type'), render: (row) => row.type },
            { key: 'pattern', header: t('platform.catalogs.documentTypes.column.pattern'), render: (row) => row.pattern },
            { key: 'example', header: t('platform.catalogs.documentTypes.column.example'), render: (row) => row.example },
          ]}
        />
      ) : null}
    </>
  );
}

export function CatalogsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CatalogTab>('countries');

  return (
    <PlatformShell>
      <h1>{t('platform.catalogs.title')}</h1>
      <ChipGroup
        aria-label={t('platform.catalogs.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'countries', label: t('platform.catalogs.tab.countries') },
          { value: 'adminLevels', label: t('platform.catalogs.tab.adminLevels') },
          { value: 'divisions', label: t('platform.catalogs.tab.divisions') },
          { value: 'documentTypes', label: t('platform.catalogs.tab.documentTypes') },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        {tab === 'countries' ? <CountriesTab /> : <CountryScopedTab tab={tab} />}
      </div>
    </PlatformShell>
  );
}
