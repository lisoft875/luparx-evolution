import * as React from 'react';
import { useAuth } from '@luparx/auth';
import { ChangeEmailForm, ChangePasswordForm, LocaleSwitcher, ProfileForm } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import { Alert, Badge, Button, Card, CardStack, IconGlobe, IconLogout, SectionHeader } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';

/**
 * The whole account on one screen: personal data, identity document, phone, address, e-mail,
 * password and language, each editable where it is read.
 *
 * <p>What this replaced was an index of an index. "Mi cuenta" listed seven rows whose only content
 * was the name of another screen, every one of them leading to the same second screen, where the
 * e-mail and the password were then hidden behind two more buttons. Changing a phone number cost a
 * navigation, a load, a save and a trip back, and nothing on the first screen was ever editable —
 * the rows existed to say where to go next.</p>
 *
 * <p>The e-mail and the password keep their own confirmation, because they change the key to the
 * account rather than a field on it: a new address has to prove it is reachable before it replaces
 * the current one, and a password change asks for the current password and ends every other
 * session. That is a consequence worth stating in the form — but it is not a reason to make the
 * person go looking for the form.</p>
 */
export function ProfilePage(): React.JSX.Element {
  const { t } = useTranslation();
  const { me, status, logout } = useAuth();
  const profile = me?.user;

  // No loading dead end: the profile is either still arriving, or missing because the session
  // could not be restored — and the second case needs a way out rather than a spinner forever.
  if (!profile) {
    return (
      <CitizenShell bare heading={<h1 className="lx-text-screen-title">{t('citizen.profile.title')}</h1>}>
        {status === 'loading' ? (
          <p className="lx-text-meta">{t('common.loading')}</p>
        ) : (
          <Alert tone="danger">
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)', alignItems: 'flex-start' }}
            >
              <span>{t('citizen.profile.loadError')}</span>
              <Button type="button" variant="secondary" onClick={() => logout()}>
                {t('auth.logout.action')}
              </Button>
            </div>
          </Alert>
        )}
      </CitizenShell>
    );
  }

  return (
    <CitizenShell bare heading={<h1 className="lx-text-screen-title">{t('citizen.profile.title')}</h1>}>
      <CardStack>
        {/* Name, identity document, phone, nationality, birth date and address are one record and
            are edited as one form — the same fields, in the same order, as registration. */}
        <Card>
          <SectionHeader
            title={t('citizen.profile.personalData.label')}
            description={t('citizen.profile.personalData.description')}
          />
          <ProfileForm profile={profile} />
        </Card>

        <Card>
          <SectionHeader title={t('user.field.email')} description={t('account.email.meta')} />
          <p className="lx-text-body" style={{ margin: '0 0 var(--lx-space-3) 0' }}>
            <span style={{ marginInlineEnd: 'var(--lx-space-2)' }}>{profile.email}</span>
            {profile.emailVerified ? <Badge tone="success">{t('profile.verifiedBadge')}</Badge> : null}
          </p>
          <ChangeEmailForm currentEmail={profile.email} />
        </Card>

        <Card>
          <SectionHeader title={t('citizen.profile.security.label')} description={t('account.password.meta')} />
          <ChangePasswordForm onSignedOut={() => logout()} />
        </Card>

        <Card>
          <SectionHeader title={t('citizen.profile.language.label')} description={t('account.language.meta')} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-3)' }}>
            <span className="lx-list-row__icon" aria-hidden="true">
              <IconGlobe size={18} />
            </span>
            <LocaleSwitcher />
          </div>
        </Card>
      </CardStack>

      <Button type="button" variant="ghost" onClick={() => logout()}>
        <IconLogout size={18} /> {t('auth.logout.action')}
      </Button>
    </CitizenShell>
  );
}
