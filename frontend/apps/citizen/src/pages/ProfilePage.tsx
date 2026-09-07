import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDate } from '@luparx/i18n';
import { Alert, Badge, Button, Card, IconChevronRight, IconFine, IconLogout, IconWallet, ListRow } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';

export function ProfilePage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { me, apiClient, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSetupMfa(): Promise<void> {
    setError(null);
    try {
      const result = await apiClient.session.mfaSetup();
      setOtpauthUri(result.otpauthUri);
    } catch {
      setError(t('common.error.generic'));
    }
  }

  async function handleDisableMfa(): Promise<void> {
    setError(null);
    try {
      // A full flow collects a fresh TOTP code first; simplified here for the v0.1 stub.
      await apiClient.session.mfaDisable({ code: '000000' });
      await refreshProfile();
    } catch {
      setError(t('common.error.generic'));
    }
  }

  return (
    <CitizenShell title={t('profile.title')} onBack={() => navigate('/')}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {me ? (
        <Card>
          <ListRow
            title={`${me.user.givenName} ${me.user.familyName}`}
            meta={me.user.email}
            value={me.user.emailVerified ? <Badge tone="success">{t('profile.verifiedBadge')}</Badge> : undefined}
          />
          <ListRow title={t('user.field.birthDate')} value={formatDate(me.user.birthDate, locale)} />
          {me.activeTenant ? <ListRow title={t('profile.activeTenant')} value={me.activeTenant.name} /> : null}
        </Card>
      ) : null}

      <Card>
        <ListRow icon={<IconFine size={18} />} title={t('nav.fines')} onClick={() => navigate('/fines')} value={<IconChevronRight size={16} />} />
        <ListRow icon={<IconWallet size={18} />} title={t('citizen.movements.title')} onClick={() => navigate('/movements')} value={<IconChevronRight size={16} />} />
      </Card>

      <Card>
        <p className="lx-text-card-title" style={{ margin: '0 0 var(--lx-space-3) 0' }}>
          {me?.user.mfaEnabled ? t('profile.mfa.enabled') : t('profile.mfa.disabled')}
        </p>
        {me?.user.mfaEnabled ? (
          <Button type="button" variant="secondary" onClick={handleDisableMfa}>
            {t('auth.mfa.title')}
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={handleSetupMfa}>
            {t('profile.mfa.setup')}
          </Button>
        )}
        {otpauthUri ? <p style={{ wordBreak: 'break-all', marginTop: 'var(--lx-space-2)' }} className="lx-text-meta">{otpauthUri}</p> : null}
      </Card>

      <Button type="button" variant="ghost" onClick={() => logout()}>
        <IconLogout size={18} /> {t('auth.logout.action')}
      </Button>
    </CitizenShell>
  );
}
