import * as React from 'react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Portal, RegisterResponse } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { useTranslation, detectBrowserLocale, type TranslationKey } from '@luparx/i18n';
import {
  AddressFields,
  Alert,
  Button,
  CountrySelect,
  DateField,
  FormField,
  Input,
  PhoneField,
  Select,
  isValidPhoneInput,
} from '@luparx/ui';
import { useAdminLevels, useCountries, useDocumentTypes, useTenants } from '../catalogHooks';
import { buildRegistrationSchema, REGISTRATION_DEFAULT_VALUES, type RegistrationFormValues } from './schema';
import { toRegisterRequest } from './mapper';

export interface RegistrationFormProps {
  portal: Portal;
  /** Minimum age required to register (CONTRACT.md §2 `birthDate` — "edad mínima configurable, default 18"). */
  minAgeYears?: number;
  termsVersion: string;
  termsUrl?: string;
  onSuccess: (response: RegisterResponse) => void;
}

/**
 * The registration form is identical across all three apps (CONTRACT.md
 * §2): same fields, same order, same validation. Only `portal` (and the
 * chrome around it) differs per app.
 */
export function RegistrationForm({
  portal,
  minAgeYears = 18,
  termsVersion,
  termsUrl,
  onSuccess,
}: RegistrationFormProps): React.JSX.Element {
  const { t } = useTranslation();
  /** Catalog `labelKey` values are data (server-driven, per CONTRACT.md §2/§5), not statically known TranslationKeys. */
  const tKey = (key: string): string => t(key as TranslationKey);
  const { apiClient, register: registerUser } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const countriesQuery = useCountries(apiClient);
  const countries = countriesQuery.data ?? [];

  const { control, register, handleSubmit, watch, formState, setValue } = useForm<RegistrationFormValues>({
    defaultValues: REGISTRATION_DEFAULT_VALUES,
    mode: 'onBlur',
    resolver: (values, context, options) => {
      const documentTypes = documentTypesQueryRef.current;
      const selectedType = documentTypes?.find((d) => d.type === values.identityDocumentType);
      const schema = buildRegistrationSchema({
        minAgeYears,
        requiredTranslation: t('validation.required'),
        emailInvalidTranslation: t('validation.email.invalid'),
        passwordTooShortTranslation: (min) => t('validation.password.tooShort', { min }),
        passwordMismatchTranslation: t('validation.password.mismatch'),
        phoneInvalidTranslation: t('validation.phone.invalid'),
        documentInvalidTranslation: t('validation.document.invalid'),
        ageTooYoungTranslation: (min) => t('validation.age.tooYoung', { min }),
        termsRequiredTranslation: t('validation.terms.required'),
        isValidPhone: (countryCode, nationalNumber) => isValidPhoneInput({ countryCode, nationalNumber }),
        documentPattern: selectedType ? new RegExp(selectedType.pattern) : undefined,
        tenantRequired: portal !== 'citizen',
        tenantRequiredTranslation: t('validation.required'),
      });
      return zodResolver(schema)(values, context, options);
    },
  });

  const identityDocumentCountryCode = watch('identityDocumentCountryCode');
  const addressCountryCode = watch('addressCountryCode');
  const phoneCountryCode = watch('phoneCountryCode');

  const documentTypesQuery = useDocumentTypes(apiClient, identityDocumentCountryCode || undefined);
  const documentTypesQueryRef = { current: documentTypesQuery.data };
  const adminLevelsQuery = useAdminLevels(apiClient, addressCountryCode || undefined);
  const tenantsQuery = useTenants(apiClient, addressCountryCode || undefined);

  const addressValue = useMemo(
    () => ({
      countryCode: addressCountryCode,
      level1Id: watch('addressLevel1Id'),
      level2Id: watch('addressLevel2Id') || undefined,
      level3Id: watch('addressLevel3Id') || undefined,
      line1: watch('addressLine1'),
      line2: watch('addressLine2'),
      postalCode: watch('addressPostalCode'),
    }),
    // watch() itself is the reactive dependency; re-deriving on every render keeps this in sync without missing fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addressCountryCode, watch('addressLevel1Id'), watch('addressLevel2Id'), watch('addressLevel3Id'), watch('addressLine1'), watch('addressLine2'), watch('addressPostalCode')],
  );

  async function onSubmit(values: RegistrationFormValues): Promise<void> {
    setSubmitError(null);
    try {
      const locale = detectBrowserLocale();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await registerUser(
        toRegisterRequest(values, { portal, locale, timeZone, termsVersion }),
      );
      onSuccess(response);
    } catch {
      setSubmitError(t('common.error.generic'));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError ? <Alert tone="danger">{submitError}</Alert> : null}

      <h2>{t('auth.register.section.name')}</h2>
      <FormField label={t('user.field.givenName')} error={formState.errors.givenName?.message}>
        {({ inputId, describedBy }) => (
          <Input id={inputId} aria-describedby={describedBy} invalid={!!formState.errors.givenName} {...register('givenName')} />
        )}
      </FormField>
      <FormField label={t('user.field.familyName')} error={formState.errors.familyName?.message}>
        {({ inputId, describedBy }) => (
          <Input id={inputId} aria-describedby={describedBy} invalid={!!formState.errors.familyName} {...register('familyName')} />
        )}
      </FormField>
      <FormField label={t('user.field.secondFamilyName')} optionalLabel={t('common.optional')}>
        {({ inputId }) => <Input id={inputId} {...register('secondFamilyName')} />}
      </FormField>

      <h2>{t('auth.register.section.identityDocument')}</h2>
      <FormField label={t('user.field.identityDocument.countryCode')} error={formState.errors.identityDocumentCountryCode?.message}>
        {({ inputId }) => (
          <Controller
            control={control}
            name="identityDocumentCountryCode"
            render={({ field }) => (
              <CountrySelect
                id={inputId}
                countries={countries}
                value={field.value}
                onChange={(code) => {
                  field.onChange(code);
                  setValue('identityDocumentType', '');
                }}
                onBlur={field.onBlur}
                placeholder={t('common.select.placeholder')}
                invalid={!!formState.errors.identityDocumentCountryCode}
              />
            )}
          />
        )}
      </FormField>
      <FormField label={t('user.field.identityDocument.type')} error={formState.errors.identityDocumentType?.message}>
        {({ inputId, describedBy }) => (
          <Select
            id={inputId}
            aria-describedby={describedBy}
            invalid={!!formState.errors.identityDocumentType}
            placeholder={t('common.select.placeholder')}
            disabled={!identityDocumentCountryCode}
            options={(documentTypesQuery.data ?? []).map((docType) => ({
              value: docType.type,
              label: tKey(docType.labelKey),
            }))}
            {...register('identityDocumentType')}
          />
        )}
      </FormField>
      <FormField label={t('user.field.identityDocument.number')} error={formState.errors.identityDocumentNumber?.message}>
        {({ inputId, describedBy }) => (
          <Input id={inputId} aria-describedby={describedBy} invalid={!!formState.errors.identityDocumentNumber} {...register('identityDocumentNumber')} />
        )}
      </FormField>

      <h2>{t('auth.register.section.address')}</h2>
      <FormField label={t('user.field.address.country')} error={formState.errors.addressCountryCode?.message}>
        {({ inputId }) => (
          <Controller
            control={control}
            name="addressCountryCode"
            render={({ field }) => (
              <CountrySelect
                id={inputId}
                countries={countries}
                value={field.value}
                onChange={(code) => {
                  field.onChange(code);
                  setValue('addressLevel1Id', '');
                  setValue('addressLevel2Id', '');
                  setValue('addressLevel3Id', '');
                  setValue('tenantId', '');
                }}
                onBlur={field.onBlur}
                placeholder={t('common.select.placeholder')}
                invalid={!!formState.errors.addressCountryCode}
              />
            )}
          />
        )}
      </FormField>
      <AddressFields
        adminLevels={adminLevelsQuery.data ?? []}
        value={addressValue}
        onChange={(next) => {
          setValue('addressLevel1Id', next.level1Id);
          setValue('addressLevel2Id', next.level2Id ?? '');
          setValue('addressLevel3Id', next.level3Id ?? '');
          setValue('addressLine1', next.line1);
          setValue('addressLine2', next.line2 ?? '');
          setValue('addressPostalCode', next.postalCode ?? '');
        }}
        loadDivisions={(level, parentId) => apiClient.catalog.divisions(addressCountryCode, { level, parentId: parentId ?? undefined })}
        resolveLabel={tKey}
        line1Label={t('user.field.address.line1')}
        line2Label={t('user.field.address.line2')}
        postalCodeLabel={t('user.field.address.postalCode')}
        optionalLabel={t('common.optional')}
        errors={{
          level1Id: formState.errors.addressLevel1Id?.message,
          line1: formState.errors.addressLine1?.message,
        }}
      />

      {portal !== 'citizen' || (tenantsQuery.data && tenantsQuery.data.length > 0) ? (
        <FormField label={t('user.field.tenant')} error={formState.errors.tenantId?.message} optionalLabel={portal === 'citizen' ? t('common.optional') : undefined}>
          {({ inputId, describedBy }) => (
            <Select
              id={inputId}
              aria-describedby={describedBy}
              invalid={!!formState.errors.tenantId}
              placeholder={portal === 'citizen' ? t('user.field.tenant.none') : t('common.select.placeholder')}
              options={(tenantsQuery.data ?? []).map((tenant) => ({ value: tenant.id, label: tenant.name }))}
              {...register('tenantId')}
            />
          )}
        </FormField>
      ) : null}

      <h2>{t('auth.register.section.phone')}</h2>
      <FormField label={t('user.field.phone.nationalNumber')} error={formState.errors.phoneNationalNumber?.message}>
        {({ inputId, describedBy }) => (
          <Controller
            control={control}
            name="phoneCountryCode"
            render={({ field: countryField }) => (
              <Controller
                control={control}
                name="phoneNationalNumber"
                render={({ field: numberField }) => (
                  <PhoneField
                    countries={countries}
                    value={{ countryCode: countryField.value || phoneCountryCode, nationalNumber: numberField.value }}
                    onChange={(next) => {
                      countryField.onChange(next.countryCode);
                      numberField.onChange(next.nationalNumber);
                    }}
                    onBlur={numberField.onBlur}
                    invalid={!!formState.errors.phoneNationalNumber}
                    inputId={inputId}
                    describedBy={describedBy}
                  />
                )}
              />
            )}
          />
        )}
      </FormField>

      <h2>{t('auth.register.section.nationality')}</h2>
      <FormField label={t('user.field.nationalityCode')} error={formState.errors.nationalityCode?.message}>
        {({ inputId }) => (
          <Controller
            control={control}
            name="nationalityCode"
            render={({ field }) => (
              <CountrySelect
                id={inputId}
                countries={countries}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={t('common.select.placeholder')}
                invalid={!!formState.errors.nationalityCode}
              />
            )}
          />
        )}
      </FormField>

      <h2>{t('auth.register.section.email')}</h2>
      <FormField label={t('user.field.email')} error={formState.errors.email?.message}>
        {({ inputId, describedBy }) => (
          <Input id={inputId} type="email" autoComplete="email" aria-describedby={describedBy} invalid={!!formState.errors.email} {...register('email')} />
        )}
      </FormField>

      <h2>{t('auth.register.section.birthDate')}</h2>
      <FormField label={t('user.field.birthDate')} error={formState.errors.birthDate?.message}>
        {({ inputId, describedBy }) => (
          <DateField id={inputId} aria-describedby={describedBy} invalid={!!formState.errors.birthDate} {...register('birthDate')} />
        )}
      </FormField>

      <h2>{t('auth.register.section.account')}</h2>
      <FormField label={t('user.field.password')} error={formState.errors.password?.message}>
        {({ inputId, describedBy }) => (
          <Input id={inputId} type="password" autoComplete="new-password" aria-describedby={describedBy} invalid={!!formState.errors.password} {...register('password')} />
        )}
      </FormField>
      <FormField label={t('user.field.confirmPassword')} error={formState.errors.confirmPassword?.message}>
        {({ inputId, describedBy }) => (
          <Input id={inputId} type="password" autoComplete="new-password" aria-describedby={describedBy} invalid={!!formState.errors.confirmPassword} {...register('confirmPassword')} />
        )}
      </FormField>

      <div className="lx-field">
        <label>
          <input type="checkbox" {...register('acceptedTerms')} aria-invalid={!!formState.errors.acceptedTerms || undefined} />{' '}
          {t('terms.accept')}
          {termsUrl ? (
            <>
              {' '}
              <a href={termsUrl} target="_blank" rel="noreferrer">
                {t('terms.viewLink')}
              </a>
            </>
          ) : null}
        </label>
        {formState.errors.acceptedTerms ? (
          <p role="alert" className="lx-field__error">
            {formState.errors.acceptedTerms.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" fullWidth loading={formState.isSubmitting}>
        {t('auth.register.submit')}
      </Button>
    </form>
  );
}
