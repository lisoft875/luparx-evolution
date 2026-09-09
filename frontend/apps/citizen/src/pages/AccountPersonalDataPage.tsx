import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { ChangeEmailForm, ChangePasswordForm, ProfileForm } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import { Badge, Button, Card, CardStack, SectionHeader } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';

/**
 * Every personal datum of the account, editable where it is read (v0.6).
 *
 * <p>What this replaced was an index: "Mi cuenta" listed seven rows whose only content was the
 * name of another screen, and changing a phone number meant a navigation, a load, a save and a trip
 * back — with the e-mail and the password on two further screens of their own. Name, identity
 * document, phone and address are one record and are edited as one form; the e-mail and the
 * password are edited from this same screen, in place.</p>
 *
 * <p>They keep their own confirmation because they change the key to the account, not a field on
 * it: a new e-mail has to prove it is reachable before it replaces the old one, and a password
 * change asks for the current password and ends every other session. Those are consequences worth
 * a deliberate step — so each opens in place, closed by default, rather than sitting open among
 * the fields where an accidental submit would sign the person out of their other devices.</p>
 */
export function AccountPersonalDataPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me } = useAuth();
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const profile = me?.user;

  return (
    <CitizenShell title={t('citizen.profile.personalData.label')} onBack={() => navigate('/profile')}>
      {!profile ? (
        <p className="lx-text-meta">{t('common.loading')}</p>
      ) : (
        <CardStack>
          <Card>
            <SectionHeader
              title={t('citizen.profile.personalData.label')}
              description={t('citizen.profile.personalData.description')}
            />
            {/* Seeded from the server's copy, so it never renders half-empty while `/me` is in
                flight and never shows what a previous edit believed it had sent. */}
            <ProfileForm profile={profile} />
          </Card>

          <Card>
            {/* The section says what this is; the verification notice belongs to the form and is
                shown when the form opens. Printing it twice makes the screen look like it is
                warning about two different things. */}
            <SectionHeader title={t('user.field.email')} description={t('account.email.meta')} />
            <p className="lx-text-body" style={{ margin: '0 0 var(--lx-space-3) 0' }}>
              <span style={{ marginInlineEnd: 'var(--lx-space-2)' }}>{profile.email}</span>
              {profile.emailVerified ? <Badge tone="success">{t('profile.verifiedBadge')}</Badge> : null}
            </p>
            {emailOpen ? (
              <ChangeEmailForm currentEmail={profile.email} />
            ) : (
              <Button type="button" variant="secondary" onClick={() => setEmailOpen(true)}>
                {t('account.email.changeCta')}
              </Button>
            )}
          </Card>

          <Card>
            <SectionHeader title={t('citizen.profile.security.label')} description={t('account.password.meta')} />
            {passwordOpen ? (
              <ChangePasswordForm onSignedOut={() => navigate('/login')} />
            ) : (
              <Button type="button" variant="secondary" onClick={() => setPasswordOpen(true)}>
                {t('account.password.changeCta')}
              </Button>
            )}
          </Card>
        </CardStack>
      )}
    </CitizenShell>
  );
}
