import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiError, NetworkError } from '@luparx/api-client';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, FormField, Input } from '@luparx/ui';

const MIN_PASSWORD_LENGTH = 10;

interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordFormProps {
  /** Where to send the person once they acknowledge that they have to sign in again. */
  onSignedOut?: () => void;
}

/**
 * Password change from inside the account (CONTRACT.md v0.3 §1.3).
 *
 * The current password is required — an unattended open session must not be enough to take an
 * account over.
 *
 * Succeeding ends every session, *this one included*: the server raises `credentials_version`,
 * which invalidates every access token issued before the change, and revokes the refresh tokens.
 * So the screen says so before submitting rather than reporting it afterwards, and on success it
 * signs out deliberately instead of letting the app discover it through a burst of 401s and a
 * "your session expired" bounce that reads like a failure.
 */
export function ChangePasswordForm({ onSignedOut }: ChangePasswordFormProps = {}): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient, logout } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const schema = z
    .object({
      currentPassword: z.string().min(1, t('validation.required')),
      newPassword: z.string().min(MIN_PASSWORD_LENGTH, t('validation.password.tooShort', { min: MIN_PASSWORD_LENGTH })),
      confirmPassword: z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.newPassword !== values.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('validation.password.mismatch'),
          path: ['confirmPassword'],
        });
      }
    });

  const { register, handleSubmit, formState, reset } = useForm<ChangePasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: ChangePasswordValues): Promise<void> {
    setSubmitError(null);
    setDone(false);
    try {
      await apiClient.session.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      reset();
      setDone(true);
    } catch (error) {
      if (error instanceof NetworkError) {
        setSubmitError(t('common.error.network'));
      } else if (error instanceof ApiError && (error.status === 401 || error.status === 422)) {
        // The server refuses on the current password; saying which field is wrong is not a leak
        // here, the person is already authenticated as themselves.
        setSubmitError(t('account.password.error.currentInvalid'));
      } else {
        setSubmitError(t('common.error.generic'));
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
      {done ? (
        <Alert tone="success">
          {t('account.password.done')}
          <div style={{ marginTop: 'var(--lx-space-3)' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void logout();
                onSignedOut?.();
              }}
            >
              {t('account.password.signInAgain')}
            </Button>
          </div>
        </Alert>
      ) : null}
      <Alert tone="info">{t('account.password.sessionsWarning')}</Alert>
      <FormField label={t('account.password.currentLabel')} error={formState.errors.currentPassword?.message}>
        {({ inputId, describedBy }) => (
          <Input
            id={inputId}
            type="password"
            autoComplete="current-password"
            aria-describedby={describedBy}
            invalid={!!formState.errors.currentPassword}
            {...register('currentPassword')}
          />
        )}
      </FormField>
      <FormField
        label={t('account.password.newLabel')}
        hint={t('validation.password.tooShort', { min: MIN_PASSWORD_LENGTH })}
        error={formState.errors.newPassword?.message}
      >
        {({ inputId, describedBy }) => (
          <Input
            id={inputId}
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            invalid={!!formState.errors.newPassword}
            {...register('newPassword')}
          />
        )}
      </FormField>
      <FormField label={t('account.password.confirmLabel')} error={formState.errors.confirmPassword?.message}>
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
        {t('account.password.submit')}
      </Button>
    </form>
  );
}
