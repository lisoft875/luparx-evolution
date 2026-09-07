import * as React from 'react';
import { useState } from 'react';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button } from '@luparx/ui';

export interface TenantSelectorProps {
  onSelected: () => void;
}

/** Shown when the account has more than one ACTIVE membership for this portal (CONTRACT.md §4 `POST /session/tenant`). */
export function TenantSelector({ onSelected }: TenantSelectorProps): React.JSX.Element {
  const { t } = useTranslation();
  const { memberships, switchTenant } = useAuth();
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeMemberships = memberships.filter((membership) => membership.status === 'ACTIVE');

  async function handleSelect(tenantId: string): Promise<void> {
    setPendingTenantId(tenantId);
    setError(null);
    try {
      await switchTenant(tenantId);
      onSelected();
    } catch {
      setError(t('common.error.generic'));
    } finally {
      setPendingTenantId(null);
    }
  }

  return (
    <div>
      <h1>{t('tenant.selector.title')}</h1>
      <p>{t('tenant.selector.description')}</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {activeMemberships.length === 0 ? (
        <Alert tone="info">{t('tenant.selector.noneAvailable')}</Alert>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeMemberships.map((membership) => (
            <li key={membership.tenantId}>
              <Button
                type="button"
                variant="secondary"
                fullWidth
                loading={pendingTenantId === membership.tenantId}
                onClick={() => handleSelect(membership.tenantId)}
              >
                {membership.tenantName}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
