import * as React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { usePermissions } from '@luparx/auth';
import { AdminShell } from '../components/AdminShell';

export function HomePage(): React.JSX.Element {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { has } = usePermissions();

  return (
    <AdminShell>
      <h1>{t('app.name')}</h1>
      {me ? (
        <p>
          {me.user.givenName} {me.user.familyName}
        </p>
      ) : null}
      <ul>
        {has('USER_READ') ? (
          <li>
            <Link to="/users">{t('nav.users')}</Link>
          </li>
        ) : null}
        {has('AUDIT_READ') ? (
          <li>
            <Link to="/audit">{t('nav.audit')}</Link>
          </li>
        ) : null}
        {has('EXPORT_RUN') ? (
          <li>
            <Link to="/reports">{t('nav.reports')}</Link>
          </li>
        ) : null}
      </ul>
    </AdminShell>
  );
}
