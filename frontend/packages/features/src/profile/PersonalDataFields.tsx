import * as React from 'react';
import { useEffect, useMemo } from 'react';
import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
} from 'react-hook-form';
import type { ApiClient } from '@luparx/api-client';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import { AddressFields, CountrySelect, DateField, FormField, Input, PhoneField, Select } from '@luparx/ui';
import { useAdminLevels, useCountries, useDocumentTypes } from '../catalogHooks';
import { preselectedDocumentType } from '../documentTypeSelection';
import type { PersonalDataValues } from './personalData';

export interface PersonalDataFieldsProps<TValues extends PersonalDataValues> {
  apiClient: ApiClient;
  control: Control<TValues>;
  register: UseFormRegister<TValues>;
  setValue: UseFormSetValue<TValues>;
  watch: UseFormWatch<TValues>;
  errors: FieldErrors<PersonalDataValues>;
  /** Rendered between the address block and the phone block — registration slots its municipality picker here. */
  afterAddress?: React.ReactNode;
}

/**
 * The personal-data fields of CONTRACT.md §2, in the contract's order, rendered once and used by
 * both the registration form and the "my account" screen (CONTRACT.md v0.3 §"Perfil editable").
 *
 * Every list — countries, identity-document types, the address levels themselves — comes from the
 * catalog, so a new country is a row in the database and not a change here. The administrative
 * divisions cascade: choosing a country reloads its levels, and choosing a level reloads the one
 * below it.
 *
 * The component takes react-hook-form's own handles rather than owning the form: the two screens
 * submit to different endpoints and have different neighbouring fields, and only the form owner
 * can know what "submit" means.
 */
export function PersonalDataFields<TValues extends PersonalDataValues>({
  apiClient,
  control,
  register,
  setValue,
  watch,
  errors,
  afterAddress,
}: PersonalDataFieldsProps<TValues>): React.JSX.Element {
  const { t } = useTranslation();
  /** Catalog `labelKey` values are data (server-driven, per CONTRACT.md §2/§5), not statically known TranslationKeys. */
  const tKey = (key: string): string => t(key as TranslationKey);

  // The generic parameter buys type safety at the call sites; inside, the field paths are the
  // fixed set declared by PersonalDataValues, which TypeScript cannot narrow through TValues.
  const path = (name: keyof PersonalDataValues) => name as unknown as never;

  const countriesQuery = useCountries(apiClient);
  const countries = countriesQuery.data ?? [];

  const identityDocumentCountryCode = String(watch(path('identityDocumentCountryCode')) ?? '');
  const addressCountryCode = String(watch(path('addressCountryCode')) ?? '');
  const phoneCountryCode = String(watch(path('phoneCountryCode')) ?? '');

  const documentTypesQuery = useDocumentTypes(apiClient, identityDocumentCountryCode || undefined);

  // The country decides which document its residents carry, and the catalogue says so; asking
  // someone to pick "cédula" out of five options every single time is asking them to restate what
  // the country already declared. The choice itself lives in `preselectedDocumentType`, shared with
  // every other screen that asks for a document, so the five of them cannot drift apart.
  //
  // Only ever fills an empty field: a saved profile, or a choice already made in this session, is
  // never overwritten by the default.
  const documentTypes = documentTypesQuery.data;
  const selectedDocumentType = String(watch(path('identityDocumentType')) ?? '');
  useEffect(() => {
    if (selectedDocumentType) return;
    const preferred = preselectedDocumentType(documentTypes);
    if (preferred) setValue(path('identityDocumentType'), preferred as never, { shouldDirty: false });
  }, [documentTypes, selectedDocumentType, setValue]);
  const adminLevelsQuery = useAdminLevels(apiClient, addressCountryCode || undefined);

  const level1Id = String(watch(path('addressLevel1Id')) ?? '');
  const level2Id = String(watch(path('addressLevel2Id')) ?? '');
  const level3Id = String(watch(path('addressLevel3Id')) ?? '');
  const line1 = String(watch(path('addressLine1')) ?? '');
  const line2 = String(watch(path('addressLine2')) ?? '');
  const postalCode = String(watch(path('addressPostalCode')) ?? '');

  const addressValue = useMemo(
    () => ({
      countryCode: addressCountryCode,
      level1Id,
      level2Id: level2Id || undefined,
      level3Id: level3Id || undefined,
      line1,
      line2,
      postalCode,
    }),
    [addressCountryCode, level1Id, level2Id, level3Id, line1, line2, postalCode],
  );

  return (
    <>
      <h2>{t('auth.register.section.name')}</h2>
      <FormField label={t('user.field.givenName')} error={errors.givenName?.message}>
        {({ inputId, describedBy }) => (
          <Input id={inputId} aria-describedby={describedBy} invalid={!!errors.givenName} {...register(path('givenName'))} />
        )}
      </FormField>
      <FormField label={t('user.field.familyName')} error={errors.familyName?.message}>
        {({ inputId, describedBy }) => (
          <Input id={inputId} aria-describedby={describedBy} invalid={!!errors.familyName} {...register(path('familyName'))} />
        )}
      </FormField>
      <FormField label={t('user.field.secondFamilyName')} optionalLabel={t('common.optional')}>
        {({ inputId }) => <Input id={inputId} {...register(path('secondFamilyName'))} />}
      </FormField>

      <h2>{t('auth.register.section.identityDocument')}</h2>
      <FormField label={t('user.field.identityDocument.countryCode')} error={errors.identityDocumentCountryCode?.message}>
        {({ inputId }) => (
          <Controller
            control={control}
            name={path('identityDocumentCountryCode')}
            render={({ field }) => (
              <CountrySelect
                id={inputId}
                countries={countries}
                value={String(field.value ?? '')}
                onChange={(code) => {
                  field.onChange(code);
                  // The type list is per country: keeping a stale selection would submit a type
                  // the new country does not issue.
                  setValue(path('identityDocumentType'), '' as never);
                }}
                onBlur={field.onBlur}
                placeholder={t('common.select.placeholder')}
                invalid={!!errors.identityDocumentCountryCode}
              />
            )}
          />
        )}
      </FormField>
      {/* Controlled, not `register`d: the options arrive from the catalog after the form is
          seeded, and an uncontrolled <select> whose value matches none of its (still empty)
          options silently snaps to the first one that appears — which is how an account holding a
          passport came to show up as a residency card. */}
      <FormField label={t('user.field.identityDocument.type')} error={errors.identityDocumentType?.message}>
        {({ inputId, describedBy }) => (
          <Controller
            control={control}
            name={path('identityDocumentType')}
            render={({ field }) => (
              <Select
                id={inputId}
                aria-describedby={describedBy}
                invalid={!!errors.identityDocumentType}
                placeholder={t('common.select.placeholder')}
                disabled={!identityDocumentCountryCode}
                options={(documentTypesQuery.data ?? []).map((docType) => ({
                  value: docType.type,
                  label: tKey(docType.labelKey),
                }))}
                value={String(field.value ?? '')}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
              />
            )}
          />
        )}
      </FormField>
      <FormField label={t('user.field.identityDocument.number')} error={errors.identityDocumentNumber?.message}>
        {({ inputId, describedBy }) => (
          <Input
            id={inputId}
            aria-describedby={describedBy}
            invalid={!!errors.identityDocumentNumber}
            {...register(path('identityDocumentNumber'))}
          />
        )}
      </FormField>

      <h2>{t('auth.register.section.address')}</h2>
      <FormField label={t('user.field.address.country')} error={errors.addressCountryCode?.message}>
        {({ inputId }) => (
          <Controller
            control={control}
            name={path('addressCountryCode')}
            render={({ field }) => (
              <CountrySelect
                id={inputId}
                countries={countries}
                value={String(field.value ?? '')}
                onChange={(code) => {
                  field.onChange(code);
                  // Divisions belong to a country: the whole cascade resets, top down.
                  setValue(path('addressLevel1Id'), '' as never);
                  setValue(path('addressLevel2Id'), '' as never);
                  setValue(path('addressLevel3Id'), '' as never);
                }}
                onBlur={field.onBlur}
                placeholder={t('common.select.placeholder')}
                invalid={!!errors.addressCountryCode}
              />
            )}
          />
        )}
      </FormField>
      <AddressFields
        adminLevels={adminLevelsQuery.data ?? []}
        value={addressValue}
        onChange={(next) => {
          setValue(path('addressLevel1Id'), next.level1Id as never);
          setValue(path('addressLevel2Id'), (next.level2Id ?? '') as never);
          setValue(path('addressLevel3Id'), (next.level3Id ?? '') as never);
          setValue(path('addressLine1'), next.line1 as never);
          setValue(path('addressLine2'), (next.line2 ?? '') as never);
          setValue(path('addressPostalCode'), (next.postalCode ?? '') as never);
        }}
        loadDivisions={(level, parentId) =>
          apiClient.catalog.divisions(addressCountryCode, { level, parentId: parentId ?? undefined })
        }
        resolveLabel={tKey}
        line1Label={t('user.field.address.line1')}
        line2Label={t('user.field.address.line2')}
        postalCodeLabel={t('user.field.address.postalCode')}
        optionalLabel={t('common.optional')}
        selectPlaceholder={t('common.select.placeholder')}
        loadErrorLabel={t('user.field.address.loadError')}
        retryLabel={t('common.retry')}
        errors={{ level1Id: errors.addressLevel1Id?.message, line1: errors.addressLine1?.message }}
      />

      {afterAddress}

      <h2>{t('auth.register.section.phone')}</h2>
      <FormField label={t('user.field.phone.nationalNumber')} error={errors.phoneNationalNumber?.message}>
        {({ inputId, describedBy }) => (
          <Controller
            control={control}
            name={path('phoneCountryCode')}
            render={({ field: countryField }) => (
              <Controller
                control={control}
                name={path('phoneNationalNumber')}
                render={({ field: numberField }) => (
                  <PhoneField
                    countries={countries}
                    value={{
                      countryCode: String(countryField.value ?? '') || phoneCountryCode,
                      nationalNumber: String(numberField.value ?? ''),
                    }}
                    onChange={(next) => {
                      countryField.onChange(next.countryCode);
                      numberField.onChange(next.nationalNumber);
                    }}
                    onBlur={numberField.onBlur}
                    invalid={!!errors.phoneNationalNumber}
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
      <FormField label={t('user.field.nationalityCode')} error={errors.nationalityCode?.message}>
        {({ inputId }) => (
          <Controller
            control={control}
            name={path('nationalityCode')}
            render={({ field }) => (
              <CountrySelect
                id={inputId}
                countries={countries}
                value={String(field.value ?? '')}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={t('common.select.placeholder')}
                invalid={!!errors.nationalityCode}
              />
            )}
          />
        )}
      </FormField>

      <h2>{t('auth.register.section.birthDate')}</h2>
      <FormField label={t('user.field.birthDate')} error={errors.birthDate?.message}>
        {({ inputId, describedBy }) => (
          <DateField
            id={inputId}
            aria-describedby={describedBy}
            invalid={!!errors.birthDate}
            {...register(path('birthDate'))}
          />
        )}
      </FormField>
    </>
  );
}
