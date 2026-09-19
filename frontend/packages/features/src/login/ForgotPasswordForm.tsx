import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, FormField, Input } from '@luparx/ui';

export interface ForgotPasswordFormProps {
  /**
   * Volver al login. Lo decide el portal, igual que en `LoginForm.onSuccess`: cada uno monta el
   * login bajo su propio `basename`. Opcional: sin él sólo se muestra el mensaje, como antes.
   */
  onBackToLogin?: () => void;
}

export function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps = {}): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = z.object({ email: z.string().min(1, t('validation.required')).email(t('validation.email.invalid')) });
  const { register, handleSubmit, formState } = useForm<{ email: string }>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: { email: string }): Promise<void> {
    setSubmitError(null);
    try {
      await apiClient.auth.forgotPassword(values);
      setSent(true);
    } catch {
      setSubmitError(t('common.error.generic'));
    }
  }

  if (sent) {
    return (
      <div aria-live="polite">
        <Alert tone="success">{t('auth.forgotPassword.success')}</Alert>
        {/*
          Decir dónde mirar y cuánto dura el enlace evita el reintento que antes mandaba otro correo
          e invalidaba el primero. No se ofrece «reenviar»: el backend mantiene un enfriamiento de
          2 minutos y un botón que parece funcionar sin hacer nada es peor que no tenerlo.
        */}
        <p className="lx-auth-card__notice">{t('auth.forgotPassword.checkInbox')}</p>
        {onBackToLogin ? (
          <Button type="button" variant="secondary" fullWidth onClick={onBackToLogin}>
            {t('auth.forgotPassword.backToLogin')}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <h1>{t('auth.forgotPassword.title')}</h1>
      <p>{t('auth.forgotPassword.description')}</p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
        <FormField label={t('auth.forgotPassword.emailLabel')} error={formState.errors.email?.message}>
          {({ inputId, describedBy }) => (
            <Input id={inputId} type="email" autoComplete="email" aria-describedby={describedBy} invalid={!!formState.errors.email} {...register('email')} />
          )}
        </FormField>
        <Button type="submit" fullWidth loading={formState.isSubmitting}>
          {t('auth.forgotPassword.submit')}
        </Button>
      </form>
    </div>
  );
}
