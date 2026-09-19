import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ResetPasswordForm } from '@luparx/features';
import { CenteredLayout } from '@luparx/ui';

export function ResetPasswordPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  return (
    <CenteredLayout>
      <ResetPasswordForm token={token} onSuccess={() => navigate('/login', { replace: true })} />
    </CenteredLayout>
  );
}
