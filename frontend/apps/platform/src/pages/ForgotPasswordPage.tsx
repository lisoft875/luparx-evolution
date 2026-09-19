import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ForgotPasswordForm } from '@luparx/features';
import { CenteredLayout } from '@luparx/ui';

export function ForgotPasswordPage(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <CenteredLayout>
      <ForgotPasswordForm onBackToLogin={() => navigate('/login')} />
    </CenteredLayout>
  );
}
