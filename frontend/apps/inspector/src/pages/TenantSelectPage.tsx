import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { TenantSelector } from '@luparx/features';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Button } from '@luparx/ui';

/**
 * The municipality picker (CONTRACT.md v0.4), full-screen and outside the portal's shell: the shell
 * names the active municipality, so it has nothing to say until this question is answered.
 *
 * Signing out is always available — an account whose last membership was revoked has nothing to
 * choose here, and a screen with no way off it is a trap.
 */
export function TenantSelectPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { logout } = useAuth();

  return (
    <TenantSelector
      onSelected={() => navigate('/', { replace: true })}
      footer={
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void logout().then(() => navigate('/login', { replace: true }));
          }}
        >
          {t('tenant.selector.signOut')}
        </Button>
      }
    />
  );
}
