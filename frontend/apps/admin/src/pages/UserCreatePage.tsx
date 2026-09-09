import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, NetworkError, TENANT_GRANTABLE_ROLES, type Role } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import {
  PERSONAL_DATA_DEFAULT_VALUES,
  PersonalDataFields,
  personalDataShape,
  refinePersonalData,
  useDocumentTypes,
  type PersonalDataValues,
} from '@luparx/features';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import { Alert, Button, Card, FormField, Input, SectionHeader, Select, isValidPhoneInput } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';

/** The form is the personal data of §2 plus the two things only an administrator supplies. */
interface StaffValues extends PersonalDataValues {
  email: string;
  role: Role | '';
}

const DEFAULT_VALUES: StaffValues = { ...PERSONAL_DATA_DEFAULT_VALUES, email: '', role: '' };

/**
 * Creating a member of staff of this municipality — an inspector, most of the time
 * (CONTRACT.md v0.14).
 *
 * <p>It is the registration form's fields, in the contract's order, because it describes the same
 * kind of person and the server validates it the same way; what it is missing is a password and a
 * terms checkbox, and both absences are the point. The administrator is entering what the
 * employment file says — name, identity document, address, phone, date of birth — and the person
 * themselves receives a link, chooses their own password, and only then can sign in. An
 * administrator who could set the password could sign in as an inspector and write fines in their
 * name.</p>
 *
 * <p>The role list is the platform's, not this screen's: {@code TENANT_GRANTABLE_ROLES} holds the
 * four a municipal administrator may hand out, and the server refuses anything else. Another
 * administrator is not among them — who runs a municipality stays a platform decision.</p>
 */
export function UserCreatePage(): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const documentTypesRef = React.useRef<ReturnType<typeof useDocumentTypes>['data']>(undefined);

  const { control, register, handleSubmit, watch, formState, setValue } = useForm<StaffValues>({
    defaultValues: DEFAULT_VALUES,
    mode: 'onBlur',
    resolver: (values, context, options) => {
      const selectedType = documentTypesRef.current?.find((d) => d.type === values.identityDocumentType);
      const schemaOptions = {
        minAgeYears: 18,
        requiredTranslation: t('validation.required'),
        phoneInvalidTranslation: t('validation.phone.invalid'),
        documentInvalidTranslation: t('validation.document.invalid'),
        ageTooYoungTranslation: (min: number) => t('validation.age.tooYoung', { min }),
        isValidPhone: (countryCode: string, nationalNumber: string) =>
          isValidPhoneInput({ countryCode, nationalNumber }),
        documentPattern: selectedType ? new RegExp(selectedType.pattern) : undefined,
      };
      const schema = z
        .object({
          ...personalDataShape(schemaOptions),
          email: z.string().min(1, t('validation.required')).email(t('validation.email.invalid')),
          role: z.string().min(1, t('validation.required')) as unknown as z.ZodType<Role | ''>,
        })
        .superRefine((v, ctx) => refinePersonalData(v as PersonalDataValues, ctx, schemaOptions));
      return zodResolver(schema as unknown as z.ZodType<StaffValues>)(values, context, options);
    },
  });

  // The document catalogue is loaded by the fields themselves; this mirror is what the resolver
  // reads, since a resolver cannot call a hook.
  const documentCountry = String(watch('identityDocumentCountryCode') ?? '');
  const documentTypes = useDocumentTypes(apiClient, documentCountry || undefined);
  documentTypesRef.current = documentTypes.data;

  async function onSubmit(values: StaffValues): Promise<void> {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const role = values.role as Role;
      const created = await apiClient.adminUsers.create({
        email: values.email.trim(),
        givenName: values.givenName.trim(),
        familyName: values.familyName.trim(),
        secondFamilyName: values.secondFamilyName.trim() || undefined,
        identityDocument: {
          countryCode: values.identityDocumentCountryCode,
          // Non-empty by the time the resolver lets a submit through; the union just cannot say so.
          type: values.identityDocumentType as Exclude<StaffValues['identityDocumentType'], ''>,
          number: values.identityDocumentNumber.trim(),
        },
        address: {
          countryCode: values.addressCountryCode,
          level1Id: values.addressLevel1Id,
          level2Id: values.addressLevel2Id || undefined,
          level3Id: values.addressLevel3Id || undefined,
          line1: values.addressLine1.trim(),
          line2: values.addressLine2.trim() || undefined,
          postalCode: values.addressPostalCode.trim() || undefined,
        },
        phone: { countryCode: values.phoneCountryCode, nationalNumber: values.phoneNationalNumber },
        nationalityCode: values.nationalityCode,
        birthDate: values.birthDate,
        // The portal is decided by the role, never chosen separately: the server refuses a request
        // where the two disagree, so offering it as a second control could only produce that error.
        portal: role === 'INSPECTOR' || role === 'INSPECTOR_LEAD' ? 'inspector' : 'admin',
        role,
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      navigate(`/users/${created.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        // The two that matter are "this person already exists" — very likely, since an inspector
        // may well have registered as a citizen first — and a role this administrator may not
        // grant. Both say what to do next; anything else falls back to the generic sentence rather
        // than to a code nobody can act on.
        const known: Record<string, TranslationKey> = {
          EMAIL_ALREADY_REGISTERED: 'admin.users.create.error.EMAIL_ALREADY_REGISTERED',
          DOCUMENT_ALREADY_REGISTERED: 'admin.users.create.error.DOCUMENT_ALREADY_REGISTERED',
          ROLE_NOT_ALLOWED_FOR_PORTAL: 'admin.users.create.error.ROLE_NOT_ALLOWED_FOR_PORTAL',
        };
        const key = known[error.code];
        setSubmitError(key ? t(key) : t('common.error.generic'));
      } else if (error instanceof NetworkError) {
        setSubmitError(t('common.error.network'));
      } else {
        setSubmitError(t('common.error.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminShell>
      <h1>{t('admin.users.create.title')}</h1>
      <p className="lx-text-meta">{t('admin.users.create.description')}</p>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}

        <Card>
          <SectionHeader
            title={t('admin.users.create.access.label')}
            description={t('admin.users.create.access.description')}
          />
          <FormField label={t('admin.users.create.roleLabel')} error={formState.errors.role?.message}>
            {({ inputId }) => (
              <Select
                id={inputId}
                value={watch('role')}
                onChange={(value) => setValue('role', value as Role, { shouldValidate: true })}
                placeholder={t('common.select.placeholder')}
                options={TENANT_GRANTABLE_ROLES.map((role) => ({
                  value: role,
                  label: t(`role.${role}` as TranslationKey),
                  detail: t(`role.${role}.detail` as TranslationKey),
                }))}
              />
            )}
          </FormField>
          <FormField
            label={t('user.field.email')}
            hint={t('admin.users.create.emailHint')}
            error={formState.errors.email?.message}
          >
            {({ inputId, describedBy }) => (
              <Input id={inputId} aria-describedby={describedBy} type="email" autoComplete="off" {...register('email')} />
            )}
          </FormField>
        </Card>

        <Card>
          <SectionHeader
            title={t('admin.users.create.personalData.label')}
            description={t('admin.users.create.personalData.description')}
          />
          <PersonalDataFields
            apiClient={apiClient}
            control={control}
            register={register}
            setValue={setValue}
            watch={watch}
            errors={formState.errors}
          />
        </Card>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="submit" loading={submitting}>
            {t('admin.users.create.submit')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/users')}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </AdminShell>
  );
}
