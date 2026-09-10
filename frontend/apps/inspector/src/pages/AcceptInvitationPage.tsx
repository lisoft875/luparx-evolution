import * as React from 'react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AcceptInvitationForm } from '@luparx/features';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import type { AcceptInvitationResponse } from '@luparx/api-client';
import { Alert, Button, CenteredLayout } from '@luparx/ui';

/**
 * Accepting a post a municipality offered (CONTRACT.md v0.27).
 *
 * <p>Public: whoever opens this link has no account yet, which is the point. The token travels as a
 * path segment rather than a query parameter — it is a credential for one action, and query strings
 * are the part of a URL that ends up in logs and analytics.</p>
 *
 * <p>The account is not signed into automatically once it exists. Signing in with the password they
 * just chose is how the person finds out it works, and it is one honest step instead of a session
 * that appears out of a link.</p>
 */
export function AcceptInvitationPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const [done, setDone] = useState<AcceptInvitationResponse | null>(null);

  if (done) {
    return (
      <CenteredLayout>
        <Alert tone="success">
          <strong>{t('invitation.done.title')}</strong>
          <p style={{ margin: '8px 0 0' }}>
            {t('invitation.done.body', {
              tenant: done.tenantName,
              role: t(`role.${done.role}` as TranslationKey),
            })}
          </p>
        </Alert>
        <Button type="button" fullWidth onClick={() => navigate('/login')}>
          {t('invitation.done.signIn')}
        </Button>
      </CenteredLayout>
    );
  }

  return (
    <CenteredLayout>
      <AcceptInvitationForm token={token ?? ''} onAccepted={setDone} />
    </CenteredLayout>
  );
}
