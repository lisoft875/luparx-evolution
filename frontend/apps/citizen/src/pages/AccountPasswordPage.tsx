import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChangePasswordForm } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import { Card } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';

/** Password change from inside the account (CONTRACT.md v0.3 §1.3). */
export function AccountPasswordPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <CitizenShell title={t('account.password.label')} onBack={() => navigate('/profile')}>
      <Card>
        <ChangePasswordForm onSignedOut={() => navigate('/login')} />
      </Card>
    </CitizenShell>
  );
}
