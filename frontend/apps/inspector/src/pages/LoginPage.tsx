import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@luparx/features';
import { CenteredLayout } from '@luparx/ui';
import { useTranslation } from '@luparx/i18n';
import { API_BASE_URL, PORTAL } from '../env';

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <CenteredLayout>
      <p className="lx-field__hint">{t('auth.portal.inspector.title')}</p>
      <LoginForm
        portal={PORTAL}
        apiBaseUrl={API_BASE_URL}
        onMfaRequired={() => navigate('/mfa')}
        onSuccess={() => navigate('/')}
        forgotPasswordHref="/forgot-password"
        registerHref="/register"
      />
    </CenteredLayout>
  );
}
