import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { LocaleSwitcher } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import {
  Button,
  Card,
  CardStack,
  IconChevronRight,
  IconGlobe,
  IconFine,
  IconLogout,
  IconUser,
  IconBell,
  ListRow,
} from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';

/**
 * The "Más" tab: the few destinations that do not earn a tab of their own.
 *
 * <p>Deliberately four entries and no more. This screen used to be the account itself, which meant
 * the tab dropped the person straight into a long form; and fines — a thing people come looking for
 * with some urgency — had no way in at all from the bar. A menu is the right shape here only while
 * it stays this short: the moment it grows into a drawer of everything, it becomes the index that
 * the account screen just stopped being.</p>
 *
 * <p>Language keeps its control in place rather than leading somewhere. Choosing the language *is*
 * the whole action, and a row that navigates to a screen holding one dropdown is a screen that
 * exists to hold a dropdown.</p>
 */
export function MorePage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me, logout } = useAuth();
  const profile = me?.user;
  const fullName = [profile?.givenName, profile?.familyName].filter(Boolean).join(' ');

  return (
    <CitizenShell bare heading={<h1 className="lx-text-screen-title">{t('nav.more')}</h1>}>
      <CardStack>
        <Card>
          <ListRow
            icon={<IconUser size={18} />}
            title={t('citizen.more.profile')}
            meta={fullName || profile?.email || t('common.empty')}
            value={<IconChevronRight size={16} />}
            onClick={() => navigate('/profile')}
          />
        </Card>

        <Card>
          <ListRow
            icon={<IconFine size={18} />}
            title={t('citizen.more.fines')}
            meta={t('citizen.more.fines.meta')}
            value={<IconChevronRight size={16} />}
            onClick={() => navigate('/fines')}
          />
          {/* The bell is the fast way in; this is the discoverable one, and the only place the email
              preference can be found by somebody who is not looking at a notification. */}
          <ListRow
            icon={<IconBell size={18} />}
            title={t('citizen.more.notifications')}
            meta={t('citizen.more.notifications.meta')}
            value={<IconChevronRight size={16} />}
            onClick={() => navigate('/notifications')}
          />
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-3)' }}>
            <span className="lx-list-row__icon" aria-hidden="true">
              <IconGlobe size={18} />
            </span>
            <div>
              <p className="lx-text-card-title" style={{ margin: 0 }}>
                {t('citizen.more.language')}
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
