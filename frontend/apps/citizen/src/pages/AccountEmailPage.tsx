import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { ChangeEmailForm } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import { Card } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';

/** E-mail change with verification (CONTRACT.md v0.3 §"Perfil editable"). */
export function AccountEmailPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me } = useAuth();

  return (
    <CitizenShell title={t('account.email.title')} onBack={() => navigate('/profile')}>
      <Card>
        {me?.user ? <ChangeEmailForm currentEmail={me.user.email} /> : <p>{t('common.loading')}</p>}
      </Card>
    </CitizenShell>
  );
}
