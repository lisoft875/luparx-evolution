import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { TenantSelector } from '@luparx/features';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Button } from '@luparx/ui';

/**
 * The first step after signing in when the account belongs to several municipalities
 * (CONTRACT.md v0.4). Full-screen and outside the app shell on purpose: there is no bottom tab bar
 * to offer yet, because every destination in it means something different depending on the answer
 * given here.
 *
 * Signing out is the one action always available. An account whose only membership was revoked
 * lands here with nothing to choose, and a screen with no way off it is a trap.
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
