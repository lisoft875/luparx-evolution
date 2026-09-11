import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { LocaleSwitcher, LoginForm } from '@luparx/features';
import { AuthScreen } from '@luparx/ui';
import { useTranslation } from '@luparx/i18n';

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <AuthScreen
      heroTitle={t('app.tagline')}
      heroDescription={t('auth.hero.description')}
      localeSwitcher={<LocaleSwitcher variant="compact" />}
    >
      <LoginForm
        subtitle={t('auth.portal.platform.title')}
        onSuccess={() => navigate('/tenants')}
        forgotPasswordHref="/forgot-password"
      />
    </AuthScreen>
  );
}
