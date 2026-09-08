import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { LocaleSwitcher } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import {
  Badge,
  Button,
  Card,
  CardStack,
  IconChevronRight,
  IconGlobe,
  IconIdCard,
  IconShield,
  IconLogout,
  IconMail,
  IconUser,
  ListRow,
} from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';

function chevronValue(trailing?: React.ReactNode): React.ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--lx-space-2)' }}>
      {trailing}
      <IconChevronRight size={16} />
    </span>
  );
}

/**
 * "My account" (CONTRACT.md v0.3 §"Perfil editable"): the hub, one row per thing that can be
 * changed and where changing it leads.
 *
 * Personal data, e-mail and password are separate destinations rather than one long form,
 * because they are three different operations with three different consequences: one saves a
 * record, one starts a verification, and one signs your other devices out. There is no two-step
 * verification row: no portal enforces MFA (CONTRACT.md v0.3 §1) and offering a setting that
 * changes nothing would be worse than not offering it.
 */
export function ProfilePage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me, logout } = useAuth();
  const profile = me?.user;
  const fullName = profile ? [profile.givenName, profile.familyName].filter(Boolean).join(' ') : undefined;

  return (
    <CitizenShell bare>
      <h1 className="lx-text-screen-title">{t('citizen.profile.title')}</h1>

      <CardStack>
        <Card>
          <ListRow
            icon={<IconUser size={18} />}
            title={t('citizen.profile.personalData.label')}
            meta={fullName ?? t('common.loading')}
            value={chevronValue()}
            onClick={() => navigate('/profile/personal')}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconMail size={18} />}
            title={t('user.field.email')}
            meta={profile?.email ?? t('common.loading')}
            value={chevronValue(
              profile?.emailVerified ? <Badge tone="success">{t('profile.verifiedBadge')}</Badge> : undefined,
            )}
            onClick={() => navigate('/profile/email')}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconIdCard size={18} />}
            title={t('citizen.profile.identification.label')}
            meta={
              profile?.identityDocument
                ? `${profile.identityDocument.type} · ${profile.identityDocument.number}`
                : t('common.empty')
            }
            value={chevronValue()}
            onClick={() => navigate('/profile/personal')}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconShield size={18} />}
            title={t('account.password.label')}
            meta={t('account.password.meta')}
            value={chevronValue()}
            onClick={() => navigate('/profile/password')}
          />
        </Card>
        {/* The language row is a full-width block rather than a list row: a dropdown wide enough
            to hold "Español (Costa Rica)" does not fit in a row's trailing value slot, and squeezing
            it there collapses the label to one letter per line on a phone. */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-3)' }}>
            <span className="lx-list-row__icon" aria-hidden="true">
              <IconGlobe size={18} />
            </span>
            <div>
              <p className="lx-text-card-title" style={{ margin: 0 }}>
                {t('citizen.profile.language.label')}
              </p>
              <p className="lx-text-meta" style={{ margin: 0 }}>
                {t('account.language.meta')}
              </p>
            </div>
          </div>
          <div style={{ marginTop: 'var(--lx-space-3)' }}>
            <LocaleSwitcher />
          </div>
        </Card>
      </CardStack>

      <Button type="button" variant="ghost" onClick={() => logout()}>
        <IconLogout size={18} /> {t('auth.logout.action')}
      </Button>
    </CitizenShell>
  );
}
