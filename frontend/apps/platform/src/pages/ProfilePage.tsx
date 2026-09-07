import * as React from 'react';
import { useState } from 'react';
import { useAuth } from '@luparx/auth';
import { useTranslation, formatDate } from '@luparx/i18n';
import { Alert, Badge, Button } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

export function ProfilePage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { me } = useAuth();
  const [error] = useState<string | null>(null);

  return (
    <PlatformShell>
      <h1>{t('profile.title')}</h1>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {me ? (
        <dl>
          <dt>{t('user.field.givenName')}</dt>
          <dd>
            {me.user.givenName} {me.user.familyName}
          </dd>
          <dt>{t('user.field.email')}</dt>
          <dd>{me.user.email}</dd>
          <dt>{t('user.field.birthDate')}</dt>
          <dd>{formatDate(me.user.birthDate, locale)}</dd>
        </dl>
      ) : null}
      <section>
        {/* `platform` requires MFA active to complete login (CONTRACT.md §0/§3) — never offered as optional here. */}
        <Badge tone={me?.user.mfaEnabled ? 'success' : 'danger'}>
          {me?.user.mfaEnabled ? t('profile.mfa.enabled') : t('profile.mfa.disabled')}
        </Badge>
        {!me?.user.mfaEnabled ? (
          <p className="lx-field__hint">{t('auth.login.mfaMandatoryNotice')}</p>
        ) : null}
        <Button type="button" variant="secondary" disabled>
          {t('profile.mfa.setup')}
        </Button>
      </section>
    </PlatformShell>
  );
}
