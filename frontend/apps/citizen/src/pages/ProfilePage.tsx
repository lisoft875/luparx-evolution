import * as React from 'react';
import { useState } from 'react';
import { useAuth } from '@luparx/auth';
import { useTranslation, SUPPORTED_LOCALES, type TranslationKey } from '@luparx/i18n';
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
import { MOCK_PROFILE } from '../mocks/parkingDomain';

const LOCALE_NAME_KEY: Record<(typeof SUPPORTED_LOCALES)[number], TranslationKey> = {
  'es-CR': 'locale.name.es-CR',
  'en-US': 'locale.name.en-US',
};

function chevronValue(trailing?: React.ReactNode): React.ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--lx-space-2)' }}>
      {trailing}
      <IconChevronRight size={16} />
    </span>
  );
}

export function ProfilePage(): React.JSX.Element {
  const { t, locale, setLocale } = useTranslation();
  const { me, apiClient, refreshProfile, logout } = useAuth();
  const [securityOpen, setSecurityOpen] = useState(false);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cycleLocale(): void {
    const index = SUPPORTED_LOCALES.indexOf(locale);
    // Non-null: SUPPORTED_LOCALES is a non-empty compile-time constant.
    setLocale(SUPPORTED_LOCALES[(index + 1) % SUPPORTED_LOCALES.length]!);
  }

  async function handleSetupMfa(): Promise<void> {
    setError(null);
    try {
      const result = await apiClient.session.mfaSetup();
      setOtpauthUri(result.otpauthUri);
    } catch {
      setError(t('common.error.generic'));
    }
  }

  async function handleDisableMfa(): Promise<void> {
    setError(null);
    try {
      // A full flow collects a fresh TOTP code first; simplified here for the v0.1 stub.
      await apiClient.session.mfaDisable({ code: '000000' });
      await refreshProfile();
    } catch {
      setError(t('common.error.generic'));
    }
  }

  return (
    <CitizenShell bare>
      <h1 className="lx-text-screen-title">{t('citizen.profile.title')}</h1>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <CardStack>
        <Card>
          <ListRow
            icon={<IconUser size={18} />}
            title={t('citizen.profile.personalData.label')}
            meta={`${MOCK_PROFILE.givenName} ${MOCK_PROFILE.familyName}`}
            value={chevronValue()}
            onClick={() => undefined}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconMail size={18} />}
            title={t('user.field.email')}
            meta={MOCK_PROFILE.email}
            value={chevronValue(MOCK_PROFILE.emailVerified ? <Badge tone="success">{t('profile.verifiedBadge')}</Badge> : undefined)}
            onClick={() => undefined}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconPhone size={18} />}
            title={t('citizen.profile.phoneLabel')}
            meta={MOCK_PROFILE.phoneNational}
            value={chevronValue()}
            onClick={() => undefined}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconIdCard size={18} />}
            title={t('citizen.profile.identification.label')}
            meta={t('citizen.profile.identification.value')}
            value={chevronValue()}
            onClick={() => undefined}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconPin size={18} />}
            title={t('citizen.profile.address.label')}
            meta={MOCK_PROFILE.addressLine}
            value={chevronValue()}
            onClick={() => undefined}
          />
        </Card>
        <Card>
          <ListRow
            icon={<IconShield size={18} />}
            title={t('citizen.profile.security.label')}
            meta={t('citizen.profile.security.value')}
            value={chevronValue()}
            onClick={() => setSecurityOpen((open) => !open)}
          />
          {securityOpen ? (
            <div style={{ paddingTop: 'var(--lx-space-3)' }}>
              <p className="lx-text-card-title" style={{ margin: '0 0 var(--lx-space-3) 0' }}>
                {me?.user.mfaEnabled ? t('profile.mfa.enabled') : t('profile.mfa.disabled')}
              </p>
              {me?.user.mfaEnabled ? (
                <Button type="button" variant="secondary" onClick={handleDisableMfa}>
                  {t('auth.mfa.title')}
                </Button>
              ) : (
                <Button type="button" variant="secondary" onClick={handleSetupMfa}>
                  {t('profile.mfa.setup')}
                </Button>
              )}
              {otpauthUri ? (
                <p style={{ wordBreak: 'break-all', marginTop: 'var(--lx-space-2)' }} className="lx-text-meta">
                  {otpauthUri}
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>
        <Card>
          <ListRow
            icon={<IconGlobe size={18} />}
            title={t('citizen.profile.language.label')}
            meta={t(LOCALE_NAME_KEY[locale])}
            value={chevronValue()}
            onClick={cycleLocale}
          />
        </Card>
      </CardStack>

      <Button type="button" variant="ghost" onClick={() => logout()}>
        <IconLogout size={18} /> {t('auth.logout.action')}
      </Button>
    </CitizenShell>
  );
}
