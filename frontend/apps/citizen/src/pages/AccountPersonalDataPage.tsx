import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { ProfileForm } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import { Card } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';

/** Personal data of CONTRACT.md §2, editable — the same fields as registration (v0.3 §"Perfil editable"). */
export function AccountPersonalDataPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me } = useAuth();

  return (
    <CitizenShell title={t('citizen.profile.personalData.label')} onBack={() => navigate('/profile')}>
      <Card>
        {/* The form is seeded from the server's copy of the profile, so it never renders half-empty
            while `/me` is still in flight. */}
        {me?.user ? <ProfileForm profile={me.user} /> : <p>{t('common.loading')}</p>}
      </Card>
    </CitizenShell>
  );
}
