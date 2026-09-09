import * as React from 'react';
import { useAuth } from '@luparx/auth';
import { ChangeEmailForm, ChangePasswordForm, LocaleSwitcher, ProfileForm } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import { Card, CardStack, FormField, SectionHeader } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

/**
 * "My account" for the platform portal (CONTRACT.md v0.3 §"Perfil editable"): the same personal
 * fields as registration, the e-mail behind its own verified flow, and the password behind its
 * own. There is no two-step verification section because the product has no second factor at all
 * (CONTRACT.md v0.20).
 */
export function ProfilePage(): React.JSX.Element {
  const { t } = useTranslation();
  const { me } = useAuth();

  return (
    <PlatformShell>
      <h1>{t('profile.title')}</h1>
      {me?.user ? (
        <CardStack>
          <Card>
            <SectionHeader title={t('citizen.profile.personalData.label')} />
            <ProfileForm profile={me.user} />
          </Card>
          <Card>
            <SectionHeader title={t('account.email.title')} />
            <ChangeEmailForm currentEmail={me.user.email} />
          </Card>
          <Card>
            <SectionHeader title={t('account.password.label')} />
            <ChangePasswordForm />
          </Card>
          <Card>
            <SectionHeader title={t('citizen.profile.language.label')} />
            <FormField label={t('common.languageSwitcher.label')} hint={t('account.language.meta')}>
              {({ inputId }) => <LocaleSwitcher id={inputId} />}
            </FormField>
          </Card>
        </CardStack>
      ) : (
        <p>{t('common.loading')}</p>
      )}
    </PlatformShell>
  );
}
