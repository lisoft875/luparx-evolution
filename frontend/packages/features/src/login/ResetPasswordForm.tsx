import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, FormField, Input } from '@luparx/ui';
import { MIN_PASSWORD_LENGTH } from '../passwordPolicy';

/** Cuánto se deja leer «tu contraseña se actualizó» antes de ir al login. */
const SEGUNDOS_ANTES_DEL_LOGIN = 3;

export interface ResetPasswordFormProps {
  token: string;
  /**
   * A dónde va la persona cuando la contraseña YA quedó cambiada.
   *
   * Lo decide el portal y no este componente, por la misma razón que `LoginForm.onSuccess`: los
   * cuatro portales montan el login en su propio `basename` y un `navigate('/login')` escrito acá
   * mandaría al funcionario de una municipalidad al login del ciudadano.
   *
   * Es opcional para no romper a quien ya monta el formulario sin él: sin `onSuccess` no se
   * redirige y se muestra sólo el mensaje, que es el comportamiento anterior.
   */
  onSuccess?: () => void;
}

export function ResetPasswordForm({ token, onSuccess }: ResetPasswordFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const { apiClient } = useAuth();
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restan, setRestan] = useState(SEGUNDOS_ANTES_DEL_LOGIN);

  // Contar y redirigir viven juntos porque son el mismo reloj: si se separan en dos efectos, el
  // número puede llegar a 0 un tick antes o después del salto y se ve un «0 s» colgado.
  //
  // `onSuccess` se lee por referencia y NO va en las dependencias a propósito: los portales lo
  // pasan como flecha nueva en cada render (`onSuccess={() => navigate('/login')}`), así que
  // incluirlo reiniciaría la cuenta en cada render y la persona se quedaría mirando un «3 s» eterno.
  const irAlLogin = React.useRef(onSuccess);
  irAlLogin.current = onSuccess;

  React.useEffect(() => {
    if (!done || !irAlLogin.current) return undefined;
    const reloj = window.setInterval(() => {
      setRestan((quedan) => {
        if (quedan <= 1) {
          window.clearInterval(reloj);
          irAlLogin.current?.();
          return 0;
        }
        return quedan - 1;
      });
    }, 1000);
    // Si la persona toca «Iniciar sesión ahora» y el componente se desmonta, el intervalo tiene que
    // morir con él: si no, dispara un segundo navigate sobre una pantalla que ya cambió.
    return () => window.clearInterval(reloj);
  }, [done]);

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
    // Sin `onSuccess` no hay a dónde ir: se deja el mensaje solo, como antes.
    if (!onSuccess) {
      return <Alert tone="success">{t('auth.resetPassword.success')}</Alert>;
    }
    return (
      <div>
        {/*
          `aria-live="polite"` en el contenedor y no en el Alert: un lector de pantalla tiene que
          anunciar que la contraseña cambió Y que va a moverse sola de pantalla. Un cambio de ruta
          sin aviso previo deja a quien no ve la pantalla sin saber qué pasó.
        */}
        <div aria-live="polite">
          <Alert tone="success">{t('auth.resetPassword.success')}</Alert>
          <p className="lx-auth-card__notice">{t('auth.resetPassword.redirecting')}</p>
        </div>
        {/*
          El botón existe aunque haya cuenta regresiva: esperar sin poder adelantar es la parte que
          molesta de una redirección automática, y en una conexión lenta tres segundos se sienten
          muchos más.
        */}
        <Button type="button" fullWidth onClick={onSuccess}>
          {t('auth.resetPassword.goToLogin')}
          {restan > 0 ? ` (${restan})` : ''}
        </Button>
      </div>
    );
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
