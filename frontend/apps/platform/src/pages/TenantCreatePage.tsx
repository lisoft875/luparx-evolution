import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useCountries } from '@luparx/features';
import { useTranslation, SUPPORTED_LOCALES, type TranslationKey } from '@luparx/i18n';
import type { SelfRegistrationPolicy } from '@luparx/api-client';
import { Alert, Button, FormField, Input, Select } from '@luparx/ui';
import { PlatformShell } from '../components/PlatformShell';

const SELF_REGISTRATION_POLICIES: SelfRegistrationPolicy[] = ['OPEN', 'APPROVAL_REQUIRED', 'INVITE_ONLY'];

export function TenantCreatePage(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const countriesQuery = useCountries(apiClient);

  const [slug, setSlug] = useState('');
  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [locale, setLocale] = useState<string>(SUPPORTED_LOCALES[0]);
  const [timeZone, setTimeZone] = useState('');
  const [selfRegistrationPolicy, setSelfRegistrationPolicy] = useState<SelfRegistrationPolicy>('APPROVAL_REQUIRED');

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.platformTenants.create({
        slug,
        legalName,
        displayName,
        countryCode,
        currencyCode,
        locale,
        timeZone,
        selfRegistrationPolicy,
      }),
    onSuccess: (tenant) => navigate(`/tenants/${tenant.id}`),
  });

  function handleCountryChange(code: string): void {
    setCountryCode(code);
    const country = countriesQuery.data?.find((c) => c.code === code);
    if (country) {
      setCurrencyCode(country.defaultCurrency);
      setLocale(country.defaultLocale);
      setTimeZone(country.defaultTimeZone);
    }
  }

  return (
    <PlatformShell>
      <h1>{t('platform.tenants.create.title')}</h1>
      {createMutation.isError ? <Alert tone="danger">{t('common.error.generic')}</Alert> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        style={{ maxWidth: 480 }}
      >
        <FormField label={t('platform.tenants.create.slugLabel')}>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </FormField>
        <FormField label={t('platform.tenants.create.legalNameLabel')}>
          <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
        </FormField>
        <FormField label={t('platform.tenants.create.displayNameLabel')}>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </FormField>
        <FormField label={t('platform.tenants.create.countryLabel')}>
          <Select
            value={countryCode}
            onChange={(value) => handleCountryChange(value)}
            placeholder={t('common.select.placeholder')}
            options={(countriesQuery.data ?? []).map((c) => ({ value: c.code, label: `${c.flagEmoji} ${t(c.nameKey as TranslationKey)}`.trim() }))}
          />
        </FormField>
        <FormField label={t('platform.tenants.create.currencyLabel')}>
          <Input value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())} maxLength={3} required />
        </FormField>
        <FormField label={t('platform.tenants.create.localeLabel')}>
          <Select
            value={locale}
            onChange={(value) => setLocale(value)}
            options={SUPPORTED_LOCALES.map((l) => ({ value: l, label: l }))}
          />
        </FormField>
        <FormField label={t('platform.tenants.create.timeZoneLabel')}>
          <Input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required />
        </FormField>
        <FormField label={t('platform.tenants.create.selfRegistrationLabel')}>
          <Select
            value={selfRegistrationPolicy}
            onChange={(value) => setSelfRegistrationPolicy(value as SelfRegistrationPolicy)}
            options={SELF_REGISTRATION_POLICIES.map((p) => ({
              value: p,
              label: t(`platform.tenants.create.selfRegistration.${p}` as TranslationKey),
            }))}
          />
        </FormField>
        <Button type="submit" fullWidth loading={createMutation.isPending}>
          {t('platform.tenants.create.submit')}
        </Button>
      </form>
    </PlatformShell>
  );
}
