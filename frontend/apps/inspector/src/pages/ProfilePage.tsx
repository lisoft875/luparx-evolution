import * as React from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDate } from '@luparx/i18n';
import { Alert, Button, PageLayout } from '@luparx/ui';

export function ProfilePage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { me, apiClient, refreshProfile } = useAuth();
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
      // In a full flow this collects a fresh TOTP code first; simplified here for the v0.1 stub.
      await apiClient.session.mfaDisable({ code: '000000' });
      await refreshProfile();
    } catch {
      setError(t('common.error.generic'));
    }
  }

  return (
    <PageLayout header={<Link to="/">{t('nav.home')}</Link>}>
      <h1>{t('profile.title')}</h1>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {me ? (
        <dl>
          <dt>{t('user.field.givenName')}</dt>
          <dd>{me.user.givenName}</dd>
          <dt>{t('user.field.email')}</dt>
          <dd>{me.user.email}</dd>
          <dt>{t('user.field.birthDate')}</dt>
          <dd>{formatDate(me.user.birthDate, locale)}</dd>
        </dl>
      ) : null}
      <section>
        <h2>{me?.user.mfaEnabled ? t('profile.mfa.enabled') : t('profile.mfa.disabled')}</h2>
        {me?.user.mfaEnabled ? (
          <Button type="button" variant="secondary" onClick={handleDisableMfa}>
            {t('auth.mfa.title')}
          </Button>
        ) : (
          <Button type="button" onClick={handleSetupMfa}>
            {t('profile.mfa.setup')}
          </Button>
        )}
        {otpauthUri ? <p style={{ wordBreak: 'break-all' }}>{otpauthUri}</p> : null}
      </section>
    </PageLayout>
  );
}
