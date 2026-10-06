import * as React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import type { PlatformRegisteredUsersGroupBy } from '@luparx/api-client';
import { Select, Table } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

/**
 * Las agrupaciones que ESTE servidor implementa (06-10-2026).
 *
 * <p>Había cuatro, y `portal` no es una de ellas: la plataforma contesta 501 a esa, porque agrupar
 * por portal es una pregunta de una municipalidad, no de la plataforma. Ofrecer una opción que el
 * servidor rechaza es pedirle a alguien que descubra por su cuenta cuál de las cuatro funciona.</p>
 */
const GROUP_BY_OPTIONS: PlatformRegisteredUsersGroupBy[] = ['tenant', 'country', 'month'];

export function ReportsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const [groupBy, setGroupBy] = useState<PlatformRegisteredUsersGroupBy>('tenant');

  const query = useQuery({
    queryKey: ['platform', 'reports', 'registered-users', groupBy],
    queryFn: () => apiClient.platformReports.registeredUsers({ groupBy }),
  });

  return (
    <PlatformShell>
      <h1>{t('admin.reports.registeredUsers.title')}</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <Select
          aria-label={t('admin.reports.registeredUsers.groupBy')}
          value={groupBy}
          onChange={(value) => setGroupBy(value as PlatformRegisteredUsersGroupBy)}
          options={GROUP_BY_OPTIONS.map((option) => ({
            value: option,
            label: t(`admin.reports.registeredUsers.groupBy.${option}` as TranslationKey),
          }))}
        />
      </div>
      <Table
        loading={query.isLoading}
        loadingLabel={t('common.loading')}
        emptyLabel={t('admin.reports.registeredUsers.empty')}
        /*
          `.rows`, no la respuesta entera.

          El servidor devuelve `{ groupBy, rows }` y el cliente lo declaraba como una lista. Como el
          objeto no es nulo, el `?? []` nunca se activaba y la tabla hacía `.map` sobre un objeto:
          «t.map is not a function», y el ErrorBoundary se comía la pantalla ENTERA. Esta pantalla
          no funcionó nunca; se encontró el 06-10-2026 con el arnés de la paleta.
        */
        rows={query.data?.rows ?? []}
        rowKey={(row) => row.group}
        columns={[
          { key: 'group', header: t('admin.reports.registeredUsers.column.group'), render: (row) => row.group },
          { key: 'count', header: t('admin.reports.registeredUsers.column.count'), render: (row) => row.count },
        ]}
      />
    </PlatformShell>
  );
}
