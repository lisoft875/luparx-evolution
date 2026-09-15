import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiError, NetworkError, type UserProfile } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, isValidPhoneInput } from '@luparx/ui';
import { useDocumentTypes } from '../catalogHooks';
import { PersonalDataFields } from './PersonalDataFields';
import {
  personalDataShape,
  refinePersonalData,
  toPersonalDataValues,
  toUpdateProfileRequest,
  type PersonalDataValues,
} from './personalData';

export interface ProfileFormProps {
  /** The profile as the server last returned it — the form is seeded from this, never from cached form state. */
  profile: UserProfile;
  minAgeYears?: number;
  onSaved?: () => void;
}

/**
 * "My account": the personal data of CONTRACT.md §2, editable (v0.3 §"Perfil editable").
 *
 * The same fields, the same order and the same validation as registration, because they describe
 * the same person — see ./PersonalDataFields. The e-mail is deliberately absent: it is the
 * identity you sign in with, so it moves through its own verified flow (`ChangeEmailForm`), and
 * the password through another (`ChangePasswordForm`).
 */
export function ProfileForm({ profile, minAgeYears = 18, onSaved }: ProfileFormProps): React.JSX.Element {
  /**
   * The registration form stopped asking for a postal address in v0.42, but "my account" still shows
   * it to WHOEVER ALREADY HAS ONE — and that is not a courtesy, it is the difference between hiding
   * a field and deleting somebody's data.
   *
   * Hiding it unconditionally would mean this: a citizen who registered when the address was
   * mandatory opens this screen to change their phone number, saves, and the request goes up with no
   * address — which the server stores as null. Their address is gone, silently, in an action that
   * had nothing to do with it. Nobody asked for that and nobody would notice until it mattered.
   *
   * So the rule is: the field appears if there is something there to edit or remove. New accounts
   * never see it; old ones keep control over what they already gave.
   */
  const hasStoredAddress = Boolean(profile.address?.countryCode);
  const { t } = useTranslation();
  const { apiClient, refreshProfile } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { control, register, handleSubmit, watch, formState, setValue } = useForm<PersonalDataValues>({
    defaultValues: toPersonalDataValues(profile),
    mode: 'onBlur',
    resolver: (values, context, options) => {
      const selectedType = documentTypesRef.current?.find((d) => d.type === values.identityDocumentType);
      const schemaOptions = {
        minAgeYears,
        requiredTranslation: t('validation.required'),
        phoneInvalidTranslation: t('validation.phone.invalid'),
        documentInvalidTranslation: t('validation.document.invalid'),
        ageTooYoungTranslation: (min: number) => t('validation.age.tooYoung', { min }),
        isValidPhone: (countryCode: string, nationalNumber: string) =>
          isValidPhoneInput({ countryCode, nationalNumber }),
        documentPattern: selectedType ? new RegExp(selectedType.pattern) : undefined,
        // Visible y por lo tanto exigida: quien ya tiene dirección no puede dejarla a medias.
        // Para quitarla del todo hay que vaciar el país, y entonces no se envía (ver
        // toUpdateProfileRequest).
        askForAddress: Boolean(profile.address?.countryCode),
      };
      const schema = z
        .object(personalDataShape(schemaOptions))
        .superRefine((v, ctx) => refinePersonalData(v as PersonalDataValues, ctx, schemaOptions));
      return zodResolver(schema as unknown as z.ZodType<PersonalDataValues>)(values, context, options);
    },
  });

  const documentTypesQuery = useDocumentTypes(apiClient, watch('identityDocumentCountryCode') || undefined);
  const documentTypesRef = { current: documentTypesQuery.data };

  async function onSubmit(values: PersonalDataValues): Promise<void> {
    setSubmitError(null);
    setSaved(false);
    try {
      // The account's language and time zone travel with the payload untouched: this screen edits
      // who someone is, not how the interface is presented to them.
      await apiClient.session.updateMe(
        toUpdateProfileRequest(values, { locale: profile.locale, timeZone: profile.timeZone }),
      );
      await refreshProfile();
      setSaved(true);
      onSaved?.();
    } catch (error) {
      // The server's own reference travels with the message: a stable `code` to branch on and a
      // `traceId` that finds the exact request in the log. A bare "something went wrong" costs a
      // whole round-trip with the person reporting it before anyone can even look.
      if (error instanceof NetworkError) setSubmitError(t('common.error.network'));
      else if (error instanceof ApiError) {
        const code = error.code || String(error.status);
        const reference = error.traceId
          ? t('common.error.reference', { code, traceId: error.traceId })
          : t('common.error.referenceNoTrace', { code });
        setSubmitError(`${t('common.error.generic')} ${reference}`);
      } else setSubmitError(t('common.error.generic'));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
      {saved ? <Alert tone="success">{t('account.profile.saved')}</Alert> : null}
      <PersonalDataFields
        askForAddress={hasStoredAddress}
        apiClient={apiClient}
        control={control}
        register={register}
        setValue={setValue}
        watch={watch}
        errors={formState.errors}
      />
      <Button type="submit" fullWidth loading={formState.isSubmitting}>
        {t('common.save')}
      </Button>
    </form>
  );
}
