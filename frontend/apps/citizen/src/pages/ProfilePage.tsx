import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@luparx/auth';
import { LocaleSwitcher, useDocumentTypes } from '@luparx/features';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import type { UserProfile } from '@luparx/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardStack,
  IconChevronRight,
  IconGlobe,
  IconIdCard,
  IconLogout,
  IconMail,
  IconPhone,
  IconPin,
  IconShield,
  IconUser,
  ListRow,
} from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { useDivisions } from '../lib/queries';

function chevronValue(trailing?: React.ReactNode): React.JSX.Element {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--lx-space-2)' }}>
      {trailing}
      <IconChevronRight size={16} />
    </span>
  );
}

/**
 * The address as a person writes it, not as the database stores it.
 *
 * The profile keeps three opaque division ids; the names live in the public catalog, one request
 * per level, each one waiting for the level above it to be known. Whatever has resolved so far is
 * shown — a half-resolved address is still more use than a row that says nothing until every
 * request has come back.
 */
function useAddressSummary(profile: UserProfile | undefined): string | undefined {
  const address = profile?.address;
  const level1 = useDivisions(address?.countryCode, 1, undefined);
  const level2 = useDivisions(address?.countryCode, 2, address?.level1Id);
  const level3 = useDivisions(address?.countryCode, 3, address?.level2Id);

  if (!address) return undefined;
  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | undefined): string | undefined =>
    id ? list?.find((division) => division.id === id)?.name : undefined;

  return (
    [
      address.line1,
      nameOf(level3.data, address.level3Id),
      nameOf(level2.data, address.level2Id),
      nameOf(level1.data, address.level1Id),
    ]
      .filter(Boolean)
      .join(', ') || undefined
  );
}

/**
 * "Mi cuenta" (CONTRACT.md v0.3 §"Perfil editable"), the reference mockup's screen 8: everything
 * the account holds, on one scrollable screen.
 *
 * It used to be an index — seven rows whose only content was the name of another screen — so
 * answering "what phone number does my account have?" cost a navigation, a load and a trip back.
 * Each row now carries its own value, so this screen answers on its own.
 *
 * Every row that can be changed leads to the same place: `/profile/personal`, where name, identity
 * document, phone, address, e-mail and password are all edited (v0.6). Editing used to be split
 * across three destinations by consequence; the consequences are still different and are still
 * confirmed differently, but they are confirmed *there*, in place, rather than by making somebody
 * navigate to find out which screen owns which field.
 */
export function ProfilePage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me, apiClient, logout, status } = useAuth();
  const profile = me?.user;
  const documentTypes = useDocumentTypes(apiClient, profile?.identityDocument?.countryCode);
  const addressSummary = useAddressSummary(profile);

  const fullName = profile
    ? [profile.givenName, profile.familyName, profile.secondFamilyName].filter(Boolean).join(' ')
    : undefined;

  const documentSummary = ((): string | undefined => {
    const document = profile?.identityDocument;
    if (!document) return undefined;
    const label = documentTypes.data?.find((entry) => entry.type === document.type)?.labelKey;
    const typeName = label ? t(label as TranslationKey) : document.type;
    return `${typeName} · ${document.number}`;
  })();

  const phoneSummary = profile?.phone?.nationalNumber || undefined;

  // No loading dead end here either: the profile is either loading, or missing because the
  // session could not be restored, and the second case needs a way out rather than a spinner.
  if (!profile) {
    return (
      <CitizenShell bare>
        <h1 className="lx-text-screen-title">{t('citizen.profile.title')}</h1>
        {status === 'loading' ? (
          <p className="lx-text-meta">{t('common.loading')}</p>
        ) : (
          <Alert tone="danger">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-2)', alignItems: 'flex-start' }}>
              <span>{t('citizen.profile.loadError')}</span>
              <Button type="button" variant="secondary" onClick={() => logout()}>
                {t('auth.logout.action')}
              </Button>
            </div>
          </Alert>
        )}
      </CitizenShell>
    );
  }

  return (
    <CitizenShell bare>
      <h1 className="lx-text-screen-title">{t('citizen.profile.title')}</h1>

      <CardStack>
        <Card>
          <ListRow
            icon={<IconUser size={18} />}
            title={t('citizen.profile.personalData.label')}
            meta={fullName || t('common.empty')}
            value={chevronValue()}
            onClick={() => navigate('/profile/personal')}
          />
        </Card>
        <Card>
          {/* The badge rides with the value, not in the row's trailing slot: an address and a
              status chip competing for that slot squeeze the label into two lines and clip the
              address on a 390px screen. */}
          <ListRow
            icon={<IconMail size={18} />}
            title={t('user.field.email')}
            meta={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}>
                <span>{profile.email}</span>
                {profile.emailVerified ? <Badge tone="success">{t('profile.verifiedBadge')}</Badge> : null}
              </span>
            }
            value={chevronValue()}
            onClick={() => navigate('/profile/personal')}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconPhone size={18} />}
            title={t('citizen.profile.phoneLabel')}
            meta={phoneSummary ?? t('citizen.profile.phone.empty')}
            value={chevronValue()}
            onClick={() => navigate('/profile/personal')}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconIdCard size={18} />}
            title={t('citizen.profile.identification.label')}
            meta={documentSummary ?? t('citizen.profile.identification.empty')}
            value={chevronValue()}
            onClick={() => navigate('/profile/personal')}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconPin size={18} />}
            title={t('citizen.profile.address.label')}
            meta={addressSummary ?? t('citizen.profile.address.empty')}
            value={chevronValue()}
            onClick={() => navigate('/profile/personal')}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconShield size={18} />}
            title={t('citizen.profile.security.label')}
            meta={t('citizen.profile.security.value')}
            value={chevronValue()}
            onClick={() => navigate('/profile/personal')}
          />
        </Card>
        {/* The language row keeps its control in place rather than leading somewhere: switching is
            the whole action, and a dropdown wide enough to hold "Español (Costa Rica)" does not fit
            in a row's trailing value slot on a phone. */}
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
