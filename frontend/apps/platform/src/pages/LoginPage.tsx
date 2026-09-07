import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@luparx/features';
import { Brand, CenteredLayout } from '@luparx/ui';
import { useTranslation } from '@luparx/i18n';
import { API_BASE_URL, PORTAL } from '../env';

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <CenteredLayout>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--lx-space-4)' }}>
        <Brand name={t('app.name')} tagline={t('auth.portal.platform.title')} size={36} />
      </div>
      <p className="lx-field__hint">{t('auth.login.mfaMandatoryNotice')}</p>
      <LoginForm
        portal={PORTAL}
        apiBaseUrl={API_BASE_URL}
        onMfaRequired={() => navigate('/mfa')}
        onSuccess={() => navigate('/tenants')}
        forgotPasswordHref="/forgot-password"
      />
    </CenteredLayout>
  );
}
