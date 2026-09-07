import * as React from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RegistrationForm } from '@luparx/features';
import { Alert, CenteredLayout } from '@luparx/ui';
import { useTranslation } from '@luparx/i18n';
import { PORTAL } from '../env';

export function RegisterPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [result, setResult] = useState<{ requiresApproval: boolean } | null>(null);

  if (result) {
    return (
      <CenteredLayout>
        <Alert tone="success">
          {result.requiresApproval ? t('auth.register.success.pendingApproval') : t('auth.register.success.active')}
        </Alert>
        <p>
          <Link to="/login">{t('auth.register.loginLink')}</Link>
        </p>
      </CenteredLayout>
    );
  }

  return (
    <CenteredLayout>
      <h1>{t('auth.register.title')}</h1>
      <RegistrationForm
        portal={PORTAL}
        termsVersion="2026-01"
        onSuccess={(response) => setResult({ requiresApproval: response.requiresApproval })}
      />
      <p>
        <Link to="/login">{t('auth.register.loginLink')}</Link>
      </p>
    </CenteredLayout>
  );
}
