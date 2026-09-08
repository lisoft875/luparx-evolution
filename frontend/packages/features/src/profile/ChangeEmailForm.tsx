import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiError, NetworkError } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, FormField, Input } from '@luparx/ui';

interface ChangeEmailValues {
  newEmail: string;
}

export interface ChangeEmailFormProps {
  /** The address in force today — shown so the person can see what is being replaced, and what still works meanwhile. */
  currentEmail: string;
}

/**
 * E-mail change (CONTRACT.md v0.3 §"Perfil editable").
 *
 * Its own flow, not a field in the profile form: the e-mail is the identity you sign in with, so
 * the new address has to prove it is reachable before it replaces the old one. Until that link is
 * opened, the current address keeps working — which is exactly what the screen says, because
 * someone who believes the change already took effect will try to sign in with an address that
 * does not work yet.
 */
export function ChangeEmailForm({ currentEmail }: ChangeEmailFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const schema = z.object({
    newEmail: z
      .string()
      .transform((value) => value.trim().toLowerCase())
      .superRefine((value, ctx) => {
        if (value.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('validation.required') });
          return;
        }
        if (!z.string().email().safeParse(value).success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('validation.email.invalid') });
          return;
        }
        if (value === currentEmail.trim().toLowerCase()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('account.email.error.sameAsCurrent') });
        }
      }),
  });

  const { register, handleSubmit, formState, reset } = useForm<ChangeEmailValues>({
    resolver: zodResolver(schema),
    defaultValues: { newEmail: '' },
  });

  async function onSubmit(values: ChangeEmailValues): Promise<void> {
    setSubmitError(null);
    setPendingEmail(null);
    try {
      await apiClient.session.changeEmail({ newEmail: values.newEmail });
      setPendingEmail(values.newEmail);
      reset();
    } catch (error) {
      if (error instanceof NetworkError) {
        setSubmitError(t('common.error.network'));
      } else if (error instanceof ApiError && error.status === 409) {
        setSubmitError(t('account.email.error.alreadyInUse'));
      } else {
        setSubmitError(t('common.error.generic'));
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
      {pendingEmail ? <Alert tone="success">{t('account.email.pending', { email: pendingEmail })}</Alert> : null}
      <Alert tone="info">{t('account.email.verificationNotice')}</Alert>
      <FormField label={t('account.email.currentLabel')}>
        {({ inputId }) => <Input id={inputId} value={currentEmail} readOnly disabled />}
      </FormField>
      <FormField label={t('account.email.newLabel')} error={formState.errors.newEmail?.message}>
        {({ inputId, describedBy }) => (
          <Input
            id={inputId}
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={describedBy}
            invalid={!!formState.errors.newEmail}
            {...register('newEmail')}
          />
        )}
      </FormField>
      <Button type="submit" fullWidth loading={formState.isSubmitting}>
        {t('account.email.submit')}
      </Button>
    </form>
  );
}
