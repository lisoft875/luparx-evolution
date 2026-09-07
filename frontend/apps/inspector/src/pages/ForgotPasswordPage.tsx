import * as React from 'react';
import { ForgotPasswordForm } from '@luparx/features';
import { CenteredLayout } from '@luparx/ui';

export function ForgotPasswordPage(): React.JSX.Element {
  return (
    <CenteredLayout>
      <ForgotPasswordForm />
    </CenteredLayout>
  );
}
