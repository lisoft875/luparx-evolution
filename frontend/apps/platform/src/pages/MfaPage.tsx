import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { MfaChallengeForm } from '@luparx/features';
import { CenteredLayout } from '@luparx/ui';

export function MfaPage(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <CenteredLayout>
      <MfaChallengeForm onSuccess={() => navigate('/tenants')} />
    </CenteredLayout>
  );
}
