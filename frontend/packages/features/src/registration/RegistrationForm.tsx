import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Portal, RegisterResponse } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { useTranslation, detectBrowserLocale } from '@luparx/i18n';
import { Alert, Button, FormField, Input, Select, isValidPhoneInput } from '@luparx/ui';
import { useDocumentTypes, useTenants } from '../catalogHooks';
import { PersonalDataFields } from '../profile/PersonalDataFields';
import {
  buildRegistrationSchema,
  REGISTRATION_DEFAULT_VALUES,
  type RegistrationFormValues,
} from './schema';
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
  const { apiClient, register: registerUser } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, register, handleSubmit, watch, formState, setValue } =
    useForm<RegistrationFormValues>({
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
          isValidPhone: (countryCode, nationalNumber) =>
            isValidPhoneInput({ countryCode, nationalNumber }),
          documentPattern: selectedType ? new RegExp(selectedType.pattern) : undefined,
          tenantRequired: portal !== 'citizen',
          tenantRequiredTranslation: t('validation.required'),
        });
        return zodResolver(schema)(values, context, options);
      },
    });

  const addressCountryCode = watch('addressCountryCode');

  // Only what registration adds on top of the shared personal fields: the document types feed the
  // resolver's catalog-pattern check, and the municipality list is registration's own extra field.
  const documentTypesQuery = useDocumentTypes(
    apiClient,
    watch('identityDocumentCountryCode') || undefined,
  );
  const documentTypesQueryRef = { current: documentTypesQuery.data };
  const tenantsQuery = useTenants(apiClient, addressCountryCode || undefined);

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

      <PersonalDataFields
        apiClient={apiClient}
        control={control}
        register={register}
        setValue={setValue}
        watch={watch}
        errors={formState.errors}
        afterAddress={
          portal !== 'citizen' || (tenantsQuery.data && tenantsQuery.data.length > 0) ? (
            <FormField
              label={t('user.field.tenant')}
              error={formState.errors.tenantId?.message}
              optionalLabel={portal === 'citizen' ? t('common.optional') : undefined}
            >
              {({ inputId, describedBy }) => (
                <Select
                  id={inputId}
                  aria-describedby={describedBy}
                  invalid={!!formState.errors.tenantId}
                  placeholder={
                    portal === 'citizen'
                      ? t('user.field.tenant.none')
                      : t('common.select.placeholder')
                  }
                  options={(tenantsQuery.data ?? []).map((tenant) => ({
                    value: tenant.id,
                    label: tenant.name,
                  }))}
                  {...register('tenantId')}
                />
              )}
            </FormField>
          ) : null
        }
      />

      <h2>{t('auth.register.section.email')}</h2>
      <FormField label={t('user.field.email')} error={formState.errors.email?.message}>
        {({ inputId, describedBy }) => (
          <Input
            id={inputId}
            type="email"
            autoComplete="email"
            aria-describedby={describedBy}
            invalid={!!formState.errors.email}
            {...register('email')}
          />
        )}
      </FormField>

      <h2>{t('auth.register.section.account')}</h2>
      <FormField label={t('user.field.password')} error={formState.errors.password?.message}>
        {({ inputId, describedBy }) => (
          <Input
            id={inputId}
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            invalid={!!formState.errors.password}
            {...register('password')}
          />
        )}
      </FormField>
      <FormField
        label={t('user.field.confirmPassword')}
        error={formState.errors.confirmPassword?.message}
      >
        {({ inputId, describedBy }) => (
          <Input
            id={inputId}
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            invalid={!!formState.errors.confirmPassword}
            {...register('confirmPassword')}
          />
        )}
      </FormField>

      <div className="lx-field">
        <label>
          <input
            type="checkbox"
            {...register('acceptedTerms')}
            aria-invalid={!!formState.errors.acceptedTerms || undefined}
          />{' '}
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
