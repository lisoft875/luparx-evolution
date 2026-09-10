import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { ApiError, NetworkError, type AcceptInvitationResponse } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { useTranslation, detectBrowserLocale, formatDate, type TranslationKey } from '@luparx/i18n';
import { Alert, Button, Card, FormField, Input, SectionHeader, isValidPhoneInput } from '@luparx/ui';
import { useDocumentTypes } from '../catalogHooks';
import { PersonalDataFields } from '../profile/PersonalDataFields';
import {
  PERSONAL_DATA_DEFAULT_VALUES,
  personalDataShape,
  refinePersonalData,
  type PersonalDataValues,
} from '../profile/personalData';

/** §2 in full, plus the password they choose. No email field: the address is the invited one. */
interface AcceptValues extends PersonalDataValues {
  password: string;
  confirmPassword: string;
}

const DEFAULT_VALUES: AcceptValues = { ...PERSONAL_DATA_DEFAULT_VALUES, password: '', confirmPassword: '' };

export interface AcceptInvitationFormProps {
  /** The token out of the link. Never rendered, never put in a query string. */
  token: string;
  minPasswordLength?: number;
  onAccepted: (response: AcceptInvitationResponse) => void;
}

/**
 * Accepting a post a municipality offered (CONTRACT.md v0.27).
 *
 * <p>The same form in the municipal portal and in the enforcement app, because it describes the same
 * person and the server validates it the same way. What it is missing compared with the old
 * administrator-typed form is the point of the whole feature: <b>nobody else is typing this</b>. The
 * person entering their identity document is the one holding it, which matters because that value is
 * unique across the platform — a typo there is not a formatting slip that an edit fixes later, it is
 * the wrong identity, sitting on a number that belongs to somebody else.</p>
 *
 * <p>There is no email field either. The address is the one the invitation was sent to, and the
 * server takes it from the stored invitation rather than from this form: a body that could carry an
 * address would turn an invitation into a way to open an account on somebody else's mailbox.</p>
 *
 * <p>Nothing here is rendered until the invitation has been read back from the server. A dead or
 * withdrawn link must say so before somebody spends five minutes filling in a form that cannot be
 * submitted.</p>
 */
export function AcceptInvitationForm({
  token,
  minPasswordLength = 10,
  onAccepted,
}: AcceptInvitationFormProps): React.JSX.Element {
  const { t, locale } = useTranslation();
  const { apiClient } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => apiClient.invitations.preview(token),
    // A dead link does not become alive by asking again, and each retry is a request from somebody
    // who is already looking at an error.
    retry: false,
    gcTime: 0,
  });

  const documentTypesRef = React.useRef<ReturnType<typeof useDocumentTypes>['data']>(undefined);

  const { control, register, handleSubmit, watch, formState, setValue } = useForm<AcceptValues>({
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
          password: z
            .string()
            .min(minPasswordLength, t('validation.password.tooShort', { min: minPasswordLength })),
          confirmPassword: z.string().min(1, t('validation.required')),
        })
        .superRefine((v, ctx) => {
          refinePersonalData(v as PersonalDataValues, ctx, schemaOptions);
          if (v.password !== v.confirmPassword) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['confirmPassword'],
              message: t('validation.password.mismatch'),
            });
          }
        });
      return zodResolver(schema as unknown as z.ZodType<AcceptValues>)(values, context, options);
    },
  });

  const documentCountry = String(watch('identityDocumentCountryCode') ?? '');
  const documentTypes = useDocumentTypes(apiClient, documentCountry || undefined);
  documentTypesRef.current = documentTypes.data;

  async function onSubmit(values: AcceptValues): Promise<void> {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const response = await apiClient.invitations.accept(token, {
        givenName: values.givenName.trim(),
        familyName: values.familyName.trim(),
        secondFamilyName: values.secondFamilyName.trim() || undefined,
        identityDocument: {
          countryCode: values.identityDocumentCountryCode,
          type: values.identityDocumentType as Exclude<AcceptValues['identityDocumentType'], ''>,
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
        password: values.password,
        locale: detectBrowserLocale(),
      });
      onAccepted(response);
    } catch (error) {
      setSubmitError(describe(error));
    } finally {
      setSubmitting(false);
    }
  }

  function describe(error: unknown): string {
    if (error instanceof NetworkError) return t('common.error.network');
    if (!(error instanceof ApiError)) return t('common.error.generic');
    const known: Record<string, TranslationKey> = {
      INVITATION_NOT_FOUND: 'invitation.error.notFound',
      INVITATION_EXPIRED: 'invitation.error.expired',
      INVITATION_ALREADY_ACCEPTED: 'invitation.error.alreadyAccepted',
      // The address was invited and, between the invitation and this submit, registered anyway.
      EMAIL_ALREADY_REGISTERED: 'invitation.error.alreadyAccepted',
      DOCUMENT_ALREADY_REGISTERED: 'invitation.error.documentTaken',
    };
    const key = known[error.code];
    return key ? t(key) : t('common.error.generic');
  }

  if (preview.isLoading) {
    return <p>{t('common.loading')}</p>;
  }
  if (preview.isError) {
    // The reason matters: "expired" is something the person can act on by asking for it again,
    // "not found" is not, and one message for both would send them looking for a mistake of theirs.
    return <Alert tone="danger">{describe(preview.error)}</Alert>;
  }

  const invitation = preview.data;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card>
        <SectionHeader
          title={t('invitation.title', { tenant: invitation?.tenantName ?? '' })}
          description={t('invitation.description', {
            role: t(`role.${invitation?.role}` as TranslationKey),
            email: invitation?.email ?? '',
          })}
        />
        <p className="lx-text-meta">
          {t('invitation.expires', {
            date: invitation ? formatDate(invitation.expiresAt, locale) : '',
          })}
        </p>
      </Card>

      {submitError ? <Alert tone="danger">{submitError}</Alert> : null}

      <PersonalDataFields
        apiClient={apiClient}
        control={control}
        register={register}
        setValue={setValue}
        watch={watch}
        errors={formState.errors}
      />

      <h2>{t('auth.register.section.account')}</h2>
      {/* Said where the password is chosen, not in the mail: this is the moment somebody wonders
          whether the municipality will be able to sign in as them. It will not. */}
      <p className="lx-text-meta">{t('invitation.passwordIsYours')}</p>
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
      <FormField label={t('user.field.confirmPassword')} error={formState.errors.confirmPassword?.message}>
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

      <Button type="submit" fullWidth loading={submitting}>
        {t('invitation.submit')}
      </Button>
    </form>
  );
}
