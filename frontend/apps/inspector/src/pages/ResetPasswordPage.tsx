import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ResetPasswordForm } from '@luparx/features';
import { CenteredLayout } from '@luparx/ui';

export function ResetPasswordPage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  return (
    <CenteredLayout>
      <ResetPasswordForm token={token} />
    </CenteredLayout>
  );
}
