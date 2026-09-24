import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { ENLACE_EXTERNO, LUPARX_SITE_URL, LocaleSwitcher, useIsOnline } from '@luparx/features';
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
  IconOffline,
  IconShield,
  IconSystem,
  ListRow,
  Badge,
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
  const enLinea = useIsOnline();
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

        {/* --- Lo que la especificación del 24-09-2026 agregó al menú ---------------------------
            Estado de conexión, Ayuda y Acerca de LuParX. El estado va EN la fila y no detrás de
            ella por la misma razón que el idioma, que ya estaba escrita arriba: es un hecho, no un
            destino. Y el hook es el mismo que usa el fiscalizador —se mudó a `@luparx/features`—
            en vez de una segunda copia que se desincronice. */}
        <Card>
          <ListRow
            icon={enLinea ? <IconSystem size={18} /> : <IconOffline size={18} />}
            title={t('citizen.more.connection')}
            meta={enLinea ? t('citizen.more.connection.online') : t('citizen.more.connection.offline')}
            value={
              <Badge tone={enLinea ? 'success' : 'warning'}>
                {enLinea ? t('citizen.more.connection.ok') : t('citizen.more.connection.none')}
              </Badge>
            }
          />
          <ListRow
            icon={<IconShield size={18} />}
            title={t('citizen.more.help')}
            meta={t('citizen.more.help.meta')}
            value={<IconChevronRight size={16} />}
            onClick={() => navigate('/help')}
          />
          {/* Un <a> de verdad: abre fuera de la aplicación y la dirección se puede copiar. La URL
              vive en LUPARX_SITE_URL, el mismo sitio único que usa el portal del fiscalizador. */}
          <a className="lx-list-row" href={LUPARX_SITE_URL} {...ENLACE_EXTERNO}>
            <span className="lx-list-row__icon" aria-hidden="true">
              <IconGlobe size={18} />
            </span>
            <span className="lx-list-row__body">
              <span className="lx-list-row__title">{t('citizen.more.about')}</span>
              <span className="lx-list-row__meta">{t('citizen.more.about.meta')}</span>
            </span>
            <span className="lx-list-row__value" aria-hidden="true">
              <IconChevronRight size={16} />
            </span>
          </a>
        </Card>
      </CardStack>

      <Button type="button" variant="ghost" onClick={() => logout()}>
        <IconLogout size={18} /> {t('auth.logout.action')}
      </Button>
    </CitizenShell>
  );
}
