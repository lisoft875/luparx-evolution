import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { LocaleSwitcher, LoginForm } from '@luparx/features';
import { AuthScreen, BRAND_ASSETS } from '@luparx/ui';
import { useTranslation } from '@luparx/i18n';

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <AuthScreen
      heroTitle={t('app.tagline')}
      heroDescription={t('auth.hero.description')}
      localeSwitcher={<LocaleSwitcher variant="compact" />}
      heroImage={BRAND_ASSETS.heroCitizenBg}
    >
      <LoginForm
        subtitle={t('auth.portal.citizen.title')}
        onSuccess={() => navigate('/')}
        forgotPasswordHref="/forgot-password"
        registerHref="/register"
      />
    </AuthScreen>
  );
}
