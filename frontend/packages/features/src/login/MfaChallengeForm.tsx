import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, FormField, Input } from '@luparx/ui';

export interface MfaChallengeFormProps {
  onSuccess: () => void;
}

const CODE_LENGTH = 6;

/** Second step of login when the account has TOTP enabled (mandatory for admin/inspector, optional for citizen — CONTRACT.md §3). */
export function MfaChallengeForm({ onSuccess }: MfaChallengeFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const { verifyMfa } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = z.object({
    code: z
      .string()
      .length(CODE_LENGTH, t('validation.code.length', { length: CODE_LENGTH }))
      .regex(/^\d+$/, t('validation.code.length', { length: CODE_LENGTH })),
  });
  const { register, handleSubmit, formState } = useForm<{ code: string }>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  });

  async function onSubmit(values: { code: string }): Promise<void> {
    setSubmitError(null);
    try {
      await verifyMfa(values.code);
      onSuccess();
    } catch {
      setSubmitError(t('auth.mfa.error.invalidCode'));
    }
  }

  return (
    <div>
      <h1>{t('auth.mfa.title')}</h1>
      <p>{t('auth.mfa.description')}</p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
        <FormField label={t('auth.mfa.codeLabel')} error={formState.errors.code?.message}>
          {({ inputId, describedBy }) => (
            <Input
              id={inputId}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              aria-describedby={describedBy}
              invalid={!!formState.errors.code}
              {...register('code')}
            />
          )}
        </FormField>
        <Button type="submit" fullWidth loading={formState.isSubmitting}>
          {t('auth.mfa.submit')}
        </Button>
      </form>
    </div>
  );
}
