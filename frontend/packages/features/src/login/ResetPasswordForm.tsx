import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, FormField, Input } from '@luparx/ui';
import { MIN_PASSWORD_LENGTH } from '../passwordPolicy';

export interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = z
    .object({
      newPassword: z.string().min(MIN_PASSWORD_LENGTH, t('validation.password.tooShort', { min: MIN_PASSWORD_LENGTH })),
      confirmPassword: z.string(),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      message: t('validation.password.mismatch'),
      path: ['confirmPassword'],
    });
  const { register, handleSubmit, formState } = useForm<{ newPassword: string; confirmPassword: string }>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: { newPassword: string }): Promise<void> {
    setSubmitError(null);
    try {
      await apiClient.auth.resetPassword({ token, newPassword: values.newPassword });
      setDone(true);
    } catch {
      setSubmitError(t('common.error.generic'));
    }
  }

  if (done) {
    return <Alert tone="success">{t('auth.resetPassword.success')}</Alert>;
  }

  return (
    <div>
      <h1>{t('auth.resetPassword.title')}</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
        <FormField label={t('auth.resetPassword.newPasswordLabel')} error={formState.errors.newPassword?.message}>
          {({ inputId, describedBy }) => (
            <Input id={inputId} type="password" autoComplete="new-password" aria-describedby={describedBy} invalid={!!formState.errors.newPassword} {...register('newPassword')} />
          )}
        </FormField>
        <FormField label={t('auth.resetPassword.confirmPasswordLabel')} error={formState.errors.confirmPassword?.message}>
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
        <Button type="submit" fullWidth loading={formState.isSubmitting}>
          {t('auth.resetPassword.submit')}
        </Button>
      </form>
    </div>
  );
}
