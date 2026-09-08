import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@luparx/features';
import { AuthScreen } from '@luparx/ui';
import { useTranslation } from '@luparx/i18n';
import { API_BASE_URL, PORTAL } from '../env';

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <AuthScreen heroTitle={t('app.tagline')} heroDescription={t('auth.hero.description')}>
      <LoginForm
        portal={PORTAL}
        apiBaseUrl={API_BASE_URL}
        subtitle={t('auth.portal.admin.title')}
        onMfaRequired={() => navigate('/mfa')}
        onSuccess={() => navigate('/')}
        forgotPasswordHref="/forgot-password"
        registerHref="/register"
      />
    </AuthScreen>
  );
}
