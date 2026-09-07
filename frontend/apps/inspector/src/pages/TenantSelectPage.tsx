import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { TenantSelector } from '@luparx/features';
import { CenteredLayout } from '@luparx/ui';

export function TenantSelectPage(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <CenteredLayout>
      <TenantSelector onSelected={() => navigate('/')} />
    </CenteredLayout>
  );
}
